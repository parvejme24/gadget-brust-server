const express = require('express');
const router = express.Router();
const ProductController = require('./product.controller');
const { uploadSingle, handleUploadError } = require('../../shared/middlewares/upload.middleware');

// Product routes
router.post('/', uploadSingle('image'), handleUploadError, ProductController.createProduct);
router.get('/', ProductController.getAllProducts);

// Search endpoint (must be before /:id route)
router.get('/search', ProductController.searchProducts);

// Specific product lists
router.get('/slider', ProductController.getSliderProducts);
router.get('/discounted', ProductController.getDiscountedProducts);
router.get('/cheapest', ProductController.getCheapestProducts);
router.get('/newest', ProductController.getNewestProducts);

// Filter by category, brand, remark
router.get('/category/:categoryId', ProductController.getProductsByCategory);
router.get('/subcategory/:subcategoryName', ProductController.getProductsBySubcategory);
router.get('/category/:categoryId/subcategory/:subcategoryName', ProductController.getProductsByCategoryAndSubcategory);
router.get('/brand/:brandId', ProductController.getProductsByBrand);
router.get('/remark/:remark', ProductController.getProductsByRemark);

// Single product operations
router.get('/:id', ProductController.getProductById);
router.put('/:id', uploadSingle('image'), handleUploadError, ProductController.updateProduct);
router.delete('/:id', ProductController.deleteProduct);

module.exports = router;
