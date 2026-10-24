const mongoose = require("mongoose");

const InvoiceSchema = mongoose.Schema(
  {
    // empty for walk-in (POS) customers without an account
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    customer: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    },
    source: {
      type: String,
      enum: ['online', 'pos'],
      default: 'online',
    },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    coupon: {
      code: String,
      discount: { type: Number, default: 0 },
    },
    payment: {
      amountPaid: Number,
      change: Number,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        title: { type: String, required: true },
        image: String,
        price: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
      },
    ],
    // fulfilment lifecycle, separate from the invoice/payment status
    orderStatus: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    // courier hand-off for this order
    shipment: {
      courier: { type: mongoose.Schema.Types.ObjectId, ref: 'couriers' },
      trackingNumber: { type: String, trim: true },
      note: { type: String, trim: true },
      shippedAt: Date,
    },
    // every status change, newest last
    statusHistory: [
      {
        status: { type: String, required: true },
        note: { type: String, trim: true, default: "" },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
        byName: { type: String, trim: true },
        at: { type: Date, default: Date.now },
      },
    ],
    // true once the items have been taken out of stock (on acceptance)
    stockDeducted: {
      type: Boolean,
      default: false,
    },
    shippingMethod: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'shipping' },
      name: { type: String, trim: true },
    },
    shippingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    phone: String,
    orderDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'cancelled'],
      default: 'pending',
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['ssl_commerz', 'stripe', 'shurjopay', 'cash_on_delivery', 'cash', 'card', 'bkash', 'nagad'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    shippingAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    billingAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    notes: String,
  },
  { timestamps: true, versionKey: false }
);

// Index for better performance
InvoiceSchema.index({ user_id: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ paymentStatus: 1 });
InvoiceSchema.index({ orderStatus: 1 });
InvoiceSchema.index({ source: 1 });

const InvoiceModel = mongoose.model("invoices", InvoiceSchema);
module.exports = InvoiceModel;

