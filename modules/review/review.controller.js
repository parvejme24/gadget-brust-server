const mongoose = require('mongoose');
const ReviewModel = require('./review.model');
const ProductModel = require('../product/product.model');
const ResponseUtil = require('../../shared/utils/response.util');
const { hasPermission } = require('../../shared/config/permissions');

const isAuthor = (review, user) => String(review.customerID) === String(user.userId);
const isModerator = (user) => hasPermission(user.role, 'reviews');

// authors may change only the text and rating; moderators may also fix the product or author
// Emails are private: everyone gets the author's name, only moderators also get the email
const present = (review, user) => {
  if (!review) return review;
  const doc = review.toObject ? review.toObject() : review;
  const author = doc.customerID && typeof doc.customerID === 'object' ? doc.customerID : null;
  doc.customerName = author?.fullName || (doc.customerEmail || '').split('@')[0] || 'Customer';
  if (user && (isModerator(user) || String(author?._id || doc.customerID) === String(user.userId))) return doc;
  delete doc.customerEmail;
  if (author) doc.customerID = { _id: author._id, fullName: author.fullName };
  return doc;
};
const presentAll = (reviews, user) => reviews.map((r) => present(r, user));

const editableFields = (user) =>
  isModerator(user) ? ['reviewText', 'rating', 'productID', 'customerEmail'] : ['reviewText', 'rating'];
const { notify } = require('../notification/notification.service');

class ReviewController {
  async createReview(req, res, next) {
    try {
      const { productID } = req.body;
      if (!mongoose.isValidObjectId(productID) || !(await ProductModel.exists({ _id: productID }))) {
        return ResponseUtil.badRequest(res, 'Product not found');
      }
      // one review per product per customer; they can edit it instead
      if (await ReviewModel.exists({ productID, customerID: req.user.userId })) {
        return ResponseUtil.error(res, 'You have already reviewed this product. Edit your review instead.', 409);
      }

      // the author always comes from the token, never from the request body
      const review = new ReviewModel({
        productID: req.body.productID,
        reviewText: req.body.reviewText,
        rating: req.body.rating,
        customerID: req.user.userId,
        customerEmail: req.user.email,
      });
      const savedReview = await review.save();

      // Populate the saved review
      const populatedReview = await ReviewModel.findById(savedReview._id)
        .populate('productID', 'title')
        .populate('customerID', 'email fullName');

      await notify({
        type: 'review.new',
        permission: 'reviews',
        title: `New ${savedReview.rating}★ review`,
        message: `${populatedReview.productID?.title || 'A product'}: "${savedReview.reviewText.slice(0, 80)}"`,
        link: '/dashboard/reviews',
      });

      return ResponseUtil.created(res, populatedReview, 'Review created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAllReviews(req, res, next) {
    try {
      const { productID, customerID } = req.query;
      
      let filters = {};
      if (productID) filters.productID = productID;
      if (customerID) filters.customerID = customerID;
      
      const reviews = await ReviewModel.find(filters)
        .populate('productID', 'title')
        .populate('customerID', 'email fullName')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, presentAll(reviews, req.user), 'Reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getReviewById(req, res, next) {
    try {
      const review = await ReviewModel.findById(req.params.id)
        .populate('productID', 'title')
        .populate('customerID', 'email fullName');
      
      if (!review) {
        return ResponseUtil.notFound(res, 'Review not found');
      }
      return ResponseUtil.success(res, present(review, req.user), 'Review retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateReview(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return ResponseUtil.notFound(res, 'Review not found');
      const existing = await ReviewModel.findById(req.params.id);
      if (!existing) return ResponseUtil.notFound(res, 'Review not found');
      if (!isAuthor(existing, req.user) && !isModerator(req.user)) {
        return ResponseUtil.forbidden(res, 'You can only edit your own reviews');
      }

      const changes = {};
      editableFields(req.user).forEach((key) => {
        if (req.body[key] !== undefined) changes[key] = req.body[key];
      });
      const review = await ReviewModel.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true })
        .populate('productID', 'title')
        .populate('customerID', 'email fullName');
      return ResponseUtil.success(res, present(review, req.user), 'Review updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteReview(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return ResponseUtil.notFound(res, 'Review not found');
      const review = await ReviewModel.findById(req.params.id);
      if (!review) return ResponseUtil.notFound(res, 'Review not found');
      if (!isAuthor(review, req.user) && !isModerator(req.user)) {
        return ResponseUtil.forbidden(res, 'You can only delete your own reviews');
      }
      await review.deleteOne();
      return ResponseUtil.success(res, null, 'Review deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getReviewsByProduct(req, res, next) {
    try {
      const { productId } = req.params;
      
      const reviews = await ReviewModel.find({ productID: productId })
        .populate('customerID', 'email fullName')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, presentAll(reviews, req.user), 'Product reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getReviewsByCustomer(req, res, next) {
    try {
      const { customerId } = req.params;
      
      const reviews = await ReviewModel.find({ customerID: customerId })
        .populate('productID', 'title image')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, presentAll(reviews, req.user), 'Customer reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReviewController();
