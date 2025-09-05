const WishlistModel = require('./wishlist.model');
const ResponseUtil = require('../../shared/utils/response.util');

class WishlistController {
  async addToWishlist(req, res, next) {
    try {
      const wishlistItem = new WishlistModel(req.body);
      const savedItem = await wishlistItem.save();
      
      // Populate the saved item
      const populatedItem = await WishlistModel.findById(savedItem._id)
        .populate('productID', 'title price image')
        .populate('customerID', 'email');
      
      return ResponseUtil.created(res, populatedItem, 'Product added to wishlist successfully');
    } catch (error) {
      if (error.code === 11000) {
        return ResponseUtil.badRequest(res, 'Product already exists in wishlist');
      }
      next(error);
    }
  }

  async getUserWishlist(req, res, next) {
    try {
      const { userId } = req.params;
      
      const wishlistItems = await WishlistModel.find({ customerID: userId })
        .populate('productID', 'title price image shortDescription')
        .populate('customerID', 'email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, wishlistItems, 'User wishlist retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async removeFromWishlist(req, res, next) {
    try {
      const { id } = req.params;
      const wishlistItem = await WishlistModel.findByIdAndDelete(id);
      
      if (!wishlistItem) {
        return ResponseUtil.notFound(res, 'Wishlist item not found');
      }
      
      return ResponseUtil.success(res, null, 'Product removed from wishlist successfully');
    } catch (error) {
      next(error);
    }
  }

  async checkWishlistStatus(req, res, next) {
    try {
      const { productID, customerID } = req.query;
      
      const wishlistItem = await WishlistModel.findOne({ productID, customerID });
      
      return ResponseUtil.success(res, { 
        isInWishlist: !!wishlistItem,
        wishlistItem: wishlistItem || null
      }, 'Wishlist status checked successfully');
    } catch (error) {
      next(error);
    }
  }

  async clearWishlist(req, res, next) {
    try {
      const { userId } = req.params;
      
      const result = await WishlistModel.deleteMany({ customerID: userId });
      
      return ResponseUtil.success(res, { deletedCount: result.deletedCount }, 'Wishlist cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAllWishlists(req, res, next) {
    try {
      const { customerID, productID } = req.query;
      
      let filters = {};
      if (customerID) filters.customerID = customerID;
      if (productID) filters.productID = productID;
      
      const wishlistItems = await WishlistModel.find(filters)
        .populate('productID', 'title price image')
        .populate('customerID', 'email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, wishlistItems, 'Wishlists retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WishlistController();
