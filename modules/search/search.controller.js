const ProductModel = require("../product/product.model");
const InvoiceModel = require("../invoice/invoice.model");
const UserModel = require("../user/user.model");
const CouponModel = require("../coupon/coupon.model");
const { hasPermission } = require("../../shared/config/permissions");
const ResponseUtil = require("../../shared/utils/response.util");

const LIMIT = 5;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const orderShape = (o) => ({
  _id: o._id,
  invoiceNumber: o.invoiceNumber,
  customer: o.customer?.name || o.user_id?.fullName || "Guest",
  total: o.total,
  orderStatus: o.orderStatus,
  createdAt: o.createdAt,
});

class SearchController {
  // GET /api/search?q=  -> results grouped by type, only for what the user's role may see
  async search(req, res, next) {
    try {
      const q = String(req.query.q || "").trim().slice(0, 60);
      if (q.length < 2) return ResponseUtil.success(res, {}, "Type at least 2 characters");

      const { role, userId } = req.user;
      const rx = new RegExp(escape(q), "i");
      const allowed = (p) => hasPermission(role, p);
      const jobs = {};

      // customers search the catalog and their own orders; staff with catalog/inventory/pos search products
      if (allowed("catalog") || allowed("inventory") || allowed("pos") || allowed("account")) {
        jobs.products = ProductModel.find({ title: rx })
          .select("title image price discountPrice stock")
          .limit(LIMIT)
          .lean();
      }
      if (allowed("orders") || allowed("account")) {
        const filter = { $or: [{ invoiceNumber: rx }, { "customer.name": rx }, { "customer.phone": rx }, { phone: rx }] };
        jobs.orders = InvoiceModel.find(allowed("orders") ? filter : { ...filter, user_id: userId })
          .select("invoiceNumber customer user_id total orderStatus createdAt")
          .populate("user_id", "fullName")
          .sort({ createdAt: -1 })
          .limit(LIMIT)
          .lean()
          .then((rows) => rows.map(orderShape));
      }
      if (allowed("customers")) {
        jobs.customers = UserModel.find({ role: "user", $or: [{ fullName: rx }, { email: rx }, { phone: rx }] })
          .select("fullName email phone")
          .limit(LIMIT)
          .lean();
      }
      if (allowed("coupons")) {
        jobs.coupons = CouponModel.find({ $or: [{ code: rx }, { title: rx }] })
          .select("code title isActive")
          .limit(LIMIT)
          .lean();
      }
      if (allowed("staff")) {
        jobs.staff = UserModel.find({ role: { $ne: "user" }, $or: [{ fullName: rx }, { email: rx }] })
          .select("fullName email role")
          .limit(LIMIT)
          .lean();
      }

      const keys = Object.keys(jobs);
      const values = await Promise.all(Object.values(jobs));
      return ResponseUtil.success(res, Object.fromEntries(keys.map((k, i) => [k, values[i]])), "Search results");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SearchController();
