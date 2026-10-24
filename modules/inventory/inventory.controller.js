const mongoose = require("mongoose");
const ProductModel = require("../product/product.model");
const StockMovementModel = require("./stockMovement.model");
const SettingsModel = require("../settings/settings.model");
const ResponseUtil = require("../../shared/utils/response.util");

const INCREASE = ["restock", "return"];
const DECREASE = ["sale", "damage"];

// change stock by `delta` and log it; throws if stock would go negative
const moveStock = async ({ productId, delta, type, note = "", reference = "", invoice, user, unitCost, session }) => {
  const product = await ProductModel.findOneAndUpdate(
    { _id: productId, ...(delta < 0 && { stock: { $gte: -delta } }) },
    { $inc: { stock: delta } },
    { new: true, session }
  );
  if (!product) {
    const exists = await ProductModel.findById(productId).select("title stock");
    const error = new Error(exists ? `Only ${exists.stock} "${exists.title}" in stock` : "Product not found");
    error.statusCode = 400;
    throw error;
  }
  await StockMovementModel.create(
    [{ product: productId, type, quantity: delta, balanceAfter: product.stock, note, reference, invoice, user, unitCost }],
    { session }
  );
  return product;
};

class InventoryController {
  // overview numbers for the inventory page
  async summary(req, res, next) {
    try {
      const settings = await SettingsModel.findOne({ key: "store" });
      const low = settings?.lowStockThreshold ?? 10;
      const [totals] = await ProductModel.aggregate([
        {
          $group: {
            _id: null,
            products: { $sum: 1 },
            units: { $sum: "$stock" },
            retailValue: { $sum: { $multiply: ["$stock", { $ifNull: ["$discountPrice", "$price"] }] } },
            outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } },
            lowStock: { $sum: { $cond: [{ $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", low] }] }, 1, 0] } },
          },
        },
      ]);
      const since = new Date(Date.now() - 30 * 86400000);
      const flow = await StockMovementModel.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$type", units: { $sum: "$quantity" }, count: { $sum: 1 } } },
      ]);
      return ResponseUtil.success(res, { ...(totals || {}), lowStockThreshold: low, last30Days: flow }, "Inventory summary");
    } catch (error) {
      next(error);
    }
  }

  async movements(req, res, next) {
    try {
      const { product, type, limit = 50, page = 1 } = req.query;
      const filter = {};
      if (product) filter.product = product;
      if (type) filter.type = type;
      const lim = Math.min(Number(limit) || 50, 200);
      const [rows, total] = await Promise.all([
        StockMovementModel.find(filter)
          .populate("product", "title image stock")
          .populate("user", "fullName role")
          .populate("invoice", "invoiceNumber")
          .sort({ createdAt: -1 })
          .skip((Number(page) - 1) * lim)
          .limit(lim),
        StockMovementModel.countDocuments(filter),
      ]);
      return ResponseUtil.success(res, { movements: rows, total, page: Number(page), pages: Math.ceil(total / lim) }, "Stock movements");
    } catch (error) {
      next(error);
    }
  }

  // manual stock change: { product, type, quantity, note, reference, unitCost } ; adjustment uses `setTo`
  async adjust(req, res, next) {
    try {
      const { product, type, quantity, setTo, note = "", reference = "", unitCost } = req.body;
      if (!mongoose.isValidObjectId(product)) return ResponseUtil.badRequest(res, "Choose a product");
      const current = await ProductModel.findById(product).select("stock");
      if (!current) return ResponseUtil.notFound(res, "Product not found");

      let delta;
      if (type === "adjustment") {
        if (!(Number(setTo) >= 0)) return ResponseUtil.badRequest(res, "Enter the counted stock quantity");
        delta = Math.floor(Number(setTo)) - current.stock;
        if (delta === 0) return ResponseUtil.badRequest(res, "Stock is already at that quantity");
      } else if (INCREASE.includes(type) || DECREASE.includes(type)) {
        const qty = Math.floor(Number(quantity));
        if (!(qty > 0)) return ResponseUtil.badRequest(res, "Quantity must be at least 1");
        delta = INCREASE.includes(type) ? qty : -qty;
      } else {
        return ResponseUtil.badRequest(res, "Unknown stock change type");
      }

      const updated = await moveStock({
        productId: product,
        delta,
        type,
        note,
        reference,
        unitCost: unitCost ? Number(unitCost) : undefined,
        user: req.user.userId,
      });
      return ResponseUtil.success(res, { product: updated._id, stock: updated.stock, change: delta }, "Stock updated");
    } catch (error) {
      if (error.statusCode === 400) return ResponseUtil.badRequest(res, error.message);
      next(error);
    }
  }
}

module.exports = new InventoryController();
module.exports.moveStock = moveStock;
