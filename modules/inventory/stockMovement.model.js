const mongoose = require("mongoose");

// Every stock change, so inventory has a full audit trail
const StockMovementSchema = mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    type: {
      type: String,
      enum: ["restock", "sale", "return", "damage", "adjustment", "opening"],
      required: true,
    },
    quantity: { type: Number, required: true }, // signed: + adds stock, - removes it
    balanceAfter: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0 },
    note: { type: String, trim: true, default: "" },
    reference: { type: String, trim: true, default: "" }, // supplier invoice, memo no, …
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "invoices" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true, versionKey: false }
);

StockMovementSchema.index({ product: 1, createdAt: -1 });
StockMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("stockMovements", StockMovementSchema);
