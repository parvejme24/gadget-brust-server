// Order rules shared by checkout, order editing and status changes.
// Prices always come from the database; stock moves only through moveStock so it stays audited.
const InvoiceModel = require("./invoice.model");
const PaymentModel = require("../payment/payment.model");
const ProductModel = require("../product/product.model");
const ShippingModel = require("../shipping/shipping.model");
const CouponModel = require("../coupon/coupon.model");
const SettingsModel = require("../settings/settings.model");
const UserModel = require("../user/user.model");
const { priceLines, evaluateCoupon } = require("../coupon/coupon.engine");
const { moveStock } = require("../inventory/inventory.controller");
const { notify } = require("../notification/notification.service");

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];
// statuses where the items have left (or are about to leave) the shelf
const HOLDS_STOCK = ["processing", "shipped", "delivered"];

const STATUS_LABEL = {
  pending: "Order placed",
  processing: "Order accepted",
  shipped: "Handed to courier",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const populateOrder = (query) =>
  query
    .populate("user_id", "fullName email phone")
    .populate("shipment.courier", "name logo color trackingUrl phone")
    .populate("cashier", "fullName")
    .populate("statusHistory.by", "fullName role");

// INV-20261024-0001, numbered per day
const nextInvoiceNumber = async (prefix = "INV") => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const start = `${prefix}-${stamp}-`;
  const last = await InvoiceModel.findOne({ invoiceNumber: { $regex: `^${start}\\d+$` } }).sort({ invoiceNumber: -1 }).select("invoiceNumber");
  const n = last ? Number(last.invoiceNumber.slice(start.length)) + 1 : 1;
  return `${start}${String(n).padStart(4, "0")}`;
};

// merge duplicate product lines: [{ product, qty, price? }]
const mergeLines = (items = []) =>
  Object.values(
    items.reduce((acc, i) => {
      const key = String(i.product);
      const qty = (acc[key]?.qty || 0) + Math.floor(Number(i.qty) || 0);
      acc[key] = { ...acc[key], ...i, product: i.product, qty };
      return acc;
    }, {})
  ).filter((i) => i.qty > 0);

