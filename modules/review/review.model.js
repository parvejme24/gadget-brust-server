const mongoose = require("mongoose");

const ReviewSchema = mongoose.Schema(
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
    reviewText: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Index for better performance
ReviewSchema.index({ productID: 1 });
ReviewSchema.index({ customerID: 1 });

const ReviewModel = mongoose.model("reviews", ReviewSchema);
module.exports = ReviewModel;
