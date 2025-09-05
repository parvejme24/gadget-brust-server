const express = require('express');
const router = express.Router();
const BrandController = require('./brand.controller');
const { uploadSingle, handleUploadError } = require('../../shared/middlewares/upload.middleware');

// Brand routes
router.post('/', uploadSingle('brandImg'), handleUploadError, BrandController.createBrand);
router.get('/', BrandController.getAllBrands);
router.get('/:id', BrandController.getBrandById);
router.put('/:id', uploadSingle('brandImg'), handleUploadError, BrandController.updateBrand);
router.delete('/:id', BrandController.deleteBrand);

module.exports = router;
