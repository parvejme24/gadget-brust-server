const mongoose = require("mongoose");

const ProductSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
      required: true,
      trim: true,
    },
    keyFeatures: [
      {
        key: String,
        values: [String],
      },
    ],
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
    },
    image: {
      url: String,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    star: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    remark: {
      type: String,
      default: "regular",
      enum: ["regular", "trending", "popular", "top", "best", "new"],
    },
    isSlider: {
      type: Boolean,
      default: false,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "categories",
      required: true,
    },
    subcategory: {
      type: String,
      required: true,
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "brands",
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

// Index for better performance
ProductSchema.index({ title: "text", shortDescription: "text" });
ProductSchema.index({ category: 1 });
ProductSchema.index({ subcategory: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ remark: 1 });
ProductSchema.index({ isSlider: 1 });
ProductSchema.index({ price: 1 });

// Virtual for final price after discount
ProductSchema.virtual("finalPrice").get(function () {
  if (this.discount > 0) {
    return this.price - (this.price * this.discount) / 100;
  }
  return this.price;
});

// Virtual for in stock status
ProductSchema.virtual("inStock").get(function () {
  return this.stock > 0;
});

// Ensure virtuals are serialized
ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

const ProductModel = mongoose.model("Product", ProductSchema);

module.exports = ProductModel;
