const express = require('express');
const router = express.Router();
const ReviewController = require('./review.controller');
const { authenticate, optionalAuth } = require('../../shared/middlewares/auth.middleware');

// Review routes
router.post('/', authenticate, ReviewController.createReview);
router.get('/', optionalAuth, ReviewController.getAllReviews);
router.get('/product/:productId', optionalAuth, ReviewController.getReviewsByProduct);
router.get('/customer/:customerId', optionalAuth, ReviewController.getReviewsByCustomer);
router.get('/:id', optionalAuth, ReviewController.getReviewById);
router.put('/:id', authenticate, ReviewController.updateReview); // author or moderator
router.delete('/:id', authenticate, ReviewController.deleteReview); // author or moderator

module.exports = router;

