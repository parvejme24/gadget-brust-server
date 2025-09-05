const ShippingModel = require('./shipping.model');
const ResponseUtil = require('../../shared/utils/response.util');

class ShippingController {
  // Create new shipping configuration
  async createShipping(req, res, next) {
    try {
      const shippingConfig = new ShippingModel(req.body);
      const savedConfig = await shippingConfig.save();
      
      return ResponseUtil.created(res, savedConfig, 'Shipping configuration created successfully');
    } catch (error) {
      next(error);
    }
  }

  // Get all shipping configurations
  async getAllShipping(req, res, next) {
    try {
      const { isActive } = req.query;
      
      let filters = {};
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      
      const shippingConfigs = await ShippingModel.find(filters).sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, shippingConfigs, 'Shipping configurations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // Get shipping configuration by ID
  async getShippingById(req, res, next) {
    try {
      const { id } = req.params;
      
      const shippingConfig = await ShippingModel.findById(id);
      
      if (!shippingConfig) {
        return ResponseUtil.notFound(res, 'Shipping configuration not found');
      }
      
      return ResponseUtil.success(res, shippingConfig, 'Shipping configuration retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // Update shipping configuration
  async updateShipping(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const shippingConfig = await ShippingModel.findByIdAndUpdate(
        id, 
        updateData, 
        { new: true, runValidators: true }
      );
      
      if (!shippingConfig) {
        return ResponseUtil.notFound(res, 'Shipping configuration not found');
      }
      
      return ResponseUtil.success(res, shippingConfig, 'Shipping configuration updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Delete shipping configuration
  async deleteShipping(req, res, next) {
    try {
      const { id } = req.params;
      
      const shippingConfig = await ShippingModel.findByIdAndDelete(id);
      
      if (!shippingConfig) {
        return ResponseUtil.notFound(res, 'Shipping configuration not found');
      }
      
      return ResponseUtil.success(res, null, 'Shipping configuration deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  // Toggle shipping configuration status
  async toggleShippingStatus(req, res, next) {
    try {
      const { id } = req.params;
      
      const shippingConfig = await ShippingModel.findById(id);
      
      if (!shippingConfig) {
        return ResponseUtil.notFound(res, 'Shipping configuration not found');
      }
      
      shippingConfig.isActive = !shippingConfig.isActive;
      await shippingConfig.save();
      
      return ResponseUtil.success(res, shippingConfig, `Shipping configuration ${shippingConfig.isActive ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      next(error);
    }
  }

  // Calculate shipping charge for a specific order
  async calculateShippingCharge(req, res, next) {
    try {
      const { orderAmount, totalWeight = 0, shippingId } = req.body;
      
      if (!orderAmount || orderAmount < 0) {
        return ResponseUtil.badRequest(res, 'Valid order amount is required');
      }
      
      let shippingConfig;
      
      if (shippingId) {
        shippingConfig = await ShippingModel.findById(shippingId);
        if (!shippingConfig) {
          return ResponseUtil.notFound(res, 'Shipping configuration not found');
        }
      } else {
        // Get the first active shipping configuration
        shippingConfig = await ShippingModel.findOne({ isActive: true });
        if (!shippingConfig) {
          return ResponseUtil.notFound(res, 'No active shipping configuration found');
        }
      }
      
      const shippingCharge = shippingConfig.calculateShippingCharge(orderAmount, totalWeight);
      
      const result = {
        shippingConfig: {
          id: shippingConfig._id,
          name: shippingConfig.name,
          description: shippingConfig.description,
          estimatedDays: shippingConfig.estimatedDays,
        },
        orderAmount,
        totalWeight,
        shippingCharge,
        finalAmount: orderAmount + shippingCharge,
        freeShippingThreshold: shippingConfig.freeShippingThreshold,
        qualifiesForFreeShipping: orderAmount >= shippingConfig.freeShippingThreshold,
      };
      
      return ResponseUtil.success(res, result, 'Shipping charge calculated successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ShippingController();

