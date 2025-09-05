const CategoryModel = require("./category.model");
const ResponseUtil = require("../../shared/utils/response.util");
const UploadUtil = require("../../shared/utils/upload.util");

class CategoryController {
  async createCategory(req, res, next) {
    try {
      const categoryData = { ...req.body };

      // Handle subcategories - convert string to array if needed
      if (categoryData.subcategories) {
        if (typeof categoryData.subcategories === 'string') {
          try {
            categoryData.subcategories = JSON.parse(categoryData.subcategories);
          } catch (error) {
            // If parsing fails, treat as single item array
            categoryData.subcategories = [categoryData.subcategories];
          }
        }
        // Ensure it's an array
        if (!Array.isArray(categoryData.subcategories)) {
          categoryData.subcategories = [categoryData.subcategories];
        }
      }

      // Handle image upload if file is present
      if (req.file) {
        const uploadResult = await UploadUtil.uploadImage(
          req.file.buffer,
          "gadget-brust/categories",
          `category_${Date.now()}`
        );

        if (!uploadResult.success) {
          return ResponseUtil.badRequest(res, uploadResult.error);
        }

        categoryData.categoryImg = {
          url: uploadResult.url
        };
      }

      const category = new CategoryModel(categoryData);
      const savedCategory = await category.save();
      return ResponseUtil.created(
        res,
        savedCategory,
        "Category created successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getAllCategories(req, res, next) {
    try {
      const categories = await CategoryModel.find();
      return ResponseUtil.success(
        res,
        categories,
        "Categories retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getCategoryById(req, res, next) {
    try {
      const category = await CategoryModel.findById(req.params.id);
      
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }
      return ResponseUtil.success(
        res,
        category,
        "Category retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req, res, next) {
    try {
      const updateData = { ...req.body };

      // Handle subcategories - convert string to array if needed
      if (updateData.subcategories) {
        if (typeof updateData.subcategories === 'string') {
          try {
            updateData.subcategories = JSON.parse(updateData.subcategories);
          } catch (error) {
            // If parsing fails, treat as single item array
            updateData.subcategories = [updateData.subcategories];
          }
        }
        // Ensure it's an array
        if (!Array.isArray(updateData.subcategories)) {
          updateData.subcategories = [updateData.subcategories];
        }
      }

      // Handle image upload if file is present
      if (req.file) {
        // Get current category to check if it has an image
        const currentCategory = await CategoryModel.findById(req.params.id);
        if (!currentCategory) {
          return ResponseUtil.notFound(res, "Category not found");
        }

        // Delete old image if exists (you might want to implement this)
        // if (currentCategory.categoryImg) {
        //   await UploadUtil.deleteImage(currentCategory.categoryImg);
        // }

        // Upload new image
        const uploadResult = await UploadUtil.uploadImage(
          req.file.buffer,
          "gadget-brust/categories",
          `category_${Date.now()}`
        );

        if (!uploadResult.success) {
          return ResponseUtil.badRequest(res, uploadResult.error);
        }

        updateData.categoryImg = {
          url: uploadResult.url
        };
      }

      const category = await CategoryModel.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }
      return ResponseUtil.success(
        res,
        category,
        "Category updated successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      const category = await CategoryModel.findById(req.params.id);
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }

      // Delete image from Cloudinary if exists (you might want to implement this)
      // if (category.categoryImg) {
      //   await UploadUtil.deleteImage(category.categoryImg);
      // }

      // Delete category
      await CategoryModel.findByIdAndDelete(req.params.id);
      return ResponseUtil.success(res, null, "Category deleted successfully");
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add subcategory to a category
   */
  async addSubcategory(req, res, next) {
    try {
      const { id } = req.params;
      const { subcategoryName } = req.body;

      if (!subcategoryName) {
        return ResponseUtil.badRequest(res, "Subcategory name is required");
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }

      // Check if subcategory already exists
      if (category.subcategories.includes(subcategoryName)) {
        return ResponseUtil.badRequest(res, "Subcategory already exists in this category");
      }

      // Add subcategory to array
      category.subcategories.push(subcategoryName);
      await category.save();

      return ResponseUtil.success(
        res,
        category,
        "Subcategory added successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update subcategory in a category
   */
  async updateSubcategory(req, res, next) {
    try {
      const { id } = req.params;
      const { oldSubcategoryName, newSubcategoryName } = req.body;

      if (!oldSubcategoryName || !newSubcategoryName) {
        return ResponseUtil.badRequest(res, "Both old and new subcategory names are required");
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }

      // Check if old subcategory exists
      const subcategoryIndex = category.subcategories.indexOf(oldSubcategoryName);
      if (subcategoryIndex === -1) {
        return ResponseUtil.notFound(res, "Subcategory not found");
      }

      // Check if new name already exists
      if (category.subcategories.includes(newSubcategoryName)) {
        return ResponseUtil.badRequest(res, "Subcategory with new name already exists");
      }

      // Update subcategory name
      category.subcategories[subcategoryIndex] = newSubcategoryName;
      await category.save();

      return ResponseUtil.success(
        res,
        category,
        "Subcategory updated successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete subcategory from a category
   */
  async deleteSubcategory(req, res, next) {
    try {
      const { id } = req.params;
      const { subcategoryName } = req.body;

      if (!subcategoryName) {
        return ResponseUtil.badRequest(res, "Subcategory name is required");
      }

      const category = await CategoryModel.findById(id);
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }

      // Check if subcategory exists
      const subcategoryIndex = category.subcategories.indexOf(subcategoryName);
      if (subcategoryIndex === -1) {
        return ResponseUtil.notFound(res, "Subcategory not found");
      }

      // Remove subcategory from array
      category.subcategories.splice(subcategoryIndex, 1);
      await category.save();

      return ResponseUtil.success(
        res,
        category,
        "Subcategory deleted successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete all categories
   */
  async deleteAllCategories(req, res, next) {
    try {
      // Get count before deletion
      const countBefore = await CategoryModel.countDocuments();
      
      if (countBefore === 0) {
        return ResponseUtil.success(
          res,
          { deletedCount: 0 },
          "No categories found to delete"
        );
      }

      // Delete all categories
      const result = await CategoryModel.deleteMany({});
      
      return ResponseUtil.success(
        res,
        { 
          deletedCount: result.deletedCount,
          totalBefore: countBefore
        },
        `Successfully deleted ${result.deletedCount} categories`
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get category subcategories with product counts
   */
  async getCategorySubcategoriesWithProductCounts(req, res, next) {
    try {
      const { id } = req.params;

      // Find the category
      const category = await CategoryModel.findById(id);
      if (!category) {
        return ResponseUtil.notFound(res, "Category not found");
      }

      // Get subcategories from the category
      const subcategories = category.subcategories || [];

      // Get product counts for each subcategory
      const ProductModel = require("../product/product.model");
      const subcategoriesWithCounts = [];

      for (const subcategoryName of subcategories) {
        const productCount = await ProductModel.countDocuments({
          category: id,
          subcategory: subcategoryName
        });

        subcategoriesWithCounts.push({
          subcategoryName: subcategoryName,
          productCount: productCount
        });
      }

      // Calculate total products in this category
      const totalProductsInCategory = await ProductModel.countDocuments({
        category: id
      });

      const result = {
        category: {
          _id: category._id,
          categoryName: category.categoryName,
          categoryImg: category.categoryImg,
          totalProducts: totalProductsInCategory
        },
        subcategories: subcategoriesWithCounts,
        totalSubcategories: subcategories.length,
        totalProducts: totalProductsInCategory
      };

      return ResponseUtil.success(
        res,
        result,
        "Category subcategories with product counts retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CategoryController();
