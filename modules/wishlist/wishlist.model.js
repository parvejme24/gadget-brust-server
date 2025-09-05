const mongoose = require("mongoose");

const WishlistSchema = mongoose.Schema(
  {
    productID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    customerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    customerEmail: {
      type: String,
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Index for better performance
WishlistSchema.index({ productID: 1 });
WishlistSchema.index({ customerID: 1 });
WishlistSchema.index({ customerEmail: 1 });

// Compound index to prevent duplicate wishlist items
WishlistSchema.index({ productID: 1, customerEmail: 1 }, { unique: true });

const WishlistModel = mongoose.model("wishlists", WishlistSchema);
module.exports = WishlistModel;

