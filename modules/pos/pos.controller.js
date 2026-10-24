const mongoose = require("mongoose");
const InvoiceModel = require("../invoice/invoice.model");
const PaymentModel = require("../payment/payment.model");
const CouponModel = require("../coupon/coupon.model");
const SettingsModel = require("../settings/settings.model");
const UserModel = require("../user/user.model");
const ProductModel = require("../product/product.model");
const StockMovementModel = require("../inventory/stockMovement.model");
const { priceLines, evaluateCoupon } = require("../coupon/coupon.engine");
const { moveStock } = require("../inventory/inventory.controller");
const ResponseUtil = require("../../shared/utils/response.util");

const METHODS = ["cash", "card", "bkash", "nagad"];

const nextMemoNumber = async () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `POS-${stamp}-`;
  const last = await InvoiceModel.findOne({ invoiceNumber: { $regex: `^${prefix}` } }).sort({ invoiceNumber: -1 }).select("invoiceNumber");
  const n = last ? Number(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
};

class PosController {
  // counter sale: { customer: { userId?, name, phone, email }, items: [{ product, qty }], couponCode?, manualDiscount?, includeVat?, paymentMethod, amountPaid?, note? }
  async createSale(req, res, next) {
    const applied = []; // stock changes to undo if something fails
    try {
      const { customer = {}, items = [], couponCode, manualDiscount = 0, includeVat = false, paymentMethod = "cash", amountPaid, note = "" } = req.body;

      if (!items.length) return ResponseUtil.badRequest(res, "Add at least one product");
      if (!METHODS.includes(paymentMethod)) return ResponseUtil.badRequest(res, "Choose a payment method");

      // merge duplicate lines and price them from the database
      const merged = Object.values(
        items.reduce((acc, i) => {
          const key = String(i.product);
          acc[key] = { product: i.product, qty: (acc[key]?.qty || 0) + Math.floor(Number(i.qty) || 0) };
          return acc;
        }, {})
      );
      const lines = await priceLines(merged);
      if (lines.length !== merged.length) return ResponseUtil.badRequest(res, "One or more products no longer exist");
      const short = lines.find((l) => l.product.stock < l.qty);
      if (short) return ResponseUtil.badRequest(res, `Only ${short.product.stock} "${short.product.title}" in stock`);

      let customerUser = null;
      if (customer.userId) {
        if (!mongoose.isValidObjectId(customer.userId)) return ResponseUtil.badRequest(res, "Invalid customer");
        customerUser = await UserModel.findById(customer.userId).select("fullName email phone");
        if (!customerUser) return ResponseUtil.badRequest(res, "Customer not found");
      }

      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

      let coupon = null;
      let couponDiscount = 0;
      if (couponCode) {
        coupon = await CouponModel.findOne({ code: String(couponCode).trim().toUpperCase() });
        const result = await evaluateCoupon(coupon, lines, { userId: customerUser?._id });
        if (!result.valid) return ResponseUtil.badRequest(res, result.message);
        couponDiscount = result.discount;
      }

      const manual = Math.max(0, Math.min(Math.round(Number(manualDiscount) || 0), subtotal - couponDiscount));
      const afterDiscount = subtotal - couponDiscount - manual;
      const settings = await SettingsModel.findOne({ key: "store" });
      const tax = includeVat ? Math.round((afterDiscount * (settings?.taxRate || 0)) / 100) : 0;
      const total = afterDiscount + tax;

      const paid = paymentMethod === "cash" ? Math.round(Number(amountPaid ?? total)) : total;
      if (paid < total) return ResponseUtil.badRequest(res, `Amount received is less than the total (৳${total.toLocaleString("en-IN")})`);

      const invoiceNumber = await nextMemoNumber();
      const now = new Date();
      const invoice = await InvoiceModel.create({
        user_id: customerUser?._id,
        customer: {
          name: (customer.name || customerUser?.fullName || "Walk-in customer").trim(),
          phone: (customer.phone || customerUser?.phone || "").trim(),
          email: (customer.email || customerUser?.email || "").trim(),
        },
        phone: (customer.phone || customerUser?.phone || "").trim(),
        source: "pos",
        cashier: req.user.userId,
        invoiceNumber,
        orderDate: now,
        dueDate: now,
        items: lines.map((l) => ({ product: l.product._id, title: l.product.title, image: l.product.image?.url, price: l.unitPrice, qty: l.qty })),
        subtotal,
        tax,
        discount: couponDiscount + manual,
        coupon: coupon ? { code: coupon.code, discount: couponDiscount } : undefined,
        total,
        shippingCharge: 0,
        paymentMethod,
        paymentStatus: "completed",
        status: "paid",
        orderStatus: "delivered",
        stockDeducted: true,
        statusHistory: [{ status: "delivered", note: "Counter sale", by: req.user.userId, at: now }],
        payment: { amountPaid: paid, change: paid - total },
        notes: String(note).trim(),
      });

      // take the items out of stock (undo everything if one fails)
      try {
        for (const l of lines) {
          await moveStock({ productId: l.product._id, delta: -l.qty, type: "sale", reference: invoiceNumber, invoice: invoice._id, user: req.user.userId });
          applied.push(l);
        }
      } catch (stockError) {
        for (const l of applied) {
          await ProductModel.updateOne({ _id: l.product._id }, { $inc: { stock: l.qty } });
          await StockMovementModel.deleteOne({ invoice: invoice._id, product: l.product._id });
        }
        await InvoiceModel.deleteOne({ _id: invoice._id });
        return ResponseUtil.badRequest(res, stockError.message);
      }

      if (coupon) {
        await CouponModel.updateOne(
          { _id: coupon._id },
          { $inc: { usedCount: 1 }, $push: { redemptions: { user: customerUser?._id, invoice: invoice._id, discount: couponDiscount } } }
        );
      }

      await PaymentModel.create({
        user_id: customerUser?._id,
        invoice_id: invoice._id,
        payment_method: paymentMethod,
        amount: total,
        currency: "BDT",
        status: "completed",
        transaction_id: `${invoiceNumber}-${paymentMethod.toUpperCase()}`,
        payment_date: now,
        metadata: { invoiceNumber, source: "pos" },
      });

      const populated = await InvoiceModel.findById(invoice._id).populate("cashier", "fullName").populate("user_id", "fullName email");
      return ResponseUtil.created(res, populated, "Sale completed");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PosController();
