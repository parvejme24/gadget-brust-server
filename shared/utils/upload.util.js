const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

class UploadUtil {
  /**
   * Upload image to Cloudinary
   * @param {Buffer|string} file - Image file buffer or base64 string
   * @param {string} folder - Folder name in Cloudinary
   * @param {string} publicId - Public ID for the image
   * @returns {Promise<Object>} Upload result
   */
  static async uploadImage(file, folder = 'gadget-brust', publicId = null) {
    try {
      let uploadOptions = {
        folder: folder,
        resource_type: 'image',
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      let result;
      
      if (Buffer.isBuffer(file)) {
        // Convert buffer to stream
        const stream = Readable.from(file);
        result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.pipe(uploadStream);
        });
      } else if (typeof file === 'string') {
        // Handle base64 string
        result = await cloudinary.uploader.upload(file, uploadOptions);
      } else {
        throw new Error('Invalid file format. Expected Buffer or base64 string.');
      }

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        assetId: result.asset_id,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height
      };
    } catch (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete image from Cloudinary
   * @param {string} publicId - Public ID of the image
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update image in Cloudinary (delete old and upload new)
   * @param {string} oldPublicId - Old image public ID
   * @param {Buffer|string} newFile - New image file
   * @param {string} folder - Folder name
   * @param {string} newPublicId - New public ID
   * @returns {Promise<Object>} Update result
   */
  static async updateImage(oldPublicId, newFile, folder = 'gadget-brust', newPublicId = null) {
    try {
      // Delete old image
      if (oldPublicId) {
        await this.deleteImage(oldPublicId);
      }

      // Upload new image
      const uploadResult = await this.uploadImage(newFile, folder, newPublicId);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      return uploadResult;
    } catch (error) {
      console.error('Update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate optimized image URL with transformations
   * @param {string} publicId - Image public ID
   * @param {Object} options - Transformation options
   * @returns {string} Optimized image URL
   */
  static getOptimizedUrl(publicId, options = {}) {
    const defaultOptions = {
      quality: 'auto:good',
      fetch_format: 'auto',
      ...options
    };

    return cloudinary.url(publicId, defaultOptions);
  }

  /**
   * Generate thumbnail URL
   * @param {string} publicId - Image public ID
   * @param {number} width - Thumbnail width
   * @param {number} height - Thumbnail height
   * @returns {string} Thumbnail URL
   */
  static getThumbnailUrl(publicId, width = 300, height = 300) {
    return cloudinary.url(publicId, {
      transformation: [
        { width, height, crop: 'fill' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });
  }
}

module.exports = UploadUtil;
