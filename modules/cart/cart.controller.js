const CartModel = require('./cart.model');
const ResponseUtil = require('../../shared/utils/response.util');

class CartController {
  async addToCart(req, res, next) {
    try {
      const cartItem = new CartModel(req.body);
      const savedItem = await cartItem.save();
      
      // Populate the saved item with product details
      const populatedItem = await CartModel.findById(savedItem._id)
        .populate('product_id', 'title price image')
        .populate('user_id', 'email');
      
      return ResponseUtil.created(res, populatedItem, 'Product added to cart successfully');
    } catch (error) {
      if (error.code === 11000) {
        return ResponseUtil.badRequest(res, 'Product already exists in cart with same color and size');
      }
      next(error);
    }
  }

  async getUserCart(req, res, next) {
    try {
      const { userId } = req.params;
      
      const cartItems = await CartModel.find({ user_id: userId })
        .populate('product_id', 'title price image shortDescription')
        .populate('user_id', 'email')
        .sort({ createdAt: -1 });
      
      // Calculate cart summary
      const cartSummary = cartItems.reduce((summary, item) => {
        summary.totalItems += item.qty;
        summary.totalPrice += (item.qty * item.price);
        return summary;
      }, { totalItems: 0, totalPrice: 0 });
      
      const result = {
        cartItems,
        cartSummary
      };
      
      return ResponseUtil.success(res, result, 'Cart retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateCartItem(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const cartItem = await CartModel.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
        .populate('product_id', 'title price image')
        .populate('user_id', 'email');
      
      if (!cartItem) {
        return ResponseUtil.notFound(res, 'Cart item not found');
      }
      
      return ResponseUtil.success(res, cartItem, 'Cart item updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async removeFromCart(req, res, next) {
    try {
      const { id } = req.params;
      const cartItem = await CartModel.findByIdAndDelete(id);
      
      if (!cartItem) {
        return ResponseUtil.notFound(res, 'Cart item not found');
      }
      
      return ResponseUtil.success(res, null, 'Product removed from cart successfully');
    } catch (error) {
      next(error);
    }
  }

  async clearUserCart(req, res, next) {
    try {
      const { userId } = req.params;
      
      const result = await CartModel.deleteMany({ user_id: userId });
      
      return ResponseUtil.success(res, { deletedCount: result.deletedCount }, 'Cart cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  async getCartItemById(req, res, next) {
    try {
      const { id } = req.params;
      
      const cartItem = await CartModel.findById(id)
        .populate('product_id', 'title price image')
        .populate('user_id', 'email');
      
      if (!cartItem) {
        return ResponseUtil.notFound(res, 'Cart item not found');
      }
      
      return ResponseUtil.success(res, cartItem, 'Cart item retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateQuantity(req, res, next) {
    try {
      const { id } = req.params;
      const { qty } = req.body;
      
      if (qty <= 0) {
        return ResponseUtil.badRequest(res, 'Quantity must be greater than 0');
      }
      
      const cartItem = await CartModel.findByIdAndUpdate(
        id, 
        { qty }, 
        { new: true, runValidators: true }
      ).populate('product_id', 'title price image')
       .populate('user_id', 'email');
      
      if (!cartItem) {
        return ResponseUtil.notFound(res, 'Cart item not found');
      }
      
      return ResponseUtil.success(res, cartItem, 'Quantity updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAllCarts(req, res, next) {
    try {
      const { userId, productId } = req.query;
      
      let filters = {};
      if (userId) filters.user_id = userId;
      if (productId) filters.product_id = productId;
      
      const cartItems = await CartModel.find(filters)
        .populate('product_id', 'title price image')
        .populate('user_id', 'email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, cartItems, 'Carts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getCartSummary(req, res, next) {
    try {
      const { userId } = req.params;
      
      const cartItems = await CartModel.find({ user_id: userId })
        .populate('product_id', 'title price image');
      
      const summary = cartItems.reduce((acc, item) => {
        acc.totalItems += item.qty;
        acc.totalPrice += (item.qty * item.price);
        acc.itemCount += 1;
        return acc;
      }, { totalItems: 0, totalPrice: 0, itemCount: 0 });
      
      return ResponseUtil.success(res, summary, 'Cart summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CartController();
