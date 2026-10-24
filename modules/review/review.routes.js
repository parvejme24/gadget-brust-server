const express = require('express');
const router = express.Router();
const ReviewController = require('./review.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');

// Review routes
router.post('/', authenticate, ReviewController.createReview);
router.get('/', ReviewController.getAllReviews);
router.get('/product/:productId', ReviewController.getReviewsByProduct);
router.get('/customer/:customerId', ReviewController.getReviewsByCustomer);
router.get('/:id', ReviewController.getReviewById);
router.put('/:id', can('reviews'), ReviewController.updateReview);
router.delete('/:id', can('reviews'), ReviewController.deleteReview);

module.exports = router;

