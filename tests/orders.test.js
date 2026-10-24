// Checkout (guest + customer), tracking, fulfilment by staff, POS and stock, checked against the database
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, newCustomer, inStockProduct, SEED } = require("./helpers");
const InvoiceModel = require("../modules/invoice/invoice.model");
const ProductModel = require("../modules/product/product.model");
const PaymentModel = require("../modules/payment/payment.model");
const StockMovementModel = require("../modules/inventory/stockMovement.model");
const NotificationModel = require("../modules/notification/notification.model");
const UserModel = require("../modules/user/user.model");

before(start);
after(stop);

const address = { street: "House 9, Road 3, Mirpur DOHS", city: "Dhaka", zipCode: "1216" };
const stockOf = async (id) => (await ProductModel.findById(id).select("stock")).stock;

describe("guest order: checkout → track → accept → ship → deliver", () => {
  let product;
  let order;
  const phone = "01811223344";

  before(async () => {
    product = await inStockProduct(5);
  });

  test("quote prices the cart on the server", async () => {
    const res = await api("POST", "/invoices/quote", {
      body: { items: [{ product: product._id, qty: 2, price: 1 }], shippingMethod: SEED.shippingInsideDhaka },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.items[0].qty, 2);
    assert.ok(res.body.data.items[0].price > 1, "client prices are ignored");
    assert.equal(res.body.data.total, res.body.data.subtotal - res.body.data.discount + res.body.data.shippingCharge);
  });

  test("checkout validates contact details and stock", async () => {
    const base = { items: [{ product: product._id, qty: 1 }], shippingMethod: SEED.shippingInsideDhaka, shippingAddress: address };
    assert.equal((await api("POST", "/invoices/checkout", { body: { ...base, customer: { name: "Guest", phone: "123" } } })).status, 400);
    assert.equal((await api("POST", "/invoices/checkout", { body: { ...base, customer: { name: "", phone } } })).status, 400);
    const tooMany = await api("POST", "/invoices/checkout", {
      body: { ...base, items: [{ product: product._id, qty: product.stock + 1 }], customer: { name: "Guest", phone } },
    });
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.body.message, /left in stock/);
  });

  test("guest places a cash-on-delivery order; staff are notified", async () => {
    const res = await api("POST", "/invoices/checkout", {
      body: {
        customer: { name: "Test Guest", phone, email: "guest@example.com" },
        items: [{ product: product._id, qty: 2 }],
        shippingMethod: SEED.shippingInsideDhaka,
        shippingAddress: address,
        paymentMethod: "cash_on_delivery",
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.isGuest, true);
    order = await InvoiceModel.findById(res.body.data._id);
    assert.equal(order.orderStatus, "pending");
    assert.equal(order.user_id, undefined);
    assert.equal(order.stockDeducted, false);
    assert.equal(await stockOf(product._id), product.stock, "a pending order doesn't hold stock yet");
    assert.ok(await NotificationModel.exists({ type: "order.new", title: new RegExp(order.invoiceNumber) }));
  });

  test("public tracking needs the matching phone", async () => {
    const wrong = await api("GET", "/invoices/track", { query: { number: order.invoiceNumber, phone: "01999999999" } });
    assert.equal(wrong.status, 404);
    const ok = await api("GET", "/invoices/track", { query: { number: order.invoiceNumber.toLowerCase(), phone: `+88${phone}` } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.orderStatus, "pending");
    assert.equal(ok.body.data.customer, undefined, "tracking shows no personal details");
  });

  test("staff see it as a guest order", async () => {
    const res = await api("GET", "/invoices", { as: "manager", query: { guest: "true", q: order.invoiceNumber } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
  });

  test("the store keeper can't open orders; the cashier can", async () => {
    assert.equal((await api("GET", `/invoices/${order._id}`, { as: "inventory" })).status, 403);
    assert.equal((await api("GET", `/invoices/${order._id}`, { as: "user" })).status, 403);
    assert.equal((await api("GET", `/invoices/${order._id}`, { as: "cashier" })).status, 200);
  });

  test("accepting takes the stock and logs a movement", async () => {
    const res = await api("PATCH", `/invoices/${order._id}/order-status`, { as: "manager", body: { orderStatus: "processing", note: "Confirmed by phone" } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await stockOf(product._id), product.stock - 2);
    const fresh = await InvoiceModel.findById(order._id);
    assert.equal(fresh.stockDeducted, true);
    assert.equal(fresh.statusHistory.at(-1).status, "processing");
    assert.ok(await StockMovementModel.exists({ product: product._id, reference: order.invoiceNumber, type: "sale" }));

    assert.equal((await api("PATCH", `/invoices/${order._id}/order-status`, { as: "manager", body: { orderStatus: "lost" } })).status, 400);
  });

  test("shipping needs an active courier", async () => {
    assert.equal((await api("PATCH", `/invoices/${order._id}/shipment`, { as: "cashier", body: {} })).status, 400);
    assert.equal((await api("PATCH", `/invoices/${order._id}/shipment`, { as: "cashier", body: { courier: SEED.courierInactive } })).status, 400);
    assert.equal((await api("PATCH", `/invoices/${order._id}/shipment`, { as: "cashier", body: { courier: "nope" } })).status, 400);

    const res = await api("PATCH", `/invoices/${order._id}/shipment`, {
      as: "cashier",
      body: { courier: SEED.courierSteadfast, trackingNumber: "SF123456" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.orderStatus, "shipped");
    assert.equal(res.body.data.shipment.trackingNumber, "SF123456");

    const tracked = await api("GET", "/invoices/track", { query: { number: order.invoiceNumber, phone } });
    assert.equal(tracked.body.data.shipment.trackingNumber, "SF123456");
  });

  test("delivering collects the cash and records the payment", async () => {
    const res = await api("PATCH", `/invoices/${order._id}/order-status`, { as: "manager", body: { orderStatus: "delivered" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.paymentStatus, "completed");
    const payment = await PaymentModel.findOne({ invoice_id: order._id });
    assert.equal(payment.status, "completed");
    assert.equal(payment.amount, res.body.data.total);
  });
});

describe("customer order with coupon, saved address and cancellation", () => {
  let c;
  let product;
  let order;

  before(async () => {
    c = await newCustomer("buyer");
    // WELCOME10 needs a ৳3,000 order
    product = await ProductModel.findOne({ stock: { $gte: 3 }, price: { $gte: 3500 } });
  });

  test("coupon check before checkout", async () => {
    const res = await api("POST", "/coupons/apply", { token: c.token, body: { code: "welcome10", items: [{ product: product._id, qty: 1 }] } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.code, "WELCOME10");
    assert.ok(res.body.data.discount > 0);
    assert.equal((await api("POST", "/coupons/apply", { token: c.token, body: { code: "NOPE", items: [{ product: product._id, qty: 1 }] } })).status, 400);
  });

  test("checkout links the order to the customer, applies the coupon and saves the address", async () => {
    const res = await api("POST", "/invoices/checkout", {
      token: c.token,
      body: {
        customer: { name: "Test Buyer", phone: "01722334455" },
        items: [{ product: product._id, qty: 1 }],
        shippingMethod: SEED.shippingInsideDhaka,
        shippingAddress: address,
        couponCode: "WELCOME10",
        saveAddress: true,
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.isGuest, false);
    order = await InvoiceModel.findById(res.body.data._id);
    assert.equal(String(order.user_id), String(c.user._id));
    assert.equal(order.coupon.code, "WELCOME10");
    assert.ok(order.discount > 0);

    const user = await UserModel.findById(c.user._id);
    assert.equal(user.addresses.length, 1);
    assert.equal(user.addresses[0].street, address.street);
    assert.equal(user.addresses[0].isDefault, true);
  });

  test("my orders and order details", async () => {
    const mine = await api("GET", "/invoices/mine", { token: c.token });
    assert.equal(mine.body.data.length, 1);
    assert.equal((await api("GET", `/invoices/${order._id}`, { token: c.token })).status, 200);
    assert.equal((await api("GET", `/invoices/user/${SEED.customerId}`, { token: c.token })).status, 403);
    const dash = await api("GET", "/dashboard/me", { token: c.token });
    assert.equal(dash.status, 200);
  });

  test("staff edit the order; totals are recalculated on the server", async () => {
    const res = await api("PUT", `/invoices/${order._id}`, { as: "manager", body: { items: [{ product: product._id, qty: 2 }], notes: "Customer asked for 2" } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fresh = await InvoiceModel.findById(order._id);
    assert.equal(fresh.items[0].qty, 2);
    assert.equal(fresh.subtotal, fresh.items[0].price * 2);
    assert.equal(fresh.total, fresh.subtotal - fresh.discount + fresh.tax + fresh.shippingCharge);
  });

  test("the customer is notified of status changes; cancelling returns the stock", async () => {
    const before = await stockOf(product._id);
    await api("PATCH", `/invoices/${order._id}/order-status`, { as: "cashier", body: { orderStatus: "processing" } });
    assert.equal(await stockOf(product._id), before - 2);
    assert.ok(await NotificationModel.exists({ user: c.user._id, type: "order.status" }));

    const cancel = await api("PATCH", `/invoices/${order._id}/order-status`, { as: "cashier", body: { orderStatus: "cancelled", note: "Changed mind" } });
    assert.equal(cancel.status, 200);
    assert.equal(await stockOf(product._id), before);
    assert.ok(await StockMovementModel.exists({ product: product._id, reference: order.invoiceNumber, type: "return" }));

    const notes = await api("GET", "/notifications", { token: c.token });
    assert.ok(notes.body.data.items.length >= 2);
    assert.ok(notes.body.data.unread >= 2);
    const read = await api("PATCH", "/notifications/read-all", { token: c.token });
    assert.equal(read.status, 200);
    assert.equal((await api("GET", "/notifications", { token: c.token })).body.data.unread, 0);
  });
});

describe("POS and stock", () => {
  let product;

  before(async () => {
    product = await inStockProduct(5, 3);
  });

  test("cashier counter sale takes stock immediately", async () => {
    const before = await stockOf(product._id);
    const res = await api("POST", "/pos/orders", {
      as: "cashier",
      body: { customer: { name: "Walk-in" }, items: [{ product: product._id, qty: 1 }], paymentMethod: "cash", amountPaid: 1000000 },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(await stockOf(product._id), before - 1);
    const sale = await InvoiceModel.findById(res.body.data._id);
    assert.equal(sale.source, "pos");
    assert.ok(sale.invoiceNumber.startsWith("POS-"));
    // counter sales are complete and can't go through the online status flow
    assert.equal((await api("PATCH", `/invoices/${sale._id}/order-status`, { as: "manager", body: { orderStatus: "pending" } })).status, 400);

    assert.equal((await api("POST", "/pos/orders", { as: "cashier", body: { items: [] } })).status, 400);
    assert.equal((await api("POST", "/pos/orders", { as: "cashier", body: { items: [{ product: product._id, qty: 1 }], paymentMethod: "cheque" } })).status, 400);
  });

  test("store keeper restocks, records damage and counts stock", async () => {
    const before = await stockOf(product._id);
    const restock = await api("POST", "/inventory/adjust", { as: "inventory", body: { product: product._id, type: "restock", quantity: 10, note: "Supplier delivery" } });
    assert.equal(restock.status, 200, JSON.stringify(restock.body));
    assert.equal(await stockOf(product._id), before + 10);

    await api("POST", "/inventory/adjust", { as: "inventory", body: { product: product._id, type: "damage", quantity: 1 } });
    assert.equal(await stockOf(product._id), before + 9);

    const count = await api("POST", "/inventory/adjust", { as: "inventory", body: { product: product._id, type: "adjustment", setTo: before } });
    assert.equal(count.status, 200);
    assert.equal(await stockOf(product._id), before);

    assert.equal((await api("POST", "/inventory/adjust", { as: "inventory", body: { product: product._id, type: "restock", quantity: 0 } })).status, 400);
    assert.equal((await api("POST", "/inventory/adjust", { as: "inventory", body: { product: product._id, type: "magic", quantity: 1 } })).status, 400);

    const moves = await api("GET", "/inventory/movements", { as: "inventory", query: { product: String(product._id) } });
    assert.equal(moves.status, 200);
  });
});

describe("payments are private", () => {
  test("a customer sees only their own payments", async () => {
    const theirs = await PaymentModel.findOne({ user_id: SEED.otherCustomerId });
    const mine = await PaymentModel.findOne({ user_id: SEED.customerId });
    if (theirs) {
      assert.equal((await api("GET", `/payments/${theirs._id}`, { as: "user" })).status, 404);
      assert.equal((await api("GET", `/payments/${theirs._id}`, { as: "manager" })).status, 200);
    }
    if (mine) assert.equal((await api("GET", `/payments/${mine._id}`, { as: "user" })).status, 200);
    assert.equal((await api("GET", `/payments/user/${SEED.customerId}`, { as: "user" })).status, 200);
    assert.equal((await api("GET", `/payments/${SEED.customerId}`)).status, 401);
  });
});
