const PaymentModel = require('./payment.model');
const InvoiceModel = require('../invoice/invoice.model');
const StripeUtil = require('../../shared/utils/stripe.util');
const SSLCommerzUtil = require('../../shared/utils/ssl-commerz.util');
const ShurjoPayUtil = require('../../shared/utils/shurjopay.util');
const { paymentMethods } = require('../../shared/config/payment.config');
const ResponseUtil = require('../../shared/utils/response.util');

class PaymentController {
  /**
   * Get available payment methods
   */
  static async getPaymentMethods(req, res) {
    try {
      const methods = Object.keys(paymentMethods).map(key => ({
        id: key,
        ...paymentMethods[key]
      }));

      return ResponseUtil.success(res, methods, 'Payment methods retrieved successfully');
    } catch (error) {
      console.error('Get Payment Methods Error:', error);
      return ResponseUtil.error(res, 'Failed to get payment methods', 500);
    }
  }

  /**
   * Create Stripe Payment Intent
   */
  static async createStripePayment(req, res) {
    try {
      const { invoice_id, amount, currency = 'usd' } = req.body;
      const user_id = req.user?.id || req.body.user_id;

      if (!invoice_id || !amount) {
        return ResponseUtil.badRequest(res, 'Invoice ID and amount are required');
      }

      // Check if invoice exists
      const invoice = await InvoiceModel.findById(invoice_id);
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }

      // Check if payment already exists
      const existingPayment = await PaymentModel.findOne({
        invoice_id,
        payment_method: 'stripe'
      });

      if (existingPayment) {
        return ResponseUtil.badRequest(res, 'Payment already exists for this invoice');
      }

      // Create Stripe payment intent
      const stripeResult = await StripeUtil.createPaymentIntent(
        amount,
        currency,
        {
          invoice_id,
          user_id,
          payment_method: 'stripe'
        }
      );

      if (!stripeResult.success) {
        return ResponseUtil.error(res, stripeResult.error, 400);
      }

      // Save payment record
      const payment = new PaymentModel({
        user_id,
        invoice_id,
        payment_method: 'stripe',
        amount,
        currency,
        status: 'pending',
        payment_intent_id: stripeResult.paymentIntentId,
        metadata: {
          stripe_client_secret: stripeResult.clientSecret
        }
      });

      await payment.save();

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        client_secret: stripeResult.clientSecret,
        amount: stripeResult.amount / 100,
        currency: stripeResult.currency
      }, 'Stripe payment intent created successfully');
    } catch (error) {
      console.error('Create Stripe Payment Error:', error);
      return ResponseUtil.error(res, 'Failed to create Stripe payment', 500);
    }
  }

  /**
   * Confirm Stripe Payment
   */
  static async confirmStripePayment(req, res) {
    try {
      const { payment_intent_id } = req.body;

      if (!payment_intent_id) {
        return ResponseUtil.badRequest(res, 'Payment intent ID is required');
      }

      // Find payment record
      const payment = await PaymentModel.findOne({
        payment_intent_id,
        payment_method: 'stripe'
      });

      if (!payment) {
        return ResponseUtil.notFound(res, 'Payment not found');
      }

      // Confirm payment with Stripe
      const confirmResult = await StripeUtil.confirmPayment(payment_intent_id);

      if (!confirmResult.success) {
        payment.status = 'failed';
        payment.failure_reason = confirmResult.error;
        await payment.save();

        return ResponseUtil.error(res, confirmResult.error, 400);
      }

      // Update payment record
      payment.status = 'completed';
      payment.transaction_id = payment_intent_id;
      payment.payment_date = new Date();
      payment.gateway_response = confirmResult;
      await payment.save();

      // Update invoice status
      await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
        paymentStatus: 'paid',
        status: 'confirmed'
      });

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        status: payment.status,
        amount: confirmResult.amount,
        currency: confirmResult.currency,
        receipt_url: confirmResult.receiptUrl
      }, 'Stripe payment confirmed successfully');
    } catch (error) {
      console.error('Confirm Stripe Payment Error:', error);
      return ResponseUtil.error(res, 'Failed to confirm Stripe payment', 500);
    }
  }

  /**
   * Create SSL Commerz Session
   */
  static async createSSLCommerzSession(req, res) {
    try {
      const {
        invoice_id,
        amount,
        customer_info,
        success_url,
        fail_url,
        cancel_url
      } = req.body;

      const user_id = req.user?.id || req.body.user_id;

      if (!invoice_id || !amount || !customer_info) {
        return ResponseUtil.badRequest(res, 'Invoice ID, amount, and customer info are required');
      }

      // Check if invoice exists
      const invoice = await InvoiceModel.findById(invoice_id);
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }

      // Check if payment already exists
      const existingPayment = await PaymentModel.findOne({
        invoice_id,
        payment_method: 'ssl_commerz'
      });

      if (existingPayment) {
        return ResponseUtil.badRequest(res, 'Payment already exists for this invoice');
      }

      // Create SSL Commerz session
      const sessionData = {
        amount,
        currency: 'BDT',
        tran_id: `SSL_${Date.now()}_${invoice_id}`,
        product_category: 'electronics',
        success_url: success_url || `${process.env.FRONTEND_URL}/payment/success`,
        fail_url: fail_url || `${process.env.FRONTEND_URL}/payment/failed`,
        cancel_url: cancel_url || `${process.env.FRONTEND_URL}/payment/cancelled`,
        customer_info,
        metadata: {
          invoice_id,
          user_id
        }
      };

      const sessionResult = await SSLCommerzUtil.createSession(sessionData);

      if (!sessionResult.success) {
        return ResponseUtil.error(res, sessionResult.error, 400);
      }

      // Save payment record
      const payment = new PaymentModel({
        user_id,
        invoice_id,
        payment_method: 'ssl_commerz',
        amount,
        currency: 'BDT',
        status: 'pending',
        transaction_id: sessionResult.transactionId,
        metadata: {
          session_key: sessionResult.sessionKey,
          gateway_url: sessionResult.gatewayPageURL
        }
      });

      await payment.save();

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        session_key: sessionResult.sessionKey,
        gateway_url: sessionResult.gatewayPageURL,
        transaction_id: sessionResult.transactionId
      }, 'SSL Commerz session created successfully');
    } catch (error) {
      console.error('Create SSL Commerz Session Error:', error);
      return ResponseUtil.error(res, 'Failed to create SSL Commerz session', 500);
    }
  }

  /**
   * SSL Commerz Callback Handler
   */
  static async sslCommerzCallback(req, res) {
    try {
      const callbackData = req.body;

      // Validate callback data
      const validation = SSLCommerzUtil.validateCallback(callbackData);

      if (!validation.isValid) {
        console.error('Invalid SSL Commerz callback:', callbackData);
        return ResponseUtil.error(res, 'Invalid callback signature', 400);
      }

      // Find payment record
      const payment = await PaymentModel.findOne({
        transaction_id: validation.transactionId,
        payment_method: 'ssl_commerz'
      });

      if (!payment) {
        return ResponseUtil.notFound(res, 'Payment not found');
      }

      // Update payment based on status
      if (validation.status === 'VALID') {
        payment.status = 'completed';
        payment.payment_date = new Date();
        payment.gateway_response = callbackData;
      } else {
        payment.status = 'failed';
        payment.failure_reason = 'Payment failed on gateway';
        payment.gateway_response = callbackData;
      }

      await payment.save();

      // Update invoice status if payment successful
      if (validation.status === 'VALID') {
        await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
          paymentStatus: 'paid',
          status: 'confirmed'
        });
      }

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        status: payment.status,
        transaction_id: validation.transactionId
      }, 'SSL Commerz callback processed successfully');
    } catch (error) {
      console.error('SSL Commerz Callback Error:', error);
      return ResponseUtil.error(res, 'Failed to process SSL Commerz callback', 500);
    }
  }

  /**
   * Create ShurjoPay Payment Session
   */
  static async createShurjoPaySession(req, res) {
    try {
      const {
        invoice_id,
        amount,
        customer_name,
        customer_address,
        customer_phone,
        customer_city,
        customer_post_code,
        client_ip
      } = req.body;

      const user_id = req.user?.id || req.body.user_id;

      if (!invoice_id || !amount || !customer_name || !customer_phone) {
        return ResponseUtil.badRequest(res, 'Invoice ID, amount, customer name, and phone are required');
      }

      // Check if invoice exists
      const invoice = await InvoiceModel.findById(invoice_id);
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }

      // Check if payment already exists
      const existingPayment = await PaymentModel.findOne({
        invoice_id,
        payment_method: 'shurjopay'
      });

      if (existingPayment) {
        return ResponseUtil.badRequest(res, 'Payment already exists for this invoice');
      }

      // Create ShurjoPay payment session
      const order_id = `SP_${Date.now()}_${invoice_id}`;
      
      const sessionResult = await ShurjoPayUtil.createPaymentSession({
        amount,
        order_id,
        customer_name,
        customer_address: customer_address || 'N/A',
        customer_phone,
        customer_city: customer_city || 'Dhaka',
        customer_post_code: customer_post_code || '1000',
        client_ip: client_ip || req.ip || '127.0.0.1'
      });

      if (!sessionResult.success) {
        return ResponseUtil.error(res, sessionResult.error, 400);
      }

      // Save payment record
      const payment = new PaymentModel({
        user_id,
        invoice_id,
        payment_method: 'shurjopay',
        amount,
        currency: 'BDT',
        status: 'pending',
        transaction_id: sessionResult.sp_payment_id || order_id,
        metadata: {
          order_id: sessionResult.order_id,
          sp_order_id: sessionResult.sp_order_id,
          sp_payment_id: sessionResult.sp_payment_id,
          checkout_url: sessionResult.checkout_url
        }
      });

      await payment.save();

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        checkout_url: sessionResult.checkout_url,
        order_id: sessionResult.order_id,
        sp_order_id: sessionResult.sp_order_id,
        sp_payment_id: sessionResult.sp_payment_id
      }, 'ShurjoPay payment session created successfully');
    } catch (error) {
      console.error('Create ShurjoPay Session Error:', error);
      return ResponseUtil.error(res, 'Failed to create ShurjoPay session', 500);
    }
  }

  /**
   * ShurjoPay Callback Handler
   */
  static async shurjoPayCallback(req, res) {
    try {
      const callbackData = req.body;

      // Validate callback data
      const validation = ShurjoPayUtil.validateCallback(callbackData);

      if (!validation.isValid) {
        console.error('Invalid ShurjoPay callback:', callbackData);
        return ResponseUtil.error(res, 'Invalid callback data', 400);
      }

      // Find payment record
      const payment = await PaymentModel.findOne({
        $or: [
          { transaction_id: validation.transactionId },
          { 'metadata.sp_payment_id': validation.transactionId },
          { 'metadata.order_id': validation.orderId }
        ],
        payment_method: 'shurjopay'
      });

      if (!payment) {
        return ResponseUtil.notFound(res, 'Payment not found');
      }

      // Update payment based on status
      if (validation.isSuccessful) {
        payment.status = 'completed';
        payment.payment_date = new Date();
        payment.gateway_response = callbackData;
        payment.metadata = {
          ...payment.metadata,
          sp_code: validation.code,
          sp_message: validation.message,
          sp_payment_method: validation.paymentMethod,
          sp_payment_date: validation.paymentDate
        };
      } else {
        payment.status = 'failed';
        payment.failure_reason = validation.message || 'Payment failed on gateway';
        payment.gateway_response = callbackData;
      }

      await payment.save();

      // Update invoice status if payment successful
      if (validation.isSuccessful) {
        await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
          paymentStatus: 'paid',
          status: 'confirmed'
        });
      }

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        status: payment.status,
        transaction_id: validation.transactionId,
        order_id: validation.orderId
      }, 'ShurjoPay callback processed successfully');
    } catch (error) {
      console.error('ShurjoPay Callback Error:', error);
      return ResponseUtil.error(res, 'Failed to process ShurjoPay callback', 500);
    }
  }

  /**
   * ShurjoPay IPN (Instant Payment Notification) Handler
   */
  static async shurjoPayIPN(req, res) {
    try {
      const ipnData = req.body;
      
      // Validate IPN data
      const validation = ShurjoPayUtil.validateCallback(ipnData);

      if (!validation.isValid) {
        console.error('Invalid ShurjoPay IPN:', ipnData);
        return res.status(400).send('Invalid IPN data');
      }

      // Find and update payment record
      const payment = await PaymentModel.findOne({
        $or: [
          { transaction_id: validation.transactionId },
          { 'metadata.sp_payment_id': validation.transactionId },
          { 'metadata.order_id': validation.orderId }
        ],
        payment_method: 'shurjopay'
      });

      if (payment) {
        if (validation.isSuccessful) {
          payment.status = 'completed';
          payment.payment_date = new Date();
          payment.gateway_response = ipnData;
          payment.metadata = {
            ...payment.metadata,
            sp_code: validation.code,
            sp_message: validation.message,
            sp_payment_method: validation.paymentMethod,
            sp_payment_date: validation.paymentDate
          };

          await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
            paymentStatus: 'paid',
            status: 'confirmed'
          });
        } else {
          payment.status = 'failed';
          payment.failure_reason = validation.message || 'Payment failed on gateway';
          payment.gateway_response = ipnData;
        }

        await payment.save();
      }

      // ShurjoPay expects "OK" response
      res.status(200).send('OK');
    } catch (error) {
      console.error('ShurjoPay IPN Error:', error);
      res.status(500).send('Error processing IPN');
    }
  }

  /**
   * SSL Commerz IPN (Instant Payment Notification) Handler
   */
  static async sslCommerzIPN(req, res) {
    try {
      const ipnData = req.body;
      
      // Validate IPN data
      const validation = SSLCommerzUtil.validateCallback(ipnData);

      if (!validation.isValid) {
        console.error('Invalid SSL Commerz IPN:', ipnData);
        return res.status(400).send('Invalid IPN signature');
      }

      // Find and update payment record
      const payment = await PaymentModel.findOne({
        transaction_id: validation.transactionId,
        payment_method: 'ssl_commerz'
      });

      if (payment) {
        if (validation.status === 'VALID') {
          payment.status = 'completed';
          payment.payment_date = new Date();
          payment.gateway_response = ipnData;

          await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
            paymentStatus: 'paid',
            status: 'confirmed'
          });
        } else {
          payment.status = 'failed';
          payment.failure_reason = 'Payment failed on gateway';
          payment.gateway_response = ipnData;
        }

        await payment.save();
      }

      // SSL Commerz expects "OK" response
      res.status(200).send('OK');
    } catch (error) {
      console.error('SSL Commerz IPN Error:', error);
      res.status(500).send('Error processing IPN');
    }
  }

  /**
   * Create Cash on Delivery Payment
   */
  static async createCashOnDelivery(req, res) {
    try {
      const { invoice_id } = req.body;
      const user_id = req.user?.id || req.body.user_id;

      if (!invoice_id) {
        return ResponseUtil.badRequest(res, 'Invoice ID is required');
      }

      // Check if invoice exists
      const invoice = await InvoiceModel.findById(invoice_id);
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }

      // Check if payment already exists
      const existingPayment = await PaymentModel.findOne({
        invoice_id,
        payment_method: 'cash_on_delivery'
      });

      if (existingPayment) {
        return ResponseUtil.badRequest(res, 'Payment already exists for this invoice');
      }

      // Create cash on delivery payment
      const payment = new PaymentModel({
        user_id,
        invoice_id,
        payment_method: 'cash_on_delivery',
        amount: invoice.total,
        currency: 'BDT',
        status: 'pending',
        metadata: {
          note: 'Payment will be collected upon delivery'
        }
      });

      await payment.save();

      // Update invoice status
      await InvoiceModel.findByIdAndUpdate(invoice_id, {
        paymentStatus: 'pending',
        status: 'pending'
      });

      return ResponseUtil.success(res, {
        payment_id: payment._id,
        amount: payment.amount,
        status: payment.status,
        note: 'Payment will be collected upon delivery'
      }, 'Cash on delivery payment created successfully');
    } catch (error) {
      console.error('Create Cash on Delivery Error:', error);
      return ResponseUtil.error(res, 'Failed to create cash on delivery payment', 500);
    }
  }

  /**
   * Get Payment by ID
   */
  static async getPaymentById(req, res) {
    try {
      const { id } = req.params;

      const payment = await PaymentModel.findById(id)
        .populate('user_id', 'fullName email')
        .populate('invoice_id', 'invoiceNumber total status');

      if (!payment) {
        return ResponseUtil.notFound(res, 'Payment not found');
      }

      return ResponseUtil.success(res, payment, 'Payment retrieved successfully');
    } catch (error) {
      console.error('Get Payment Error:', error);
      return ResponseUtil.error(res, 'Failed to get payment', 500);
    }
  }

  /**
   * Get User Payments
   */
  static async getUserPayments(req, res) {
    try {
      const { user_id } = req.params;

      const payments = await PaymentModel.find({ user_id })
        .populate('invoice_id', 'invoiceNumber total status')
        .sort({ createdAt: -1 });

      return ResponseUtil.success(res, payments, 'User payments retrieved successfully');
    } catch (error) {
      console.error('Get User Payments Error:', error);
      return ResponseUtil.error(res, 'Failed to get user payments', 500);
    }
  }

  /**
   * Get All Payments (Admin)
   */
  static async getAllPayments(req, res) {
    try {
      const payments = await PaymentModel.find()
        .populate('user_id', 'fullName email')
        .populate('invoice_id', 'invoiceNumber total')
        .sort({ createdAt: -1 });

      return ResponseUtil.success(res, payments, 'All payments retrieved successfully');
    } catch (error) {
      console.error('Get All Payments Error:', error);
      return ResponseUtil.error(res, 'Failed to get payments', 500);
    }
  }

  /**
   * Update Payment Status
   */
  static async updatePaymentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, note } = req.body;

      if (!['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'].includes(status)) {
        return ResponseUtil.badRequest(res, 'Invalid payment status');
      }

      const payment = await PaymentModel.findById(id);

      if (!payment) {
        return ResponseUtil.notFound(res, 'Payment not found');
      }

      payment.status = status;
      if (note) {
        payment.metadata = { ...payment.metadata, note };
      }

      // Update payment date if completed
      if (status === 'completed' && !payment.payment_date) {
        payment.payment_date = new Date();
      }

      await payment.save();

      // Update invoice status if payment completed
      if (status === 'completed') {
        await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
          paymentStatus: 'paid',
          status: 'confirmed'
        });
      }

      return ResponseUtil.success(res, payment, 'Payment status updated successfully');
    } catch (error) {
      console.error('Update Payment Status Error:', error);
      return ResponseUtil.error(res, 'Failed to update payment status', 500);
    }
  }

  /**
   * Process Refund
   */
  static async processRefund(req, res) {
    try {
      const { id } = req.params;
      const { refund_amount, reason } = req.body;

      const payment = await PaymentModel.findById(id);

      if (!payment) {
        return ResponseUtil.notFound(res, 'Payment not found');
      }

      if (payment.status !== 'completed') {
        return ResponseUtil.badRequest(res, 'Only completed payments can be refunded');
      }

      if (!refund_amount || refund_amount > payment.amount) {
        return ResponseUtil.badRequest(res, 'Invalid refund amount');
      }

      let refundResult = { success: false };

      // Process refund based on payment method
      if (payment.payment_method === 'stripe' && payment.payment_intent_id) {
        refundResult = await StripeUtil.processRefund(payment.payment_intent_id, refund_amount);
      } else if (payment.payment_method === 'ssl_commerz' && payment.gateway_response?.bank_tran_id) {
        refundResult = await SSLCommerzUtil.processRefund({
          bank_tran_id: payment.gateway_response.bank_tran_id,
          amount: refund_amount,
          refund_ref_id: `REF_${Date.now()}`
        });
      } else if (payment.payment_method === 'shurjopay' && payment.metadata?.sp_payment_id) {
        refundResult = await ShurjoPayUtil.processRefund({
          sp_payment_id: payment.metadata.sp_payment_id,
          refund_amount,
          refund_reason: reason
        });
      } else {
        // For cash on delivery or other methods, just mark as refunded
        refundResult = { success: true };
      }

      if (refundResult.success) {
        payment.status = 'refunded';
        payment.refunded_at = new Date();
        payment.refund_amount = refund_amount;
        payment.metadata = {
          ...payment.metadata,
          refund_reason: reason,
          refund_id: refundResult.refundId || refundResult.refundRefId
        };

        await payment.save();

        // Update invoice status
        await InvoiceModel.findByIdAndUpdate(payment.invoice_id, {
          status: 'refunded'
        });

        return ResponseUtil.success(res, payment, 'Payment refunded successfully');
      } else {
        return ResponseUtil.error(res, refundResult.error || 'Failed to process refund', 400);
      }
    } catch (error) {
      console.error('Process Refund Error:', error);
      return ResponseUtil.error(res, 'Failed to process refund', 500);
    }
  }

  /**
   * Get Payment Statistics
   */
  static async getPaymentStats(req, res) {
    try {
      const stats = await PaymentModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total_amount: { $sum: '$amount' }
          }
        }
      ]);

      const totalPayments = await PaymentModel.countDocuments();
      const totalAmount = await PaymentModel.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const paymentMethodStats = await PaymentModel.aggregate([
        {
          $group: {
            _id: '$payment_method',
            count: { $sum: 1 },
            total_amount: { $sum: '$amount' }
          }
        }
      ]);

      const result = {
        status_breakdown: stats,
        total_payments: totalPayments,
        total_completed_amount: totalAmount[0]?.total || 0,
        payment_methods: paymentMethodStats
      };

      return ResponseUtil.success(res, result, 'Payment statistics retrieved successfully');
    } catch (error) {
      console.error('Get Payment Stats Error:', error);
      return ResponseUtil.error(res, 'Failed to get payment statistics', 500);
    }
  }
}

module.exports = PaymentController;
