const SettingsModel = require("./settings.model");
const ResponseUtil = require("../../shared/utils/response.util");

const EDITABLE = [
  "storeName",
  "tagline",
  "email",
  "phone",
  "address",
  "hours",
  "currency",
  "taxRate",
  "freeDeliveryThreshold",
  "deliveryCharges",
  "lowStockThreshold",
  "socials",
  "seo",
  "announcement",
  "maintenanceMode",
];

// settings that are groups of fields; a plain value would replace the whole group
const GROUPS = ["deliveryCharges", "socials", "seo", "announcement"];

// flatten nested objects so a partial update doesn't wipe sibling fields
const toDotPaths = (obj, prefix = "") =>
  Object.entries(obj).reduce((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) Object.assign(acc, toDotPaths(value, path));
    else acc[path] = value;
    return acc;
  }, {});

class SettingsController {
  async getSettings(req, res, next) {
    try {
      const settings = await SettingsModel.findOneAndUpdate(
        { key: "store" },
        { $setOnInsert: { key: "store" } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return ResponseUtil.success(res, settings, "Settings retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req, res, next) {
    try {
      const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => EDITABLE.includes(key)));
      const badGroup = GROUPS.find((key) => key in updates && (!updates[key] || typeof updates[key] !== "object" || Array.isArray(updates[key])));
      if (badGroup) return ResponseUtil.badRequest(res, `${badGroup} must be an object`);
      const settings = await SettingsModel.findOneAndUpdate(
        { key: "store" },
        { $set: toDotPaths(updates) },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      return ResponseUtil.success(res, settings, "Settings updated successfully");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SettingsController();
