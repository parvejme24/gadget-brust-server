const express = require('express');
const router = express.Router();
const CartController = require('./cart.controller');
const { authenticate, can, selfOr } = require('../../shared/middlewares/auth.middleware');

// the signed-in user's own cart (the user always comes from the token)
router.get('/me', authenticate, CartController.getMyCart);
router.put('/me', authenticate, CartController.replaceCart);
router.delete('/me', authenticate, CartController.clearMyCart);
router.post('/', authenticate, CartController.addToCart);
router.post('/sync', authenticate, CartController.syncCart);

// a user's cart: the user themself or staff who manage customers
router.get('/user/:userId', selfOr('userId', 'customers'), CartController.getUserCart);
router.get('/user/:userId/summary', selfOr('userId', 'customers'), CartController.getCartSummary);
router.delete('/user/:userId/clear', selfOr('userId', 'customers'), CartController.clearUserCart);

// staff: every cart
router.get('/', can('customers'), CartController.getAllCarts);

// one line of the caller's cart
router.get('/:id', authenticate, CartController.getCartItemById);
router.put('/:id', authenticate, CartController.updateQuantity);
router.patch('/:id/quantity', authenticate, CartController.updateQuantity);
router.delete('/:id', authenticate, CartController.removeFromCart);

module.exports = router;
