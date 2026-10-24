const mongoose = require("mongoose");
const ProductModel = require("./product.model");
const CategoryModel = require("../category/category.model");
const BrandModel = require("../brand/brand.model");
const ResponseUtil = require("../../shared/utils/response.util");
const UploadUtil = require("../../shared/utils/upload.util");
const StockMovementModel = require("../inventory/stockMovement.model");

// multipart forms send everything as strings; normalise before saving
const normalizeProductInput = (body) => {
  const data = { ...body };
  if (typeof data.keyFeatures === "string") {
    try {
      data.keyFeatures = JSON.parse(data.keyFeatures);
    } catch {
      delete data.keyFeatures;
    }
  }
  if (typeof data.image === "string") data.image = { url: data.image };
  if (data.imageUrl) {
    data.image = { url: data.imageUrl };
    delete data.imageUrl;
  }
  ["price", "discount", "stock", "star"].forEach((key) => {
    if (data[key] !== undefined && data[key] !== "") data[key] = Number(data[key]);
  });
  if (typeof data.isSlider === "string") data.isSlider = data.isSlider === "true";
  if (data.price !== undefined) {
    const discount = Number(data.discount) || 0;
    data.discountPrice = Math.round(data.price - (data.price * discount) / 100);
  }
  return data;
};

class ProductController {
  async createProduct(req, res, next) {
    try {
      const productData = normalizeProductInput(req.body);

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
      if (savedProduct.stock > 0) {
        await StockMovementModel.create({ product: savedProduct._id, type: "opening", quantity: savedProduct.stock, balanceAfter: savedProduct.stock, note: "Opening stock", user: req.user?.userId });
      }

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
        stockLevel,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter = {};

      const searchTerm = search || req.query.q;
      // Partial, case-insensitive search so "iph" finds "iPhone" ($text only matches whole words)
      if (searchTerm) {
        const pattern = new RegExp(String(searchTerm).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter.$or = [{ title: pattern }, { shortDescription: pattern }, { subcategory: pattern }];
      }

      // Category filter (support both ObjectId and Category Name)
      if (category && category !== "all" && category !== "All Categories") {
        if (mongoose.isValidObjectId(category)) {
          filter.category = category;
        } else {
          const catDoc = await CategoryModel.findOne({ categoryName: new RegExp(`^${category}$`, "i") }).select("_id");
          if (catDoc) filter.category = catDoc._id;
        }
      }

      // Brand filter (support both ObjectId and Brand Name)
      if (brand && brand !== "all" && brand !== "All Brands") {
        if (mongoose.isValidObjectId(brand)) {
          filter.brand = brand;
        } else {
          const brandDoc = await BrandModel.findOne({ brandName: new RegExp(`^${brand}$`, "i") }).select("_id");
          if (brandDoc) filter.brand = brandDoc._id;
        }
      }

      // Subcategory filter
      if (subcategory && subcategory !== "all") {
        filter.subcategory = subcategory;
      }

      // Remark filter
      if (remark && remark !== "all") {
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

      // Stock level filter used by the admin dashboard: in | low | out
      if (stockLevel === 'out') filter.stock = 0;
      else if (stockLevel === 'low') filter.stock = { $gt: 0, $lte: 10 };
      else if (stockLevel === 'in') filter.stock = { $gt: 10 };

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
      const updateData = normalizeProductInput(req.body);

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

      const before = updateData.stock !== undefined ? await ProductModel.findById(req.params.id).select("stock") : null;
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
      // stock edited from the product form: keep the inventory history complete
      if (before && before.stock !== product.stock) {
        await StockMovementModel.create({ product: product._id, type: "adjustment", quantity: product.stock - before.stock, balanceAfter: product.stock, note: "Edited on product form", user: req.user?.userId });
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
