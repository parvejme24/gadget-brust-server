const mongoose = require('mongoose');
const CartModel = require('./cart.model');
const ProductModel = require('../product/product.model');
const ResponseUtil = require('../../shared/utils/response.util');
const { hasPermission } = require('../../shared/config/permissions');

const PRODUCT_FIELDS = 'title price discount discountPrice image stock star remark category shortDescription';
const MAX_SYNC_ITEMS = 100;

const populate = (query) =>
  query
    .populate({ path: 'product_id', select: `${PRODUCT_FIELDS} brand subcategory`, populate: { path: 'brand', select: 'brandName' } })
    .populate('user_id', 'email');

const unitPrice = (product) => (product.discount > 0 ? product.price - (product.price * product.discount) / 100 : product.price);

// quantities are whole numbers from 1 up to what's in stock
const clampQty = (qty, stock) => Math.max(1, Math.min(Math.floor(Number(qty) || 1), Math.max(stock, 1)));

const variant = (body) => ({
  color: String(body.color || '').trim() || 'Default',
  size: String(body.size || '').trim() || 'Standard',
});

// the cart with current prices; items whose product was deleted are dropped
const cartOf = async (userId) => {
  const items = await populate(CartModel.find({ user_id: userId })).sort({ createdAt: -1 });
  const cartItems = items.filter((item) => item.product_id);
  const cartSummary = cartItems.reduce(
    (summary, item) => {
      const price = unitPrice(item.product_id);
      summary.totalItems += item.qty;
      summary.totalPrice += item.qty * price;
      summary.itemCount += 1;
      return summary;
    },
    { totalItems: 0, totalPrice: 0, itemCount: 0 }
  );
  return { cartItems, cartSummary };
};

