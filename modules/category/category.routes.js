const express = require("express");
const router = express.Router();
const CategoryController = require("./category.controller");
const { uploadSingle, handleUploadError } = require("../../shared/middlewares/upload.middleware");

// Category routes
router.post("/", uploadSingle("categoryImg"), handleUploadError, CategoryController.createCategory);
router.get("/", CategoryController.getAllCategories);
router.get("/:id", CategoryController.getCategoryById);
router.get("/:id/subcategories", CategoryController.getCategorySubcategoriesWithProductCounts);
router.put("/:id", uploadSingle("categoryImg"), handleUploadError, CategoryController.updateCategory);
router.delete("/:id", CategoryController.deleteCategory);

// Bulk operations
router.delete("/", CategoryController.deleteAllCategories);

// Subcategory management routes
router.post("/:id/subcategories", CategoryController.addSubcategory);
router.put("/:id/subcategories", CategoryController.updateSubcategory);
router.delete("/:id/subcategories", CategoryController.deleteSubcategory);

module.exports = router;
