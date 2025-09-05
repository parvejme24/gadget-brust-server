const express = require("express");
const router = express.Router();
const WishlistController = require("./wishlist.controller");

// Wishlist routes
router.post("/", WishlistController.addToWishlist);
router.get("/", WishlistController.getAllWishlists);
router.get("/user/:userId", WishlistController.getUserWishlist);
router.get("/check", WishlistController.checkWishlistStatus);
router.delete("/:id", WishlistController.removeFromWishlist);
router.delete("/:userId/clear", WishlistController.clearWishlist);

module.exports = router;
