const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const InvoiceController = require('./invoice.controller');
const { authenticate, optionalAuth, can } = require('../../shared/middlewares/auth.middleware');

// placing and tracking orders is public, so keep bots from flooding it
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CHECKOUT_RATE_LIMIT_MAX) || 30,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});

// storefront (guests or signed-in customers)
router.post('/quote', optionalAuth, InvoiceController.quote);
router.post('/checkout', publicLimiter, optionalAuth, InvoiceController.checkout);
router.get('/track', publicLimiter, InvoiceController.track);
router.get('/mine', authenticate, InvoiceController.getMyInvoices);

// staff
router.post('/', can('orders'), InvoiceController.checkout);
router.get('/', can('orders', 'reports', 'customers'), InvoiceController.getAllInvoices);
router.get('/user/:userId', authenticate, InvoiceController.getUserInvoices);
router.get('/user/:userId/summary', authenticate, InvoiceController.getInvoiceSummary);
router.get('/:id', authenticate, InvoiceController.getInvoiceById);
router.put('/:id', can('orders'), InvoiceController.editOrder);
router.patch('/:id/status', can('orders'), InvoiceController.updateInvoiceStatus);
router.patch('/:id/order-status', can('orders'), InvoiceController.updateOrderStatus);
router.patch('/:id/shipment', can('orders'), InvoiceController.updateShipment);
router.patch('/:id/payment-status', can('orders'), InvoiceController.updatePaymentStatus);
router.delete('/:id', can('orders'), InvoiceController.deleteInvoice);

module.exports = router;
