const axios = require('axios');
const crypto = require('crypto');
const { sslCommerzConfig } = require('../config/payment.config');

class SSLCommerzUtil {
  /**
   * Create SSL Commerz session
   */
  static async createSession(paymentData) {
    try {
      if (!sslCommerzConfig.storeId || !sslCommerzConfig.storePassword) {
        return {
          success: false,
          error: 'SSL Commerz is not configured. Please set SSL_COMMERZ_STORE_ID and SSL_COMMERZ_STORE_PASSWORD environment variables.'
        };
      }

      const {
        amount,
        currency = 'BDT',
        tran_id,
        product_category,
        success_url,
        fail_url,
        cancel_url,
        customer_info,
        shipping_address,
        billing_address
      } = paymentData;

      // Generate transaction ID if not provided
      const transactionId = tran_id || `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const sessionData = {
        store_id: sslCommerzConfig.storeId,
        store_passwd: sslCommerzConfig.storePassword,
        total_amount: amount,
        currency: currency,
        tran_id: transactionId,
        product_category: product_category || 'general',
        success_url: success_url,
        fail_url: fail_url,
        cancel_url: cancel_url,
        ipn_url: `${process.env.BACKEND_URL}/api/payments/ssl-commerz/ipn`,
        
        // Customer Information
        cus_name: customer_info?.name || '',
        cus_email: customer_info?.email || '',
        cus_add1: customer_info?.address || '',
        cus_city: customer_info?.city || '',
        cus_postcode: customer_info?.postcode || '',
        cus_country: customer_info?.country || 'Bangladesh',
        cus_phone: customer_info?.phone || '',
        
        // Shipping Information
        shipping_method: 'NO',
        num_of_item: 1,
        product_name: 'Gadget Brust Order',
        product_profile: 'general',
      };

      const response = await axios.post(
        `${sslCommerzConfig.baseUrl}/gwprocess/v4/api.php`,
        sessionData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (response.data.status === 'VALID') {
        return {
          success: true,
          sessionKey: response.data.sessionkey,
          gatewayPageURL: response.data.GatewayPageURL,
          transactionId: transactionId
        };
      } else {
        return {
          success: false,
          error: response.data.failedreason || 'Failed to create session'
        };
      }
    } catch (error) {
      console.error('SSL Commerz Session Creation Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify SSL Commerz payment
   */
  static async verifyPayment(sessionKey) {
    try {
      if (!sslCommerzConfig.storeId || !sslCommerzConfig.storePassword) {
        return {
          success: false,
          error: 'SSL Commerz is not configured. Please set SSL_COMMERZ_STORE_ID and SSL_COMMERZ_STORE_PASSWORD environment variables.'
        };
      }

      const verifyData = {
        sessionkey: sessionKey,
        store_id: sslCommerzConfig.storeId,
        store_passwd: sslCommerzConfig.storePassword
      };

      const response = await axios.post(
        `${sslCommerzConfig.baseUrl}/validator/api/validationserverAPI.php`,
        verifyData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (response.data.status === 'VALID') {
        return {
          success: true,
          transactionId: response.data.tran_id,
          amount: parseFloat(response.data.amount),
          currency: response.data.currency,
          paymentMethod: response.data.card_issuer,
          cardBrand: response.data.card_brand,
          bankTransactionId: response.data.bank_tran_id,
          cardIssuerCountry: response.data.card_issuer_country,
          cardIssuerCountryCode: response.data.card_issuer_country_code,
          riskTitle: response.data.risk_title,
          riskLevel: response.data.risk_level
        };
      } else {
        return {
          success: false,
          error: response.data.failedreason || 'Payment verification failed'
        };
      }
    } catch (error) {
      console.error('SSL Commerz Payment Verification Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process refund through SSL Commerz
   */
  static async processRefund(refundData) {
    try {
      if (!sslCommerzConfig.storeId || !sslCommerzConfig.storePassword) {
        return {
          success: false,
          error: 'SSL Commerz is not configured. Please set SSL_COMMERZ_STORE_ID and SSL_COMMERZ_STORE_PASSWORD environment variables.'
        };
      }

      const {
        bank_tran_id,
        refe_id,
        amount,
        refund_ref_id
      } = refundData;

      const refundPayload = {
        store_id: sslCommerzConfig.storeId,
        store_passwd: sslCommerzConfig.storePassword,
        bank_tran_id: bank_tran_id,
        refe_id: refe_id,
        amount: amount,
        refund_ref_id: refund_ref_id || `REF_${Date.now()}`
      };

      const response = await axios.post(
        `${sslCommerzConfig.baseUrl}/validator/api/merchantTransIDvalidationAPI.php`,
        refundPayload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (response.data.status === 'VALID') {
        return {
          success: true,
          refundRefId: refund_ref_id,
          amount: amount,
          status: 'completed'
        };
      } else {
        return {
          success: false,
          error: response.data.failedreason || 'Refund failed'
        };
      }
    } catch (error) {
      console.error('SSL Commerz Refund Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate callback data
   */
  static validateCallback(data) {
    try {
      if (!sslCommerzConfig.storePassword) {
        return {
          isValid: false,
          error: 'SSL Commerz is not configured. Please set SSL_COMMERZ_STORE_PASSWORD environment variable.'
        };
      }

      const {
        verify_sign,
        verify_key,
        tran_id,
        amount,
        currency,
        status
      } = data;

      // SSL Commerz sends verify_key as comma-separated list of fields
      const keyArray = verify_key.split(',');
      
      // Create hash string from the fields
      let hashString = '';
      keyArray.forEach(key => {
        hashString += `${key}=${data[key]}&`;
      });
      hashString += sslCommerzConfig.storePassword;

      // Generate hash
      const hash = crypto.createHash('md5').update(hashString).digest('hex');

      return {
        isValid: verify_sign === hash,
        transactionId: tran_id,
        amount: parseFloat(amount),
        currency: currency,
        status: status
      };
    } catch (error) {
      console.error('SSL Commerz Callback Validation Error:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }
}

module.exports = SSLCommerzUtil;