// Price a storefront order exactly as checkout will charge it.
// { items, shippingMethod, couponCode } -> { lines, subtotal, discount, coupon, shippingCharge, shipping, total }
const quoteOrder = async ({ items, shippingMethod, couponCode, userId }) => {
  const merged = mergeLines(items);
  if (!merged.length) throw badRequest("Your cart is empty");
  const lines = await priceLines(merged);
  if (lines.length !== merged.length) throw badRequest("One or more products are no longer available");
  const short = lines.find((l) => l.product.stock < l.qty);
  if (short) {
    throw badRequest(short.product.stock ? `Only ${short.product.stock} "${short.product.title}" left in stock` : `"${short.product.title}" is out of stock`);
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let coupon = null;
  let discount = 0;
  let freeShipping = false;
  if (couponCode) {
    coupon = await CouponModel.findOne({ code: String(couponCode).trim().toUpperCase() });
    const result = await evaluateCoupon(coupon, lines, { userId });
    if (!result.valid) throw badRequest(result.message);
    discount = result.discount;
    freeShipping = result.freeShipping;
  }

  const shipping = shippingMethod ? await ShippingModel.findOne({ _id: shippingMethod, isActive: true }) : null;
  if (!shipping) throw badRequest("Choose a delivery option");
  if (shipping.minOrderAmount && subtotal < shipping.minOrderAmount) {
    throw badRequest(`${shipping.name} needs an order of at least ৳${shipping.minOrderAmount.toLocaleString("en-IN")}`);
  }
  const shippingCharge = freeShipping ? 0 : Math.round(shipping.calculateShippingCharge(subtotal));

  return {
    lines,
    subtotal,
    discount,
    coupon,
    shipping,
    shippingCharge,
    total: Math.max(0, subtotal - discount) + shippingCharge,
  };
};

// take an order's items out of stock, or put them back; undoes partial work on failure
const moveOrderStock = async (invoice, direction, userId) => {
  const done = [];
  try {
    for (const item of invoice.items) {
      if (!item.product) continue;
      const delta = direction === "out" ? -item.qty : item.qty;
      await moveStock({
        productId: item.product,
        delta,
        type: direction === "out" ? "sale" : "return",
        reference: invoice.invoiceNumber,
        invoice: invoice._id,
        user: userId,
        note: direction === "out" ? "Order accepted" : "Order cancelled",
      });
      done.push({ product: item.product, delta });
    }
  } catch (error) {
    for (const d of done) await ProductModel.updateOne({ _id: d.product }, { $inc: { stock: -d.delta } });
    throw badRequest(error.message);
  }
  invoice.stockDeducted = direction === "out";
  if (direction === "out") await alertLowStock(invoice.items.map((i) => i.product));
};

// tell store keepers when an order leaves a product low or empty
const alertLowStock = async (productIds) => {
  const settings = await SettingsModel.findOne({ key: "store" }).select("lowStockThreshold");
  const threshold = settings?.lowStockThreshold ?? 10;
  const products = await ProductModel.find({ _id: { $in: productIds }, stock: { $lte: threshold } }).select("title stock");
  for (const p of products) {
    await notify({
      type: p.stock === 0 ? "stock.out" : "stock.low",
      permission: "inventory",
      title: p.stock === 0 ? `${p.title} is out of stock` : `${p.title} is running low`,
      message: p.stock === 0 ? "Restock it to keep selling." : `Only ${p.stock} left.`,
      link: `/dashboard/inventory?product=${p._id}`,
    });
  }
};

const pushHistory = (invoice, status, { user, note = "" } = {}) => {
  invoice.statusHistory.push({ status, note: String(note).trim(), by: user?._id, byName: user?.fullName, at: new Date() });
};

// cash on delivery is collected when the order is delivered
const settleCashOnDelivery = async (invoice) => {
  if (invoice.paymentMethod !== "cash_on_delivery" || invoice.paymentStatus === "completed") return;
  invoice.paymentStatus = "completed";
  invoice.status = "paid";
  const exists = await PaymentModel.exists({ invoice_id: invoice._id });
  if (!exists) {
    await PaymentModel.create({
      user_id: invoice.user_id?._id || invoice.user_id,
      invoice_id: invoice._id,
      payment_method: "cash_on_delivery",
      amount: invoice.total,
      currency: "BDT",
      status: "completed",
      transaction_id: `${invoice.invoiceNumber}-COD`,
      payment_date: new Date(),
      metadata: { invoiceNumber: invoice.invoiceNumber, source: "cod" },
    });
  }
};

// Change an order's fulfilment status, keeping stock, payment, history and notifications in step.
const changeStatus = async (invoice, status, { userId, note } = {}) => {
  if (!ORDER_STATUSES.includes(status)) throw badRequest("Invalid order status");
  if (invoice.orderStatus === status) return invoice;
  if (invoice.source === "pos") throw badRequest("Counter (POS) sales are already complete");

  const user = userId ? await UserModel.findById(userId).select("fullName") : null;
  const needsStock = HOLDS_STOCK.includes(status);
  if (needsStock && !invoice.stockDeducted) await moveOrderStock(invoice, "out", userId);
  if (!needsStock && invoice.stockDeducted) await moveOrderStock(invoice, "in", userId);

  invoice.orderStatus = status;
  if (status === "cancelled") invoice.status = "cancelled";
  else if (invoice.status === "cancelled") invoice.status = invoice.paymentStatus === "completed" ? "paid" : "pending";
  if (status === "delivered") await settleCashOnDelivery(invoice);
  pushHistory(invoice, status, { user, note });
  await invoice.save();

  const customerId = invoice.user_id?._id || invoice.user_id;
  if (customerId) {
    await notify({
      type: "order.status",
      user: customerId,
      title: `Order ${invoice.invoiceNumber}: ${STATUS_LABEL[status]}`,
      message: status === "shipped" && invoice.shipment?.trackingNumber ? `Tracking number ${invoice.shipment.trackingNumber}` : note || "",
      link: `/dashboard/my-orders/${invoice._id}`,
    });
  }
  return invoice;
};

// Replace an order's items (staff edit). Keeps each kept line's price unless a new one is given,
// prices new lines from the database and moves the stock difference if the order already holds stock.
const replaceItems = async (invoice, items, userId) => {
  const merged = mergeLines(items);
  if (!merged.length) throw badRequest("An order needs at least one product");

  const products = await ProductModel.find({ _id: { $in: merged.map((i) => i.product) } }).select("title price discountPrice stock image");
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));
  const current = Object.fromEntries(invoice.items.map((i) => [String(i.product), i]));

  const next = merged.map((i) => {
    const product = byId[String(i.product)];
    const existing = current[String(i.product)];
    if (!product && !existing) throw badRequest("One or more products no longer exist");
    const listPrice = product ? (product.discountPrice && product.discountPrice < product.price ? product.discountPrice : product.price) : existing.price;
    const price = i.price !== undefined && i.price !== "" ? Math.round(Number(i.price)) : existing?.price ?? listPrice;
    if (!(price >= 0)) throw badRequest("Prices can't be negative");
    return {
      product: i.product,
      title: product?.title || existing.title,
      image: product?.image?.url || existing?.image,
      price,
      qty: i.qty,
    };
  });

  if (invoice.stockDeducted) {
    const before = Object.fromEntries(invoice.items.map((i) => [String(i.product), i.qty]));
    const after = Object.fromEntries(next.map((i) => [String(i.product), i.qty]));
    const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
    const done = [];
    try {
      for (const id of ids) {
        const delta = (before[id] || 0) - (after[id] || 0); // + returns stock, - takes more
        if (!delta) continue;
        await moveStock({
          productId: id,
          delta,
          type: delta < 0 ? "sale" : "return",
          reference: invoice.invoiceNumber,
          invoice: invoice._id,
          user: userId,
          note: "Order edited",
        });
        done.push({ id, delta });
      }
    } catch (error) {
      for (const d of done) await ProductModel.updateOne({ _id: d.id }, { $inc: { stock: -d.delta } });
      throw badRequest(error.message);
    }
    await alertLowStock(next.map((i) => i.product));
  }

  invoice.items = next;
};

// subtotal / tax / total after an edit; tax is kept only on orders that were charged VAT
const recalculate = async (invoice) => {
  invoice.subtotal = invoice.items.reduce((s, i) => s + i.price * i.qty, 0);
  invoice.discount = Math.min(Math.max(0, Math.round(invoice.discount || 0)), invoice.subtotal);
  if (invoice.tax > 0) {
    const settings = await SettingsModel.findOne({ key: "store" }).select("taxRate");
    invoice.tax = Math.round(((invoice.subtotal - invoice.discount) * (settings?.taxRate || 0)) / 100);
  }
  invoice.total = invoice.subtotal - invoice.discount + invoice.tax + (invoice.shippingCharge || 0);
};

module.exports = {
  ORDER_STATUSES,
  STATUS_LABEL,
  badRequest,
  populateOrder,
  nextInvoiceNumber,
  quoteOrder,
  changeStatus,
  replaceItems,
  recalculate,
  pushHistory,
};
