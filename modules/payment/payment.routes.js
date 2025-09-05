const express = require('express');
const router = express.Router();
const PaymentController = require('./payment.controller');

// Get available payment methods
router.get('/methods', PaymentController.getPaymentMethods);

// Stripe Payment Routes
router.post('/stripe/create-intent', PaymentController.createStripePayment);
router.post('/stripe/confirm', PaymentController.confirmStripePayment);

// SSL Commerz Payment Routes
router.post('/ssl-commerz/create-session', PaymentController.createSSLCommerzSession);
router.post('/ssl-commerz/callback', PaymentController.sslCommerzCallback);
router.post('/ssl-commerz/ipn', PaymentController.sslCommerzIPN);

// ShurjoPay Payment Routes
router.post('/shurjopay/create-session', PaymentController.createShurjoPaySession);
router.post('/shurjopay/callback', PaymentController.shurjoPayCallback);
router.post('/shurjopay/ipn', PaymentController.shurjoPayIPN);

// Cash on Delivery Routes
router.post('/cash-on-delivery', PaymentController.createCashOnDelivery);

// Payment Management Routes
router.get('/:id', PaymentController.getPaymentById);
router.get('/user/:user_id', PaymentController.getUserPayments);
router.get('/admin/all', PaymentController.getAllPayments);
router.patch('/:id/status', PaymentController.updatePaymentStatus);
router.post('/:id/refund', PaymentController.processRefund);
router.get('/admin/stats', PaymentController.getPaymentStats);

module.exports = router;
