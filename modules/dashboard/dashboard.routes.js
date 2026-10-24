const express = require('express');
const router = express.Router();
const DashboardController = require('./dashboard.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');

// Dashboard statistics and analytics routes
router.get('/stats', can('dashboard'), DashboardController.getDashboardStats);
router.get('/revenue', can('dashboard'), DashboardController.getRevenueAnalytics);
router.get('/products', can('dashboard'), DashboardController.getProductAnalytics);
router.get('/customers', can('dashboard'), DashboardController.getCustomerAnalytics);
router.get('/sales', can('dashboard'), DashboardController.getSalesAnalytics);
router.get('/activities', can('dashboard'), DashboardController.getRecentActivities);
router.get('/me', authenticate, DashboardController.getMySummary);

module.exports = router;
