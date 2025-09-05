const express = require('express');
const router = express.Router();
const InvoiceController = require('./invoice.controller');

// Invoice routes
router.post('/', InvoiceController.createInvoice);
router.get('/', InvoiceController.getAllInvoices);
router.get('/user/:userId', InvoiceController.getUserInvoices);
router.get('/user/:userId/summary', InvoiceController.getInvoiceSummary);
router.get('/:id', InvoiceController.getInvoiceById);
router.put('/:id', InvoiceController.updateInvoice);
router.patch('/:id/status', InvoiceController.updateInvoiceStatus);
router.patch('/:id/payment-status', InvoiceController.updatePaymentStatus);
router.delete('/:id', InvoiceController.deleteInvoice);

module.exports = router;
