const mongoose = require("mongoose");

const ObjectId = mongoose.Schema.Types.ObjectId;

const CouponSchema = mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // percentage: value% off · fixed: ৳value off · bogo: buy X get Y · free_shipping: delivery is free
    type: { type: String, enum: ["percentage", "fixed", "bogo", "free_shipping"], required: true },
    value: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 }, // 0 = no cap (percentage only)
    bogo: {
      buyQty: { type: Number, default: 1, min: 1 },
      getQty: { type: Number, default: 1, min: 1 },
      getDiscountPercent: { type: Number, default: 100, min: 1, max: 100 }, // 100 = free
    },

    // what the coupon applies to
    appliesTo: { type: String, enum: ["all", "products", "categories", "brands"], default: "all" },
    products: [{ type: ObjectId, ref: "Product" }],
    categories: [{ type: ObjectId, ref: "categories" }],
    brands: [{ type: ObjectId, ref: "brands" }],
    excludeDiscountedItems: { type: Boolean, default: false },

    // conditions
    minOrderAmount: { type: Number, default: 0, min: 0 },
    minQuantity: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    usageLimitPerUser: { type: Number, default: 0, min: 0 },
    firstOrderOnly: { type: Boolean, default: false },
    startDate: { type: Date },
    endDate: { type: Date },

    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true }, // shown as an offer on product pages
    usedCount: { type: Number, default: 0 },
    redemptions: [
      {
        user: { type: ObjectId, ref: "users" },
        invoice: { type: ObjectId, ref: "invoices" },
        discount: Number,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

CouponSchema.index({ isActive: 1, isPublic: 1 });

module.exports = mongoose.model("coupons", CouponSchema);
