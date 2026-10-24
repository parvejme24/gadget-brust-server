const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const PaymentController = require('./payment.controller');
const { OrderPaymentController } = require('./orderPayment.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');

// Storefront order payments (guests + customers, identified by order number + phone)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CHECKOUT_RATE_LIMIT_MAX) || 30,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});
router.get('/order/methods', OrderPaymentController.methods);
router.post('/order/start', orderLimiter, OrderPaymentController.start);
router.post('/order/cod', orderLimiter, OrderPaymentController.switchToCod);
router.all('/order/ssl-return', OrderPaymentController.sslReturn);
router.post('/order/ssl-ipn', OrderPaymentController.sslIpn);
router.get('/order/stripe-return', OrderPaymentController.stripeReturn);

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
router.get('/admin/all', can('payments', 'reports'), PaymentController.getAllPayments);
router.patch('/:id/status', can('payments', 'reports'), PaymentController.updatePaymentStatus);
router.post('/:id/refund', can('payments', 'reports'), PaymentController.processRefund);
router.get('/admin/stats', can('payments', 'reports'), PaymentController.getPaymentStats);

module.exports = router;
