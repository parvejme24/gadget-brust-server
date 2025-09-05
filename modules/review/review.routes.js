const express = require('express');
const router = express.Router();
const ReviewController = require('./review.controller');

// Review routes
router.post('/', ReviewController.createReview);
router.get('/', ReviewController.getAllReviews);
router.get('/product/:productId', ReviewController.getReviewsByProduct);
router.get('/customer/:customerId', ReviewController.getReviewsByCustomer);
router.get('/:id', ReviewController.getReviewById);
router.put('/:id', ReviewController.updateReview);
router.delete('/:id', ReviewController.deleteReview);

module.exports = router;

