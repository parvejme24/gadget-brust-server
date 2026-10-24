const CouponModel = require("./coupon.model");
const ResponseUtil = require("../../shared/utils/response.util");
const { priceLines, evaluateCoupon, describeCoupon } = require("./coupon.engine");

const EDITABLE = [
  "code",
  "title",
  "description",
  "type",
  "value",
  "maxDiscount",
  "bogo",
  "appliesTo",
  "products",
  "categories",
  "brands",
  "excludeDiscountedItems",
  "minOrderAmount",
  "minQuantity",
  "usageLimit",
  "usageLimitPerUser",
  "firstOrderOnly",
  "startDate",
  "endDate",
  "isActive",
  "isPublic",
];

const clean = (body) => {
  const data = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k)));
  if (data.code) data.code = String(data.code).trim().toUpperCase().replace(/\s+/g, "");
  ["startDate", "endDate"].forEach((k) => {
    if (data[k] === "" || data[k] === null) data[k] = undefined;
  });
  // keep only the target list that matches the scope
  if (data.appliesTo) {
    ["products", "categories", "brands"].forEach((k) => {
      if (data.appliesTo !== k) data[k] = [];
    });
  }
  return data;
};

const validate = (data) => {
  if (!data.code || !/^[A-Z0-9_-]{3,30}$/.test(data.code)) return "Code must be 3-30 letters, numbers, - or _";
  if (data.type === "percentage" && !(data.value > 0 && data.value <= 100)) return "Percentage must be between 1 and 100";
  if (data.type === "fixed" && !(data.value > 0)) return "Enter the amount to take off";
  if (data.appliesTo && data.appliesTo !== "all" && !(data[data.appliesTo] || []).length) return `Choose at least one of the ${data.appliesTo}`;
  if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) return "End date must be after the start date";
  return null;
};

class CouponController {
  async getAll(req, res, next) {
    try {
      const coupons = await CouponModel.find().select("-redemptions").sort({ createdAt: -1 });
      return ResponseUtil.success(res, coupons, "Coupons retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const coupon = await CouponModel.findById(req.params.id)
        .populate("products", "title image price discountPrice")
        .populate("redemptions.user", "fullName email")
        .populate("redemptions.invoice", "invoiceNumber total");
      if (!coupon) return ResponseUtil.notFound(res, "Coupon not found");
      return ResponseUtil.success(res, coupon, "Coupon retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const data = clean(req.body);
      const message = validate(data);
      if (message) return ResponseUtil.badRequest(res, message);
      if (await CouponModel.exists({ code: data.code })) return ResponseUtil.badRequest(res, "A coupon with this code already exists");
      const coupon = await CouponModel.create(data);
      return ResponseUtil.created(res, coupon, "Coupon created successfully");
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const data = clean(req.body);
      const current = await CouponModel.findById(req.params.id);
      if (!current) return ResponseUtil.notFound(res, "Coupon not found");
      const message = validate({ ...current.toObject(), ...data });
      if (message) return ResponseUtil.badRequest(res, message);
      if (data.code && data.code !== current.code && (await CouponModel.exists({ code: data.code }))) {
        return ResponseUtil.badRequest(res, "A coupon with this code already exists");
      }
      const update = { $set: {}, $unset: {} };
      Object.entries(data).forEach(([k, v]) => (v === undefined ? (update.$unset[k] = 1) : (update.$set[k] = v)));
      const coupon = await CouponModel.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select("-redemptions");
      return ResponseUtil.success(res, coupon, "Coupon updated successfully");
    } catch (error) {
      next(error);
    }
  }

  async toggle(req, res, next) {
    try {
      const coupon = await CouponModel.findById(req.params.id).select("-redemptions");
      if (!coupon) return ResponseUtil.notFound(res, "Coupon not found");
      coupon.isActive = !coupon.isActive;
      await coupon.save();
      return ResponseUtil.success(res, coupon, coupon.isActive ? "Coupon activated" : "Coupon paused");
    } catch (error) {
      next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const coupon = await CouponModel.findByIdAndDelete(req.params.id);
      if (!coupon) return ResponseUtil.notFound(res, "Coupon not found");
      return ResponseUtil.success(res, null, "Coupon deleted successfully");
    } catch (error) {
      next(error);
    }
  }

  // public: check a code against cart lines [{ product, qty }]
  async apply(req, res, next) {
    try {
      const { code, items = [] } = req.body;
      if (!code) return ResponseUtil.badRequest(res, "Enter a coupon code");
      const coupon = await CouponModel.findOne({ code: String(code).trim().toUpperCase() });
      const lines = await priceLines(items.map((i) => ({ product: i.product, qty: i.qty })));
      if (!lines.length) return ResponseUtil.badRequest(res, "Your cart is empty");
      // staff (POS) may check limits for a chosen customer; customers are always checked as themselves
      const isStaff = req.user && req.user.role !== "user";
      const userId = isStaff ? req.body.forUser || undefined : req.user?.userId;
      const result = await evaluateCoupon(coupon, lines, { userId });
      if (!result.valid) return ResponseUtil.badRequest(res, result.message);
      return ResponseUtil.success(
        res,
        {
          code: coupon.code,
          title: coupon.title,
          summary: describeCoupon(coupon),
          type: coupon.type,
          discount: result.discount,
          freeShipping: result.freeShipping,
        },
        "Coupon applied"
      );
    } catch (error) {
      next(error);
    }
  }

  // public: active offers for the storefront (no usage data)
  async publicOffers(req, res, next) {
    try {
      const now = new Date();
      const coupons = await CouponModel.find({
        isActive: true,
        isPublic: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] },
        ],
      }).select("code title description type value maxDiscount bogo appliesTo products categories brands minOrderAmount endDate excludeDiscountedItems usageLimit usedCount");
      const offers = coupons
        .filter((c) => !c.usageLimit || c.usedCount < c.usageLimit)
        .map((c) => ({ ...c.toObject(), summary: describeCoupon(c), usedCount: undefined, usageLimit: undefined }));
      return ResponseUtil.success(res, offers, "Offers retrieved successfully");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CouponController();
