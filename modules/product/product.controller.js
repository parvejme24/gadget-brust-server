const ProductModel = require("./product.model");
const ResponseUtil = require("../../shared/utils/response.util");
const UploadUtil = require("../../shared/utils/upload.util");

class ProductController {
  async createProduct(req, res, next) {
    try {
      const productData = { ...req.body };

      // Handle image upload if file is present
      if (req.file) {
        const uploadResult = await UploadUtil.uploadImage(
          req.file.buffer,
          "gadget-brust/products",
          `product_${Date.now()}`
        );

        if (!uploadResult.success) {
          return ResponseUtil.badRequest(res, uploadResult.error);
        }

        productData.image = {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          assetId: uploadResult.assetId,
        };
      }

      const product = new ProductModel(productData);
      const savedProduct = await product.save();

      // Populate the relationships for the response
      await savedProduct.populate("category");
      await savedProduct.populate("subcategory");
      await savedProduct.populate("brand");

      return ResponseUtil.created(
        res,
        savedProduct,
        "Product created successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getAllProducts(req, res, next) {
    try {
      const products = await ProductModel.find()
        .populate("category")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Products retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getProductById(req, res, next) {
    try {
      const product = await ProductModel.findById(req.params.id)
        .populate("category")
        .populate("brand");

      if (!product) {
        return ResponseUtil.notFound(res, "Product not found");
      }
      return ResponseUtil.success(
        res,
        product,
        "Product retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async updateProduct(req, res, next) {
    try {
      const updateData = { ...req.body };

      // Handle image upload if file is present
      if (req.file) {
        // Get current product to check if it has an image
        const currentProduct = await ProductModel.findById(req.params.id);
        if (!currentProduct) {
          return ResponseUtil.notFound(res, "Product not found");
        }

        // Delete old image if exists
        if (currentProduct.image && currentProduct.image.publicId) {
          await UploadUtil.deleteImage(currentProduct.image.publicId);
        }

        // Upload new image
        const uploadResult = await UploadUtil.uploadImage(
          req.file.buffer,
          "gadget-brust/products",
          `product_${Date.now()}`
        );

        if (!uploadResult.success) {
          return ResponseUtil.badRequest(res, uploadResult.error);
        }

        updateData.image = {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          assetId: uploadResult.assetId,
        };
      }

      const product = await ProductModel.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate("category")
        .populate("subcategory")
        .populate("brand");

      if (!product) {
        return ResponseUtil.notFound(res, "Product not found");
      }
      return ResponseUtil.success(res, product, "Product updated successfully");
    } catch (error) {
      next(error);
    }
  }

  async deleteProduct(req, res, next) {
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) {
        return ResponseUtil.notFound(res, "Product not found");
      }

      // Delete image from Cloudinary if exists
      if (product.image && product.image.publicId) {
        await UploadUtil.deleteImage(product.image.publicId);
      }

      // Delete product
      await ProductModel.findByIdAndDelete(req.params.id);
      return ResponseUtil.success(res, null, "Product deleted successfully");
    } catch (error) {
      next(error);
    }
  }

  async getProductsByCategory(req, res, next) {
    try {
      const { categoryId } = req.params;

      const products = await ProductModel.find({ category: categoryId })
        .populate("category")
        .populate("subcategory")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Products by category retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getProductsByBrand(req, res, next) {
    try {
      const { brandId } = req.params;

      const products = await ProductModel.find({ brand: brandId })
        .populate("category")
        .populate("subcategory")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Products by brand retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getProductsBySubcategory(req, res, next) {
    try {
      const { subcategoryName } = req.params;

      const products = await ProductModel.find({ subcategory: subcategoryName })
        .populate("category")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Products by subcategory retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getProductsByRemark(req, res, next) {
    try {
      const { remark } = req.params;

      const products = await ProductModel.find({ remark })
        .populate("category")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Products by remark retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getProductsByCategoryAndSubcategory(req, res, next) {
    try {
      const { categoryId, subcategoryName } = req.params;

      const products = await ProductModel.find({
        category: categoryId,
        subcategory: subcategoryName,
      })
        .populate("category")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Products by category and subcategory retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getSliderProducts(req, res, next) {
    try {
      const products = await ProductModel.find({ isSlider: true })
        .populate("category")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Slider products retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getDiscountedProducts(req, res, next) {
    try {
      const products = await ProductModel.find({ discount: { $gt: 0 } })
        .populate("category")
        .populate("brand");

      return ResponseUtil.success(
        res,
        products,
        "Discounted products retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getCheapestProducts(req, res, next) {
    try {
      const products = await ProductModel.find()
        .populate("category")
        .populate("brand")
        .sort({ price: 1 });

      return ResponseUtil.success(
        res,
        products,
        "Cheapest products retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }

  async getNewestProducts(req, res, next) {
    try {
      const products = await ProductModel.find()
        .populate("category")
        .populate("brand")
        .sort({ createdAt: -1 });

      return ResponseUtil.success(
        res,
        products,
        "Newest products retrieved successfully"
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
