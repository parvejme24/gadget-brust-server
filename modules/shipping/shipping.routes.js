const express = require('express');
const router = express.Router();
const ShippingController = require('./shipping.controller');

// Shipping configuration routes (Admin only)
router.post('/', ShippingController.createShipping);
router.get('/', ShippingController.getAllShipping);
router.get('/:id', ShippingController.getShippingById);
router.put('/:id', ShippingController.updateShipping);
router.delete('/:id', ShippingController.deleteShipping);
router.patch('/:id/toggle-status', ShippingController.toggleShippingStatus);

// Public route for calculating shipping charges
router.post('/calculate', ShippingController.calculateShippingCharge);

module.exports = router;


