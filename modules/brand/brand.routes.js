const express = require('express');
const router = express.Router();
const BrandController = require('./brand.controller');
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');
const { uploadSingle, handleUploadError } = require('../../shared/middlewares/upload.middleware');

// Brand routes
router.post('/', can('catalog'), uploadSingle('brandImg'), handleUploadError, BrandController.createBrand);
router.get('/', BrandController.getAllBrands);
router.get('/:id', BrandController.getBrandById);
router.put('/:id', can('catalog'), uploadSingle('brandImg'), handleUploadError, BrandController.updateBrand);
router.delete('/:id', can('catalog'), BrandController.deleteBrand);

module.exports = router;
