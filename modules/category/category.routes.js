const express = require("express");
const router = express.Router();
const CategoryController = require("./category.controller");
const { authenticate, can } = require('../../shared/middlewares/auth.middleware');
const { uploadSingle, handleUploadError } = require("../../shared/middlewares/upload.middleware");

// Category routes
router.post("/", can('catalog'), uploadSingle("categoryImg"), handleUploadError, CategoryController.createCategory);
router.get("/", CategoryController.getAllCategories);
router.get("/:id", CategoryController.getCategoryById);
router.get("/:id/subcategories", CategoryController.getCategorySubcategoriesWithProductCounts);
router.put("/:id", can('catalog'), uploadSingle("categoryImg"), handleUploadError, CategoryController.updateCategory);
router.delete("/:id", can('catalog'), CategoryController.deleteCategory);

// Bulk operations
router.delete("/", can('catalog'), CategoryController.deleteAllCategories);

// Subcategory management routes
router.post("/:id/subcategories", can('catalog'), CategoryController.addSubcategory);
router.put("/:id/subcategories", can('catalog'), CategoryController.updateSubcategory);
router.delete("/:id/subcategories", can('catalog'), CategoryController.deleteSubcategory);

module.exports = router;
