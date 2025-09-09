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
        };
      }

      const product = new ProductModel(productData);
      const savedProduct = await product.save();

      // Populate the relationships for the response
      await savedProduct.populate("category");
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
      const {
        page = 1,
        limit = 10,
        search,
        category,
        brand,
        subcategory,
        remark,
        minPrice,
        maxPrice,
        minRating,
        maxRating,
        inStock,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter = {};

      // Text search
      if (search) {
        filter.$text = { $search: search };
      }

      // Category filter
      if (category) {
        filter.category = category;
      }

      // Brand filter
      if (brand) {
        filter.brand = brand;
      }

      // Subcategory filter
      if (subcategory) {
        filter.subcategory = subcategory;
      }

      // Remark filter
      if (remark) {
        filter.remark = remark;
      }

      // Price range filter
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // Rating range filter
      if (minRating || maxRating) {
        filter.star = {};
        if (minRating) filter.star.$gte = parseFloat(minRating);
        if (maxRating) filter.star.$lte = parseFloat(maxRating);
      }

      // Stock filter
      if (inStock !== undefined) {
        if (inStock === 'true') {
          filter.stock = { $gt: 0 };
        } else if (inStock === 'false') {
          filter.stock = { $eq: 0 };
        }
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query with pagination
      const products = await ProductModel.find(filter)
        .populate("category")
        .populate("brand")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      // Get total count for pagination
      const total = await ProductModel.countDocuments(filter);

      const response = {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalProducts: total,
          hasNextPage: skip + parseInt(limit) < total,
          hasPrevPage: parseInt(page) > 1
        }
      };

      return ResponseUtil.success(
        res,
        response,
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

        // Note: Since we only store URL in the model, we can't delete old images
        // Consider implementing a cleanup mechanism or storing publicId separately

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
        };
      }

      const product = await ProductModel.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate("category")
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

      // Note: Since we only store URL in the model, we can't delete old images
      // Consider implementing a cleanup mechanism or storing publicId separately

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

  async searchProducts(req, res, next) {
    try {
      const {
        q,
        page = 1,
        limit = 10,
        category,
        brand,
        subcategory,
        remark,
        minPrice,
        maxPrice,
        minRating,
        maxRating,
        inStock,
        sortBy = 'score',
        sortOrder = 'desc'
      } = req.query;

      if (!q) {
        return ResponseUtil.badRequest(res, "Search query is required");
      }

      // Build filter object
      const filter = {
        $text: { $search: q }
      };

      // Additional filters
      if (category) filter.category = category;
      if (brand) filter.brand = brand;
      if (subcategory) filter.subcategory = subcategory;
      if (remark) filter.remark = remark;

      // Price range filter
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // Rating range filter
      if (minRating || maxRating) {
        filter.star = {};
        if (minRating) filter.star.$gte = parseFloat(minRating);
        if (maxRating) filter.star.$lte = parseFloat(maxRating);
      }

      // Stock filter
      if (inStock !== undefined) {
        if (inStock === 'true') {
          filter.stock = { $gt: 0 };
        } else if (inStock === 'false') {
          filter.stock = { $eq: 0 };
        }
      }

      // Build sort object
      const sort = {};
      if (sortBy === 'score') {
        sort.score = { $meta: 'textScore' };
      } else {
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute search query with pagination
      const products = await ProductModel.find(filter, { score: { $meta: 'textScore' } })
        .populate("category")
        .populate("brand")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      // Get total count for pagination
      const total = await ProductModel.countDocuments(filter);

      const response = {
        products,
        query: q,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalProducts: total,
          hasNextPage: skip + parseInt(limit) < total,
          hasPrevPage: parseInt(page) > 1
        }
      };

      return ResponseUtil.success(
        res,
        response,
        "Search results retrieved successfully"
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
