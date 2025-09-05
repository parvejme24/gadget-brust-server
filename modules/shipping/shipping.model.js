const mongoose = require("mongoose");

const ShippingSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    baseCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    perKgCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    minOrderAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    freeShippingThreshold: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    estimatedDays: {
      min: {
        type: Number,
        required: true,
        min: 1,
        default: 3,
      },
      max: {
        type: Number,
        required: true,
        min: 1,
        default: 7,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    zones: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        countries: [String],
        additionalCharge: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

// Index for better performance
ShippingSchema.index({ name: 1 });
ShippingSchema.index({ isActive: 1 });

// Method to calculate shipping charge
ShippingSchema.methods.calculateShippingCharge = function(orderAmount, totalWeight = 0) {
  let shippingCharge = this.baseCharge;
  
  // Add weight-based charge
  if (totalWeight > 0) {
    shippingCharge += (totalWeight * this.perKgCharge);
  }
  
  // Check if order qualifies for free shipping
  if (this.freeShippingThreshold > 0 && orderAmount >= this.freeShippingThreshold) {
    shippingCharge = 0;
  }
  
  return Math.max(0, shippingCharge);
};

// Ensure virtuals are serialized
ShippingSchema.set('toJSON', { virtuals: true });
ShippingSchema.set('toObject', { virtuals: true });

const ShippingModel = mongoose.model("shipping", ShippingSchema);
module.exports = ShippingModel;


