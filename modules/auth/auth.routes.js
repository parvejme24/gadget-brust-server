const express = require('express');
const router = express.Router();
const AuthController = require('./auth.controller');

// Public routes (no authentication required)
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

// Protected routes (require authentication)
router.get('/profile', AuthController.getProfile);
router.put('/profile', AuthController.updateProfile);
router.delete('/profile', AuthController.deleteProfile);

// Admin only routes (require admin role)
router.post('/users', AuthController.createUser);           // Create user (admin)
router.get('/users', AuthController.getAllUsers);           // Get all users (admin)
router.get('/users/:id', AuthController.getUserById);       // Get user by ID (admin)
router.get('/users/email/:email', AuthController.getUserByEmail); // Get user by email (admin)
router.put('/users/:id', AuthController.updateUser);        // Update user (admin)
router.put('/users/:userId/role', AuthController.updateUserRole); // Update user role (admin)
router.delete('/users/:id', AuthController.deleteUser);     // Delete user (admin)

module.exports = router;

