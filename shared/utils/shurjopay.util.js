require("dotenv").config();
const shurjopay = require("shurjopay")();

class ShurjoPayUtil {
  constructor() {
    this.initializeShurjoPay();
  }

  initializeShurjoPay() {
    const {
      SP_ENDPOINT,
      SP_USERNAME,
      SP_PASSWORD,
      SP_PREFIX,
      SP_RETURN_URL
    } = process.env;

    if (!SP_ENDPOINT || !SP_USERNAME || !SP_PASSWORD || !SP_PREFIX || !SP_RETURN_URL) {
      console.warn('ShurjoPay configuration incomplete. Some environment variables are missing.');
      return;
    }

    try {
      shurjopay.config(
        SP_ENDPOINT,
        SP_USERNAME,
        SP_PASSWORD,
        SP_PREFIX,
        SP_RETURN_URL
      );
    } catch (error) {
      console.error('Failed to initialize ShurjoPay:', error);
    }
  }

  /**
   * Create ShurjoPay payment session
   */
  static async createPaymentSession(paymentData) {
    try {
      const {
        amount,
        order_id,
        customer_name,
        customer_address,
        customer_phone,
        customer_city,
        customer_post_code,
        client_ip
      } = paymentData;

      // Validate required fields
      if (!amount || !order_id || !customer_name || !customer_phone) {
        return {
          success: false,
          error: 'Missing required payment data'
        };
      }

      const paymentPayload = {
        amount: parseFloat(amount),
        order_id: order_id.toString(),
        customer_name,
        customer_address: customer_address || 'N/A',
        client_ip: client_ip || '127.0.0.1',
        customer_phone,
        customer_city: customer_city || 'Dhaka',
        customer_post_code: customer_post_code || '1000'
      };

      return new Promise((resolve, reject) => {
        shurjopay.makePayment(
          paymentPayload,
          (response_data) => {
            if (response_data && response_data.checkout_url) {
              resolve({
                success: true,
                checkout_url: response_data.checkout_url,
                order_id: response_data.order_id,
                sp_order_id: response_data.sp_order_id,
                sp_payment_id: response_data.sp_payment_id,
                sp_code: response_data.sp_code,
                sp_message: response_data.sp_message,
                sp_amount: response_data.sp_amount,
                sp_currency: response_data.sp_currency,
                sp_payment_method: response_data.sp_payment_method,
                sp_payment_date: response_data.sp_payment_date,
                sp_signature_verify: response_data.sp_signature_verify
              });
            } else {
              resolve({
                success: false,
                error: 'Invalid response from ShurjoPay',
                response: response_data
              });
            }
          },
          (error) => {
            resolve({
              success: false,
              error: error.message || 'ShurjoPay payment creation failed',
              details: error
            });
          }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: 'Failed to create ShurjoPay payment session',
        details: error.message
      };
    }
  }

  /**
   * Verify ShurjoPay payment
   */
  static async verifyPayment(verificationData) {
    try {
      const {
        sp_order_id,
        sp_payment_id,
        sp_signature_verify
      } = verificationData;

      if (!sp_order_id || !sp_payment_id) {
        return {
          success: false,
          error: 'Missing required verification data'
        };
      }

      // For now, we'll return a basic verification
      // In a real implementation, you would call ShurjoPay's verification API
      return {
        success: true,
        verified: true,
        sp_order_id,
        sp_payment_id,
        sp_signature_verify
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to verify ShurjoPay payment',
        details: error.message
      };
    }
  }

  /**
   * Process refund for ShurjoPay payment
   */
  static async processRefund(refundData) {
    try {
      const {
        sp_payment_id,
        refund_amount,
        refund_reason
      } = refundData;

      if (!sp_payment_id || !refund_amount) {
        return {
          success: false,
          error: 'Missing required refund data'
        };
      }

      // For now, we'll return a basic refund response
      // In a real implementation, you would call ShurjoPay's refund API
      return {
        success: true,
        refund_id: `REF_${Date.now()}`,
        sp_payment_id,
        refund_amount,
        refund_reason,
        refund_date: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to process ShurjoPay refund',
        details: error.message
      };
    }
  }

  /**
   * Validate ShurjoPay callback data
   */
  static validateCallback(callbackData) {
    try {
      const {
        sp_order_id,
        sp_payment_id,
        sp_signature_verify,
        sp_code,
        sp_message,
        sp_amount,
        sp_currency,
        sp_payment_method,
        sp_payment_date
      } = callbackData;

      // Basic validation
      if (!sp_order_id || !sp_payment_id) {
        return {
          isValid: false,
          error: 'Missing required callback data'
        };
      }

      // Check if payment was successful
      const isSuccessful = sp_code === '0000' && sp_signature_verify === 'true';

      return {
        isValid: true,
        isSuccessful,
        transactionId: sp_payment_id,
        orderId: sp_order_id,
        amount: sp_amount,
        currency: sp_currency,
        paymentMethod: sp_payment_method,
        paymentDate: sp_payment_date,
        message: sp_message,
        code: sp_code
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Failed to validate callback data',
        details: error.message
      };
    }
  }
}

module.exports = ShurjoPayUtil;

