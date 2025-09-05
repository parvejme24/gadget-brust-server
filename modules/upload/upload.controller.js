const UploadUtil = require('../../shared/utils/upload.util');
const ResponseUtil = require('../../shared/utils/response.util');

class UploadController {
  /**
   * Upload single image
   */
  async uploadSingleImage(req, res, next) {
    try {
      if (!req.file) {
        return ResponseUtil.badRequest(res, 'No image file provided');
      }

      const { folder = 'gadget-brust' } = req.body;
      const fileBuffer = req.file.buffer;

      const uploadResult = await UploadUtil.uploadImage(fileBuffer, folder);

      if (!uploadResult.success) {
        return ResponseUtil.badRequest(res, uploadResult.error);
      }

      return ResponseUtil.success(res, uploadResult, 'Image uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload multiple images
   */
  async uploadMultipleImages(req, res, next) {
    try {
      if (!req.files || req.files.length === 0) {
        return ResponseUtil.badRequest(res, 'No image files provided');
      }

      const { folder = 'gadget-brust' } = req.body;
      const uploadResults = [];

      for (const file of req.files) {
        const uploadResult = await UploadUtil.uploadImage(file.buffer, folder);
        if (uploadResult.success) {
          uploadResults.push(uploadResult);
        }
      }

      if (uploadResults.length === 0) {
        return ResponseUtil.badRequest(res, 'Failed to upload any images');
      }

      return ResponseUtil.success(res, {
        uploaded: uploadResults,
        total: req.files.length,
        successful: uploadResults.length
      }, 'Images uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete image
   */
  async deleteImage(req, res, next) {
    try {
      const { publicId } = req.params;

      if (!publicId) {
        return ResponseUtil.badRequest(res, 'Public ID is required');
      }

      const deleteResult = await UploadUtil.deleteImage(publicId);

      if (!deleteResult.success) {
        return ResponseUtil.badRequest(res, deleteResult.error);
      }

      return ResponseUtil.success(res, deleteResult, 'Image deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update image
   */
  async updateImage(req, res, next) {
    try {
      if (!req.file) {
        return ResponseUtil.badRequest(res, 'No image file provided');
      }

      const { oldPublicId, folder = 'gadget-brust' } = req.body;
      const fileBuffer = req.file.buffer;

      const updateResult = await UploadUtil.updateImage(oldPublicId, fileBuffer, folder);

      if (!updateResult.success) {
        return ResponseUtil.badRequest(res, updateResult.error);
      }

      return ResponseUtil.success(res, updateResult, 'Image updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get optimized image URL
   */
  async getOptimizedImage(req, res, next) {
    try {
      const { publicId } = req.params;
      const { width, height, quality, format } = req.query;

      if (!publicId) {
        return ResponseUtil.badRequest(res, 'Public ID is required');
      }

      const options = {};
      if (width) options.width = parseInt(width);
      if (height) options.height = parseInt(height);
      if (quality) options.quality = quality;
      if (format) options.fetch_format = format;

      const optimizedUrl = UploadUtil.getOptimizedUrl(publicId, options);

      return ResponseUtil.success(res, { url: optimizedUrl }, 'Optimized image URL generated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get thumbnail URL
   */
  async getThumbnailImage(req, res, next) {
    try {
      const { publicId } = req.params;
      const { width = 300, height = 300 } = req.query;

      if (!publicId) {
        return ResponseUtil.badRequest(res, 'Public ID is required');
      }

      const thumbnailUrl = UploadUtil.getThumbnailUrl(publicId, parseInt(width), parseInt(height));

      return ResponseUtil.success(res, { url: thumbnailUrl }, 'Thumbnail URL generated');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UploadController();


