const CourierModel = require("./courier.model");
const InvoiceModel = require("../invoice/invoice.model");
const ResponseUtil = require("../../shared/utils/response.util");

const EDITABLE = [
  "name",
  "logo",
  "color",
  "website",
  "phone",
  "trackingUrl",
  "charges",
  "codChargePercent",
  "deliveryTime",
  "merchantId",
  "notes",
  "isActive",
];

const pick = (body) => Object.fromEntries(Object.entries(body).filter(([key]) => EDITABLE.includes(key)));

class CourierController {
  async getAll(req, res, next) {
    try {
      const filter = req.query.active === "true" ? { isActive: true } : {};
      const couriers = await CourierModel.find(filter).sort({ isDefault: -1, name: 1 }).lean();

      // parcels handed to each courier, for the admin overview
      const counts = await InvoiceModel.aggregate([
        { $match: { "shipment.courier": { $exists: true, $ne: null } } },
        { $group: { _id: "$shipment.courier", parcels: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } } } },
      ]);
      const byId = Object.fromEntries(counts.map((c) => [String(c._id), c]));
      const data = couriers.map((c) => ({ ...c, parcels: byId[c._id]?.parcels || 0, delivered: byId[c._id]?.delivered || 0 }));

      return ResponseUtil.success(res, data, "Couriers retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const courier = await CourierModel.findById(req.params.id);
      if (!courier) return ResponseUtil.notFound(res, "Courier not found");
      return ResponseUtil.success(res, courier, "Courier retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const exists = await CourierModel.findOne({ name: new RegExp(`^${String(req.body.name || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      if (exists) return ResponseUtil.badRequest(res, "A courier with this name already exists");

      const isFirst = (await CourierModel.countDocuments()) === 0;
      const courier = await CourierModel.create({ ...pick(req.body), isDefault: isFirst });
      return ResponseUtil.created(res, courier, "Courier added successfully");
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const courier = await CourierModel.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
      if (!courier) return ResponseUtil.notFound(res, "Courier not found");
      return ResponseUtil.success(res, courier, "Courier updated successfully");
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const courier = await CourierModel.findById(req.params.id);
      if (!courier) return ResponseUtil.notFound(res, "Courier not found");
      courier.isActive = !courier.isActive;
      // the default courier must stay available
      if (!courier.isActive && courier.isDefault) {
        return ResponseUtil.badRequest(res, "Choose another default courier before pausing this one");
      }
      await courier.save();
      return ResponseUtil.success(res, courier, `Courier ${courier.isActive ? "activated" : "paused"}`);
    } catch (error) {
      next(error);
    }
  }

  async setDefault(req, res, next) {
    try {
      const courier = await CourierModel.findById(req.params.id);
      if (!courier) return ResponseUtil.notFound(res, "Courier not found");
      await CourierModel.updateMany({}, { isDefault: false });
      courier.isDefault = true;
      courier.isActive = true;
      await courier.save();
      return ResponseUtil.success(res, courier, "Default courier updated");
    } catch (error) {
      next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const courier = await CourierModel.findById(req.params.id);
      if (!courier) return ResponseUtil.notFound(res, "Courier not found");
      if (courier.isDefault) return ResponseUtil.badRequest(res, "Choose another default courier before deleting this one");
      const inUse = await InvoiceModel.countDocuments({ "shipment.courier": courier._id, orderStatus: "shipped" });
      if (inUse) return ResponseUtil.badRequest(res, `${inUse} parcels are still in transit with this courier`);
      await courier.deleteOne();
      return ResponseUtil.success(res, null, "Courier deleted successfully");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CourierController();
