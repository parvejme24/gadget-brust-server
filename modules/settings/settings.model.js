const mongoose = require("mongoose");

// Single document holding store-wide settings managed from the admin dashboard
const SettingsSchema = mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },
    storeName: { type: String, default: "Gadget Brust", trim: true },
    tagline: { type: String, default: "Smart gadgets, genuine warranty, fast delivery.", trim: true },
    email: { type: String, default: "support@gadgetbrust.com", trim: true },
    phone: { type: String, default: "+880 1700-000000", trim: true },
    address: { type: String, default: "Level 4, Bashundhara City, Panthapath, Dhaka 1215", trim: true },
    hours: { type: String, default: "Sat - Thu, 10:00 AM - 8:00 PM", trim: true },
    currency: { type: String, default: "BDT" },
    taxRate: { type: Number, default: 5, min: 0, max: 100 },
    freeDeliveryThreshold: { type: Number, default: 5000, min: 0 },
    deliveryCharges: {
      insideDhaka: { type: Number, default: 60, min: 0 },
      outsideDhaka: { type: Number, default: 120, min: 0 },
    },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    socials: {
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
      youtube: { type: String, default: "" },
      twitter: { type: String, default: "" },
    },
    seo: {
      metaTitle: { type: String, default: "Gadget Brust | Smart Gadget Store" },
      metaDescription: {
        type: String,
        default: "Shop phones, laptops, audio, gaming and smart accessories with official warranty.",
      },
      keywords: { type: String, default: "gadgets, phones, laptops, bangladesh" },
    },
    announcement: {
      enabled: { type: Boolean, default: true },
      text: { type: String, default: "Free delivery on orders over ৳5,000" },
    },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("settings", SettingsSchema);
