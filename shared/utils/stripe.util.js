const { stripe: stripeInstance, stripeConfig } = require('../config/payment.config');
const ResponseUtil = require('./response.util');

class StripeUtil {
  /**
   * Create a payment intent
   */
  static async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    try {
      if (!stripeInstance) {
        return {
          success: false,
          error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
        };
      }

      const paymentIntent = await stripeInstance.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('Stripe Payment Intent Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Confirm payment intent
   */
  static async confirmPayment(paymentIntentId) {
    try {
      if (!stripeInstance) {
        return {
          success: false,
          error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
        };
      }

      const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status === 'succeeded') {
        return {
          success: true,
          amount: paymentIntent.amount / 100, // Convert from cents
          currency: paymentIntent.currency,
          paymentMethod: paymentIntent.payment_method,
          receiptUrl: paymentIntent.charges.data[0]?.receipt_url,
          metadata: paymentIntent.metadata
        };
      }

      return {
        success: false,
        error: `Payment not completed. Status: ${paymentIntent.status}`
      };
    } catch (error) {
      console.error('Stripe Payment Confirmation Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process refund
   */
  static async processRefund(paymentIntentId, amount) {
    try {
      if (!stripeInstance) {
        return {
          success: false,
          error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
        };
      }

      const refund = await stripeInstance.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100) // Convert to cents
      });

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        reason: refund.reason
      };
    } catch (error) {
      console.error('Stripe Refund Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload, signature) {
    try {
      if (!stripeInstance) {
        return {
          success: false,
          error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
        };
      }

      const event = stripeInstance.webhooks.constructEvent(
        payload,
        signature,
        stripeConfig.webhookSecret
      );
      return {
        success: true,
        event
      };
    } catch (error) {
      console.error('Stripe Webhook Verification Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payment method details
   */
  static async getPaymentMethod(paymentMethodId) {
    try {
      if (!stripeInstance) {
        return {
          success: false,
          error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.'
        };
      }

      const paymentMethod = await stripeInstance.paymentMethods.retrieve(paymentMethodId);
      return {
        success: true,
        paymentMethod
      };
    } catch (error) {
      console.error('Stripe Get Payment Method Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = StripeUtil;
