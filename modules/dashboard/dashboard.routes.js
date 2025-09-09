const express = require('express');
const router = express.Router();
const DashboardController = require('./dashboard.controller');

// Dashboard statistics and analytics routes
router.get('/stats', DashboardController.getDashboardStats);
router.get('/revenue', DashboardController.getRevenueAnalytics);
router.get('/products', DashboardController.getProductAnalytics);
router.get('/customers', DashboardController.getCustomerAnalytics);
router.get('/sales', DashboardController.getSalesAnalytics);
router.get('/activities', DashboardController.getRecentActivities);

module.exports = router;
