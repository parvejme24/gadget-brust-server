const express = require('express');
const router = express.Router();
const CartController = require('./cart.controller');

// Cart routes
router.post('/', CartController.addToCart);
router.get('/', CartController.getAllCarts);
router.get('/user/:userId', CartController.getUserCart);
router.get('/user/:userId/summary', CartController.getCartSummary);
router.get('/:id', CartController.getCartItemById);
router.put('/:id', CartController.updateCartItem);
router.patch('/:id/quantity', CartController.updateQuantity);
router.delete('/:id', CartController.removeFromCart);
router.delete('/user/:userId/clear', CartController.clearUserCart);

module.exports = router;