const express = require('express');
const router = express.Router();
const AuthController = require('./auth.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');

// Public routes (no authentication required)
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh', AuthController.refresh);

// Protected routes (require authentication)
router.get('/profile', authenticate, AuthController.getProfile);
router.put('/profile', authenticate, AuthController.updateProfile);
router.delete('/profile', authenticate, AuthController.deleteProfile);
router.put('/change-password', authenticate, AuthController.changePassword);

// Admin only routes (require admin role)
router.post('/users', can('staff'), AuthController.createUser);           // Create user (admin)
router.get('/users', can('customers', 'staff'), AuthController.getAllUsers);           // Get all users (admin)
router.get('/users/:id', can('customers', 'staff'), AuthController.getUserById);       // Get user by ID (admin)
router.get('/users/email/:email', can('customers', 'staff', 'pos'), AuthController.getUserByEmail); // Get user by email (admin)
router.put('/users/:id', can('staff'), AuthController.updateUser);        // Update user (admin)
router.put('/users/:userId/role', can('staff'), AuthController.updateUserRole); // Update user role (admin)
router.delete('/users/:id', can('staff'), AuthController.deleteUser);     // Delete user (admin)

module.exports = router;
