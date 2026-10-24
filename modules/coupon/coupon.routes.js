const express = require("express");
const router = express.Router();
const CouponController = require("./coupon.controller");
const { can, optionalAuth } = require("../../shared/middlewares/auth.middleware");

// public
router.get("/offers", CouponController.publicOffers);
router.post("/apply", optionalAuth, CouponController.apply);

// staff
router.get("/", can("coupons", "pos"), CouponController.getAll);
router.get("/:id", can("coupons"), CouponController.getById);
router.post("/", can("coupons"), CouponController.create);
router.put("/:id", can("coupons"), CouponController.update);
router.patch("/:id/toggle", can("coupons"), CouponController.toggle);
router.delete("/:id", can("coupons"), CouponController.remove);

module.exports = router;
