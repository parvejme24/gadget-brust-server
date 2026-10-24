const express = require('express');
const router = express.Router();
const UploadController = require('./upload.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../../shared/middlewares/upload.middleware');

// Upload routes
router.post('/single', can('catalog', 'couriers', 'settings'), uploadSingle('image'), UploadController.uploadSingleImage);
router.post('/multiple', can('catalog', 'couriers', 'settings'), uploadMultiple('images', 10), UploadController.uploadMultipleImages);
router.put('/update', can('catalog', 'couriers', 'settings'), uploadSingle('image'), UploadController.updateImage);
router.delete('/:publicId', can('catalog', 'couriers', 'settings'), UploadController.deleteImage);
router.get('/optimized/:publicId', UploadController.getOptimizedImage);
router.get('/thumbnail/:publicId', UploadController.getThumbnailImage);

// Error handling for upload middleware
router.use(handleUploadError);

module.exports = router;


