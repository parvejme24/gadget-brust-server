const mongoose = require("mongoose");

// Delivery partners (Steadfast, Pathao, RedX, …) the admin can hand parcels to
const CourierSchema = mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    logo: { type: String, default: "", trim: true },
    color: { type: String, default: "#1c2024", trim: true },
    website: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    // e.g. https://example.com/track/{tracking} ; {tracking} is replaced with the parcel's tracking number
    trackingUrl: { type: String, default: "", trim: true },
    charges: {
      insideDhaka: { type: Number, default: 60, min: 0 },
      outsideDhaka: { type: Number, default: 120, min: 0 },
      perKg: { type: Number, default: 0, min: 0 },
    },
    codChargePercent: { type: Number, default: 1, min: 0, max: 100 },
    deliveryTime: {
      insideDhaka: { type: String, default: "1-2 days", trim: true },
      outsideDhaka: { type: String, default: "2-4 days", trim: true },
    },
    merchantId: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("couriers", CourierSchema);