// adds qty to the matching line (same product, color, size) or creates it
const addLine = async (userId, body, { replaceQty = false } = {}) => {
  if (!mongoose.isValidObjectId(body.product_id)) return { error: 'A valid product_id is required' };
  const product = await ProductModel.findById(body.product_id).select('price discount stock weight');
  if (!product) return { error: 'Product not found', status: 404 };
  if (product.stock <= 0) return { error: 'This product is out of stock' };

  const key = { user_id: userId, product_id: product._id, ...variant(body) };
  const existing = await CartModel.findOne(key);
  const wanted = replaceQty || !existing ? Number(body.qty) || 1 : existing.qty + (Number(body.qty) || 1);
  const qty = clampQty(wanted, product.stock);
  const line = await CartModel.findOneAndUpdate(
    key,
    { $set: { qty, price: unitPrice(product), weight: product.weight || 0 } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return { line, created: !existing, capped: qty < wanted };
};

// the caller's own line, or null
const ownLine = (req) =>
  mongoose.isValidObjectId(req.params.id) ? CartModel.findOne({ _id: req.params.id, user_id: req.user.userId }) : null;

class CartController {
  async getMyCart(req, res, next) {
    try {
      return ResponseUtil.success(res, await cartOf(req.user.userId), 'Cart retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async addToCart(req, res, next) {
    try {
      const result = await addLine(req.user.userId, req.body);
      if (result.error) return ResponseUtil.error(res, result.error, result.status || 400);
      const populatedItem = await populate(CartModel.findById(result.line._id));
      const message = result.capped ? 'Added to cart (quantity limited to what is in stock)' : 'Product added to cart successfully';
      return result.created ? ResponseUtil.created(res, populatedItem, message) : ResponseUtil.success(res, populatedItem, message);
    } catch (error) {
      next(error);
    }
  }

  // Merge a guest (browser/device) cart into the saved one after sign-in.
  // body: { items: [{ product_id, qty, color, size }] }; the larger quantity wins for a line in both
  async syncCart(req, res, next) {
    try {
      const items = Array.isArray(req.body.items) ? req.body.items.slice(0, MAX_SYNC_ITEMS) : null;
      if (!items) return ResponseUtil.badRequest(res, 'items must be an array');

      const skipped = [];
      for (const item of items) {
        const key = variant(item);
        const existing = mongoose.isValidObjectId(item.product_id)
          ? await CartModel.findOne({ user_id: req.user.userId, product_id: item.product_id, ...key })
          : null;
        const qty = Math.max(Number(item.qty) || 1, existing?.qty || 0);
        const result = await addLine(req.user.userId, { ...item, qty }, { replaceQty: true });
        if (result.error) skipped.push({ product_id: item.product_id, reason: result.error });
      }

      return ResponseUtil.success(res, { ...(await cartOf(req.user.userId)), skipped }, 'Cart synced');
    } catch (error) {
      next(error);
    }
  }

  // Replace the saved cart with exactly these lines (the storefront saves its whole cart after each change).
  // body: { items: [{ product_id, qty, color, size }] }
  async replaceCart(req, res, next) {
    try {
      const items = Array.isArray(req.body.items) ? req.body.items.slice(0, MAX_SYNC_ITEMS) : null;
      if (!items) return ResponseUtil.badRequest(res, 'items must be an array');

      const skipped = [];
      const keep = [];
      for (const item of items) {
        const result = await addLine(req.user.userId, item, { replaceQty: true });
        if (result.error) skipped.push({ product_id: item.product_id, reason: result.error });
        else keep.push(result.line._id);
      }
      await CartModel.deleteMany({ user_id: req.user.userId, _id: { $nin: keep } });

      return ResponseUtil.success(res, { ...(await cartOf(req.user.userId)), skipped }, 'Cart saved');
    } catch (error) {
      next(error);
    }
  }

  async updateQuantity(req, res, next) {
    try {
      const qty = Number(req.body.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return ResponseUtil.badRequest(res, 'Quantity must be greater than 0');
      }
      const line = await ownLine(req);
      if (!line) return ResponseUtil.notFound(res, 'Cart item not found');

      const product = await ProductModel.findById(line.product_id).select('price discount stock');
      if (!product) return ResponseUtil.notFound(res, 'Product no longer exists');
      line.qty = clampQty(qty, product.stock);
      line.price = unitPrice(product);
      await line.save();

      return ResponseUtil.success(res, await populate(CartModel.findById(line._id)), 'Quantity updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async removeFromCart(req, res, next) {
    try {
      const line = await ownLine(req);
      if (!line) return ResponseUtil.notFound(res, 'Cart item not found');
      await line.deleteOne();
      return ResponseUtil.success(res, null, 'Product removed from cart successfully');
    } catch (error) {
      next(error);
    }
  }

  async clearMyCart(req, res, next) {
    try {
      const result = await CartModel.deleteMany({ user_id: req.user.userId });
      return ResponseUtil.success(res, { deletedCount: result.deletedCount }, 'Cart cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  async getCartItemById(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return ResponseUtil.notFound(res, 'Cart item not found');
      const cartItem = await populate(CartModel.findById(req.params.id));
      const isOwner = cartItem && String(cartItem.user_id?._id || cartItem.user_id) === String(req.user.userId);
      if (!cartItem || (!isOwner && !hasPermission(req.user.role, 'customers'))) {
        return ResponseUtil.notFound(res, 'Cart item not found');
      }
      return ResponseUtil.success(res, cartItem, 'Cart item retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // /user/:userId routes: the user themself, or staff who can see customers
  async getUserCart(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.userId)) return ResponseUtil.badRequest(res, 'Invalid user id');
      return ResponseUtil.success(res, await cartOf(req.params.userId), 'Cart retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getCartSummary(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.userId)) return ResponseUtil.badRequest(res, 'Invalid user id');
      const { cartSummary } = await cartOf(req.params.userId);
      return ResponseUtil.success(res, cartSummary, 'Cart summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async clearUserCart(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.userId)) return ResponseUtil.badRequest(res, 'Invalid user id');
      const result = await CartModel.deleteMany({ user_id: req.params.userId });
      return ResponseUtil.success(res, { deletedCount: result.deletedCount }, 'Cart cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  // staff: every cart line, optionally filtered by ?userId= or ?productId=
  async getAllCarts(req, res, next) {
    try {
      const { userId, productId } = req.query;
      const filters = {};
      if (mongoose.isValidObjectId(userId)) filters.user_id = userId;
      if (mongoose.isValidObjectId(productId)) filters.product_id = productId;

      const cartItems = await populate(CartModel.find(filters)).sort({ createdAt: -1 });
      return ResponseUtil.success(res, cartItems, 'Carts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CartController();
