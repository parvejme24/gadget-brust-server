const UserModel = require("../user/user.model");
const ProductModel = require("../product/product.model");
const CartModel = require("../cart/cart.model");
const InvoiceModel = require("../invoice/invoice.model");
const PaymentModel = require("../payment/payment.model");
const ResponseUtil = require("../../shared/utils/response.util");

class DashboardController {
  // Get overall dashboard statistics
  async getDashboardStats(req, res, next) {
    try {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfYear = new Date(today.getFullYear(), 0, 1);

      // Parallel queries for better performance
      const [
        totalCustomers,
        totalProducts,
        totalOrders,
        todayOrders,
        totalRevenue,
        todayRevenue,
        monthlyRevenue,
        yearlyRevenue,
        lowStockProducts,
        pendingOrders,
        completedOrders,
        cancelledOrders,
        totalCategories,
        totalBrands
      ] = await Promise.all([
        // Customer stats
        UserModel.countDocuments({ role: 'user' }),
        
        // Product stats
        ProductModel.countDocuments(),
        
        // Order stats
        InvoiceModel.countDocuments(),
        InvoiceModel.countDocuments({ 
          createdAt: { $gte: startOfToday } 
        }),
        
        // Revenue stats
        InvoiceModel.aggregate([
          { $match: { paymentStatus: 'completed' } },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        InvoiceModel.aggregate([
          { 
            $match: { 
              paymentStatus: 'completed',
              createdAt: { $gte: startOfToday }
            } 
          },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        InvoiceModel.aggregate([
          { 
            $match: { 
              paymentStatus: 'completed',
              createdAt: { $gte: startOfMonth }
            } 
          },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        InvoiceModel.aggregate([
          { 
            $match: { 
              paymentStatus: 'completed',
              createdAt: { $gte: startOfYear }
            } 
          },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        
        // Stock alerts
        ProductModel.countDocuments({ stock: { $lte: 10 } }),
        
        // Order status counts
        InvoiceModel.countDocuments({ status: 'pending' }),
        InvoiceModel.countDocuments({ status: 'paid' }),
        InvoiceModel.countDocuments({ status: 'cancelled' }),
        
        // Additional stats
        ProductModel.distinct('category').then(categories => categories.length),
        ProductModel.distinct('brand').then(brands => brands.length)
      ]);

      const stats = {
        customers: {
          total: totalCustomers,
          newToday: await UserModel.countDocuments({ 
            createdAt: { $gte: startOfToday },
            role: 'user'
          }),
          newThisMonth: await UserModel.countDocuments({ 
            createdAt: { $gte: startOfMonth },
            role: 'user'
          })
        },
        products: {
          total: totalProducts,
          lowStock: lowStockProducts,
          outOfStock: await ProductModel.countDocuments({ stock: 0 }),
          categories: totalCategories,
          brands: totalBrands
        },
        orders: {
          total: totalOrders,
          today: todayOrders,
          pending: pendingOrders,
          completed: completedOrders,
          cancelled: cancelledOrders,
          thisMonth: await InvoiceModel.countDocuments({ 
            createdAt: { $gte: startOfMonth } 
          })
        },
        revenue: {
          total: totalRevenue[0]?.total || 0,
          today: todayRevenue[0]?.total || 0,
          thisMonth: monthlyRevenue[0]?.total || 0,
          thisYear: yearlyRevenue[0]?.total || 0
        }
      };

      return ResponseUtil.success(res, stats, "Dashboard statistics retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  // Get revenue analytics for charts
  async getRevenueAnalytics(req, res, next) {
    try {
      const { period = 'monthly', year = new Date().getFullYear() } = req.query;

      let groupFormat, dateFilter;

      switch (period) {
        case 'daily':
          groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'weekly':
          groupFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'monthly':
        default:
          groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
      }

      const revenueData = await InvoiceModel.aggregate([
        {
          $match: {
            ...dateFilter,
            paymentStatus: 'completed'
          }
        },
        {
          $group: {
            _id: groupFormat,
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
            averageOrderValue: { $avg: '$total' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Get payment method breakdown
      const paymentMethodData = await InvoiceModel.aggregate([
        {
          $match: {
            ...dateFilter,
            paymentStatus: 'completed'
          }
        },
        {
          $group: {
            _id: '$paymentMethod',
            revenue: { $sum: '$total' },
            orders: { $sum: 1 }
          }
        }
      ]);

      // Get order status breakdown
      const orderStatusData = await InvoiceModel.aggregate([
        {
          $match: dateFilter
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$total' }
          }
        }
      ]);

      const analytics = {
        revenueChart: revenueData,
        paymentMethodBreakdown: paymentMethodData,
        orderStatusBreakdown: orderStatusData,
        period,
        year: parseInt(year)
      };

      return ResponseUtil.success(res, analytics, "Revenue analytics retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  // Get product analytics
  async getProductAnalytics(req, res, next) {
    try {
      const { period = 'monthly', year = new Date().getFullYear() } = req.query;

      let groupFormat, dateFilter;

      switch (period) {
        case 'daily':
          groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'weekly':
          groupFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'monthly':
        default:
          groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
      }

      // Product creation trends
      const productTrends = await ProductModel.aggregate([
        {
          $match: dateFilter
        },
        {
          $group: {
            _id: groupFormat,
            productsAdded: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Top categories by product count
      const categoryStats = await ProductModel.aggregate([
        {
          $group: {
            _id: '$category',
            productCount: { $sum: 1 },
            averagePrice: { $avg: '$price' },
            totalStock: { $sum: '$stock' }
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'categoryInfo'
          }
        },
        {
          $unwind: '$categoryInfo'
        },
        {
          $project: {
            categoryName: '$categoryInfo.name',
            productCount: 1,
            averagePrice: 1,
            totalStock: 1
          }
        },
        {
          $sort: { productCount: -1 }
        },
        {
          $limit: 10
        }
      ]);

      // Top brands by product count
      const brandStats = await ProductModel.aggregate([
        {
          $group: {
            _id: '$brand',
            productCount: { $sum: 1 },
            averagePrice: { $avg: '$price' },
            totalStock: { $sum: '$stock' }
          }
        },
        {
          $lookup: {
            from: 'brands',
            localField: '_id',
            foreignField: '_id',
            as: 'brandInfo'
          }
        },
        {
          $unwind: '$brandInfo'
        },
        {
          $project: {
            brandName: '$brandInfo.name',
            productCount: 1,
            averagePrice: 1,
            totalStock: 1
          }
        },
        {
          $sort: { productCount: -1 }
        },
        {
          $limit: 10
        }
      ]);

      // Stock analysis
      const stockAnalysis = await ProductModel.aggregate([
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalStock: { $sum: '$stock' },
            averageStock: { $avg: '$stock' },
            lowStockProducts: {
              $sum: {
                $cond: [{ $lte: ['$stock', 10] }, 1, 0]
              }
            },
            outOfStockProducts: {
              $sum: {
                $cond: [{ $eq: ['$stock', 0] }, 1, 0]
              }
            }
          }
        }
      ]);

      const analytics = {
        productTrends,
        categoryStats,
        brandStats,
        stockAnalysis: stockAnalysis[0] || {},
        period,
        year: parseInt(year)
      };

      return ResponseUtil.success(res, analytics, "Product analytics retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  // Get customer analytics
  async getCustomerAnalytics(req, res, next) {
    try {
      const { period = 'monthly', year = new Date().getFullYear() } = req.query;

      let groupFormat, dateFilter;

      switch (period) {
        case 'daily':
          groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'weekly':
          groupFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'monthly':
        default:
          groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
      }

      // Customer registration trends
      const customerTrends = await UserModel.aggregate([
        {
          $match: {
            ...dateFilter,
            role: 'user'
          }
        },
        {
          $group: {
            _id: groupFormat,
            newCustomers: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Customer order analysis
      const customerOrderAnalysis = await InvoiceModel.aggregate([
        {
          $match: {
            ...dateFilter,
            paymentStatus: 'completed'
          }
        },
        {
          $group: {
            _id: '$user_id',
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: '$userInfo'
        },
        {
          $project: {
            customerName: '$userInfo.fullName',
            customerEmail: '$userInfo.email',
            totalOrders: 1,
            totalSpent: 1,
            averageOrderValue: 1
          }
        },
        {
          $sort: { totalSpent: -1 }
        },
        {
          $limit: 20
        }
      ]);

      // Customer lifetime value analysis
      const customerLTV = await InvoiceModel.aggregate([
        {
          $match: {
            paymentStatus: 'completed'
          }
        },
        {
          $group: {
            _id: '$user_id',
            totalSpent: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            firstOrderDate: { $min: '$createdAt' },
            lastOrderDate: { $max: '$createdAt' }
          }
        },
        {
          $addFields: {
            averageOrderValue: { $divide: ['$totalSpent', '$totalOrders'] },
            customerLifespanDays: {
              $divide: [
                { $subtract: ['$lastOrderDate', '$firstOrderDate'] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            averageLTV: { $avg: '$totalSpent' },
            averageOrdersPerCustomer: { $avg: '$totalOrders' },
            averageOrderValue: { $avg: '$averageOrderValue' },
            averageCustomerLifespan: { $avg: '$customerLifespanDays' }
          }
        }
      ]);

      const analytics = {
        customerTrends,
        topCustomers: customerOrderAnalysis,
        customerLTV: customerLTV[0] || {},
        period,
        year: parseInt(year)
      };

      return ResponseUtil.success(res, analytics, "Customer analytics retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  // Get sales analytics
  async getSalesAnalytics(req, res, next) {
    try {
      const { period = 'monthly', year = new Date().getFullYear() } = req.query;

      let groupFormat, dateFilter;

      switch (period) {
        case 'daily':
          groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'weekly':
          groupFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
        case 'monthly':
        default:
          groupFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          dateFilter = {
            createdAt: {
              $gte: new Date(year, 0, 1),
              $lt: new Date(year + 1, 0, 1)
            }
          };
          break;
      }

      // Sales trends
      const salesTrends = await InvoiceModel.aggregate([
        {
          $match: {
            ...dateFilter,
            paymentStatus: 'completed'
          }
        },
        {
          $group: {
            _id: groupFormat,
            totalSales: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            averageOrderValue: { $avg: '$total' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Sales by category (if we can get product details from orders)
      const salesByCategory = await InvoiceModel.aggregate([
        {
          $match: {
            ...dateFilter,
            paymentStatus: 'completed'
          }
        },
        {
          $lookup: {
            from: 'carts',
            localField: '_id',
            foreignField: 'invoice_id',
            as: 'cartItems'
          }
        },
        {
          $unwind: '$cartItems'
        },
        {
          $lookup: {
            from: 'products',
            localField: 'cartItems.product_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        {
          $unwind: '$product'
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'product.category',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $unwind: '$category'
        },
        {
          $group: {
            _id: '$category.name',
            totalSales: { $sum: '$cartItems.price' },
            totalQuantity: { $sum: '$cartItems.qty' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $sort: { totalSales: -1 }
        },
        {
          $limit: 10
        }
      ]);

      // Peak sales hours (if we have time data)
      const peakSalesHours = await InvoiceModel.aggregate([
        {
          $match: {
            ...dateFilter,
            paymentStatus: 'completed'
          }
        },
        {
          $addFields: {
            hour: { $hour: '$createdAt' }
          }
        },
        {
          $group: {
            _id: '$hour',
            totalSales: { $sum: '$total' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $sort: { totalSales: -1 }
        }
      ]);

      const analytics = {
        salesTrends,
        salesByCategory,
        peakSalesHours,
        period,
        year: parseInt(year)
      };

      return ResponseUtil.success(res, analytics, "Sales analytics retrieved successfully");
    } catch (error) {
      next(error);
    }
  }

  // Get recent activities
  async getRecentActivities(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;

      const [
        recentOrders,
        recentCustomers,
        recentProducts,
        recentPayments
      ] = await Promise.all([
        InvoiceModel.find()
          .populate('user_id', 'fullName email')
          .sort({ createdAt: -1 })
          .limit(limit),
        
        UserModel.find({ role: 'user' })
          .sort({ createdAt: -1 })
          .limit(limit),
        
        ProductModel.find()
          .populate('category', 'name')
          .populate('brand', 'name')
          .sort({ createdAt: -1 })
          .limit(limit),
        
        PaymentModel.find()
          .populate('user_id', 'fullName email')
          .populate('invoice_id', 'invoiceNumber total')
          .sort({ createdAt: -1 })
          .limit(limit)
      ]);

      const activities = {
        recentOrders,
        recentCustomers,
        recentProducts,
        recentPayments
      };

      return ResponseUtil.success(res, activities, "Recent activities retrieved successfully");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
