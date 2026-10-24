const ReviewModel = require('./review.model');
const ResponseUtil = require('../../shared/utils/response.util');
const { notify } = require('../notification/notification.service');

class ReviewController {
  async createReview(req, res, next) {
    try {
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
        .populate('customerID', 'email');

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
        .populate('customerID', 'email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, reviews, 'Reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getReviewById(req, res, next) {
    try {
      const review = await ReviewModel.findById(req.params.id)
        .populate('productID', 'title')
        .populate('customerID', 'email');
      
      if (!review) {
        return ResponseUtil.notFound(res, 'Review not found');
      }
      return ResponseUtil.success(res, review, 'Review retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateReview(req, res, next) {
    try {
      const review = await ReviewModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
        .populate('productID', 'title')
        .populate('customerID', 'email');
      
      if (!review) {
        return ResponseUtil.notFound(res, 'Review not found');
      }
      return ResponseUtil.success(res, review, 'Review updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteReview(req, res, next) {
    try {
      const review = await ReviewModel.findByIdAndDelete(req.params.id);
      if (!review) {
        return ResponseUtil.notFound(res, 'Review not found');
      }
      return ResponseUtil.success(res, null, 'Review deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getReviewsByProduct(req, res, next) {
    try {
      const { productId } = req.params;
      
      const reviews = await ReviewModel.find({ productID: productId })
        .populate('customerID', 'email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, reviews, 'Product reviews retrieved successfully');
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
      
      return ResponseUtil.success(res, reviews, 'Customer reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReviewController();
