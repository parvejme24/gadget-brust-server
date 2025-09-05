const express = require('express');
const router = express.Router();
const UploadController = require('./upload.controller');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../../shared/middlewares/upload.middleware');

// Upload routes
router.post('/single', uploadSingle('image'), UploadController.uploadSingleImage);
router.post('/multiple', uploadMultiple('images', 10), UploadController.uploadMultipleImages);
router.put('/update', uploadSingle('image'), UploadController.updateImage);
router.delete('/:publicId', UploadController.deleteImage);
router.get('/optimized/:publicId', UploadController.getOptimizedImage);
router.get('/thumbnail/:publicId', UploadController.getThumbnailImage);

// Error handling for upload middleware
router.use(handleUploadError);

module.exports = router;


