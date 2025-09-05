const mongoose = require("mongoose");

const CartSchema = mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    color: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    weight: {
      type: Number,
      default: 0,
      min: 0,
    },
    selectedShipping: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'shipping',
    },
  },
  { timestamps: true, versionKey: false }
);

// Index for better performance
CartSchema.index({ user_id: 1 });
CartSchema.index({ product_id: 1 });

// Compound index to prevent duplicate cart items for same user, product, color, and size
CartSchema.index({ user_id: 1, product_id: 1, color: 1, size: 1 }, { unique: true });

// Virtual for total price (qty * price)
CartSchema.virtual('totalPrice').get(function() {
  return this.qty * this.price;
});

// Ensure virtuals are serialized
CartSchema.set('toJSON', { virtuals: true });
CartSchema.set('toObject', { virtuals: true });

const CartModel = mongoose.model("carts", CartSchema);
module.exports = CartModel;

