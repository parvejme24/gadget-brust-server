const express = require("express");
const router = express.Router();
const WishlistController = require("./wishlist.controller");
const { authenticate, can, selfOr } = require("../../shared/middlewares/auth.middleware");

// the signed-in user's own wishlist (the user always comes from the token)
router.get("/me", authenticate, WishlistController.getMyWishlist);
router.put("/me", authenticate, WishlistController.replaceWishlist);
router.delete("/me", authenticate, WishlistController.clearMyWishlist);
router.get("/check", authenticate, WishlistController.checkWishlistStatus);
router.post("/", authenticate, WishlistController.addToWishlist);
router.post("/sync", authenticate, WishlistController.syncWishlist);

// a user's wishlist: the user themself or staff who manage customers
router.get("/user/:userId", selfOr("userId", "customers"), WishlistController.getUserWishlist);
router.delete("/:userId/clear", selfOr("userId", "customers"), WishlistController.clearWishlist);

// staff: every wishlist
router.get("/", can("customers"), WishlistController.getAllWishlists);

router.delete("/:id", authenticate, WishlistController.removeFromWishlist);

module.exports = router;
