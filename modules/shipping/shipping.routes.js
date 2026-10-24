const express = require('express');
const router = express.Router();
const ShippingController = require('./shipping.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');

// Shipping configuration routes (Admin only)
router.post('/', can('shipping'), ShippingController.createShipping);
router.get('/', ShippingController.getAllShipping);
router.get('/:id', ShippingController.getShippingById);
router.put('/:id', can('shipping'), ShippingController.updateShipping);
router.delete('/:id', can('shipping'), ShippingController.deleteShipping);
router.patch('/:id/toggle-status', can('shipping'), ShippingController.toggleShippingStatus);

// Public route for calculating shipping charges
router.post('/calculate', ShippingController.calculateShippingCharge);

module.exports = router;


