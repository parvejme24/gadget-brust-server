const mongoose = require('mongoose');
const WishlistModel = require('./wishlist.model');
const ProductModel = require('../product/product.model');
const ResponseUtil = require('../../shared/utils/response.util');

const PRODUCT_FIELDS = 'title price discount discountPrice image stock star remark category shortDescription';
const MAX_SYNC_ITEMS = 200;

const populate = (query) =>
  query
    .populate({ path: 'productID', select: `${PRODUCT_FIELDS} brand subcategory`, populate: { path: 'brand', select: 'brandName' } })
    .populate('customerID', 'email');

// items whose product was deleted are dropped
const wishlistOf = async (userId) =>
  (await populate(WishlistModel.find({ customerID: userId })).sort({ createdAt: -1 })).filter((item) => item.productID);

// adds the product once; returns { item, created } or { error, status }
const addItem = async (user, productID) => {
  if (!mongoose.isValidObjectId(productID)) return { error: 'A valid productID is required' };
  if (!(await ProductModel.exists({ _id: productID }))) return { error: 'Product not found', status: 404 };

  const existing = await WishlistModel.findOne({ productID, customerEmail: user.email });
  if (existing) {
    // rows created before the user id was stored
    if (!existing.customerID) await existing.updateOne({ customerID: user.userId });
    return { item: existing, created: false };
  }
  try {
    const item = await WishlistModel.create({ productID, customerID: user.userId, customerEmail: user.email });
    return { item, created: true };
  } catch (error) {
    // a parallel request added it first
    if (error.code === 11000) return { item: await WishlistModel.findOne({ productID, customerEmail: user.email }), created: false };
    throw error;
  }
};

class WishlistController {
  async getMyWishlist(req, res, next) {
    try {
      return ResponseUtil.success(res, await wishlistOf(req.user.userId), 'Wishlist retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async addToWishlist(req, res, next) {
    try {
      const result = await addItem(req.user, req.body.productID);
      if (result.error) return ResponseUtil.error(res, result.error, result.status || 400);
      const populatedItem = await populate(WishlistModel.findById(result.item._id));
      return result.created
        ? ResponseUtil.created(res, populatedItem, 'Product added to wishlist successfully')
        : ResponseUtil.success(res, populatedItem, 'Product is already in your wishlist');
    } catch (error) {
      next(error);
    }
  }

  // Merge a guest (browser/device) wishlist after sign-in. body: { productIDs: [id, ...] }
  async syncWishlist(req, res, next) {
    try {
      const ids = Array.isArray(req.body.productIDs) ? req.body.productIDs.slice(0, MAX_SYNC_ITEMS) : null;
      if (!ids) return ResponseUtil.badRequest(res, 'productIDs must be an array');

      const skipped = [];
      for (const id of [...new Set(ids.map(String))]) {
        const result = await addItem(req.user, id);
        if (result.error) skipped.push({ productID: id, reason: result.error });
      }
      return ResponseUtil.success(res, { items: await wishlistOf(req.user.userId), skipped }, 'Wishlist synced');
    } catch (error) {
      next(error);
    }
  }

  // Replace the saved wishlist with exactly these products. body: { productIDs: [id, ...] }
  async replaceWishlist(req, res, next) {
    try {
      const ids = Array.isArray(req.body.productIDs) ? req.body.productIDs.slice(0, MAX_SYNC_ITEMS) : null;
      if (!ids) return ResponseUtil.badRequest(res, 'productIDs must be an array');

      const skipped = [];
      const keep = [];
      for (const id of [...new Set(ids.map(String))]) {
        const result = await addItem(req.user, id);
        if (result.error) skipped.push({ productID: id, reason: result.error });
        else keep.push(result.item.productID);
      }
      await WishlistModel.deleteMany({ customerID: req.user.userId, productID: { $nin: keep } });

      return ResponseUtil.success(res, { items: await wishlistOf(req.user.userId), skipped }, 'Wishlist saved');
    } catch (error) {
      next(error);
    }
  }

  // :id is the wishlist row id or the product id, so the storefront can remove by product
  async removeFromWishlist(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return ResponseUtil.notFound(res, 'Wishlist item not found');
      const wishlistItem = await WishlistModel.findOneAndDelete({
        customerID: req.user.userId,
        $or: [{ _id: id }, { productID: id }],
      });
      if (!wishlistItem) return ResponseUtil.notFound(res, 'Wishlist item not found');
      return ResponseUtil.success(res, null, 'Product removed from wishlist successfully');
    } catch (error) {
      next(error);
    }
  }

  // ?productID= for the signed-in user
  async checkWishlistStatus(req, res, next) {
    try {
      const { productID } = req.query;
      if (!mongoose.isValidObjectId(productID)) return ResponseUtil.badRequest(res, 'A valid productID is required');
      const wishlistItem = await WishlistModel.findOne({ productID, customerID: req.user.userId });
      return ResponseUtil.success(
        res,
        { isInWishlist: !!wishlistItem, wishlistItem: wishlistItem || null },
        'Wishlist status checked successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async clearMyWishlist(req, res, next) {
    try {
      const result = await WishlistModel.deleteMany({ customerID: req.user.userId });
      return ResponseUtil.success(res, { deletedCount: result.deletedCount }, 'Wishlist cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  // /user/:userId routes: the user themself, or staff who can see customers
  async getUserWishlist(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.userId)) return ResponseUtil.badRequest(res, 'Invalid user id');
      return ResponseUtil.success(res, await wishlistOf(req.params.userId), 'User wishlist retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async clearWishlist(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.userId)) return ResponseUtil.badRequest(res, 'Invalid user id');
      const result = await WishlistModel.deleteMany({ customerID: req.params.userId });
      return ResponseUtil.success(res, { deletedCount: result.deletedCount }, 'Wishlist cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  // staff: every wishlist row, optionally filtered by ?customerID= or ?productID=
  async getAllWishlists(req, res, next) {
    try {
      const { customerID, productID } = req.query;
      const filters = {};
      if (mongoose.isValidObjectId(customerID)) filters.customerID = customerID;
      if (mongoose.isValidObjectId(productID)) filters.productID = productID;

      const wishlistItems = await populate(WishlistModel.find(filters)).sort({ createdAt: -1 });
      return ResponseUtil.success(res, wishlistItems, 'Wishlists retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WishlistController();
