// Storefront order payments: cash on delivery, SSLCommerz and Stripe Checkout (hosted pages).
// The amount always comes from the saved invoice, and a payment only counts once the gateway
// itself confirms it server-side; the browser redirect is never trusted on its own.
const axios = require('axios');
const InvoiceModel = require('../invoice/invoice.model');
const PaymentModel = require('./payment.model');
const ResponseUtil = require('../../shared/utils/response.util');
const { stripe, sslCommerzConfig } = require('../../shared/config/payment.config');
const { notify } = require('../notification/notification.service');

const ONLINE_METHODS = ['ssl_commerz', 'stripe'];

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const last10 = (phone) => clean(phone, 20).replace(/[\s-]/g, '').slice(-10);

const sslEnabled = () => !!(sslCommerzConfig.storeId && sslCommerzConfig.storePassword);
const stripeEnabled = () => !!stripe;

const methodList = () => [
  { id: 'cash_on_delivery', name: 'Cash on Delivery', description: 'Pay in cash when your order arrives', enabled: true },
  { id: 'ssl_commerz', name: 'SSLCommerz', description: 'bKash, Nagad, Rocket, local cards & net banking', enabled: sslEnabled() },
  { id: 'stripe', name: 'Card (Stripe)', description: 'Visa, Mastercard & international cards', enabled: stripeEnabled() },
];

const isMethodEnabled = (id) => methodList().some((m) => m.id === id && m.enabled);

// Only send users back to our own app or site
const isAllowedReturnUrl = (url) => {
  if (!url) return false;
  if (/^(gadgetbrust|exp|exps):\/\//i.test(url)) return true;
  try {
    const { origin } = new URL(url);
    // extra deployed origins, e.g. the Vercel web app: ALLOWED_RETURN_ORIGINS=https://gadgetbrust-app.vercel.app,https://m.gadgetbrust.com
    const extra = (process.env.ALLOWED_RETURN_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
    return (
      origin === process.env.FRONTEND_URL ||
      extra.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^http:\/\/(192\.168|10)\.\d+\.\d+(\.\d+)?(:\d+)?$/.test(origin)
    );
  } catch {
    return false;
  }
};

const backendBase = (req) => (process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// invoice lookup for guests and customers alike: order number + checkout phone
const findOrder = async (invoiceNumber, phone) => {
  const number = clean(invoiceNumber, 40).toUpperCase();
  const tail = last10(phone);
  if (!number || tail.length < 10) return null;
  const invoice = await InvoiceModel.findOne({ invoiceNumber: number });
  const phones = [invoice?.phone, invoice?.customer?.phone].filter(Boolean).map(last10);
  return invoice && phones.includes(tail) ? invoice : null;
};

// Stripe and SSLCommerz both settle in poisha/cents
const toMinor = (amount) => Math.round(Number(amount) * 100);

const markPaid = async (invoice, payment, gatewayResponse) => {
  payment.status = 'completed';
  payment.payment_date = new Date();
  payment.gateway_response = gatewayResponse;
  await payment.save();

  if (invoice.paymentStatus !== 'completed') {
    invoice.paymentStatus = 'completed';
    invoice.paymentMethod = payment.payment_method;
    if (invoice.status !== 'cancelled') invoice.status = 'paid';
    await invoice.save();
    await notify({
      type: 'order.paid',
      permission: 'orders',
      title: `Payment received for ${invoice.invoiceNumber}`,
      message: `৳${invoice.total.toLocaleString('en-IN')} via ${payment.payment_method === 'stripe' ? 'Stripe' : 'SSLCommerz'}`,
      link: `/dashboard/orders/${invoice._id}`,
    });
  }
};

const markUnpaid = async (payment, status, reason, gatewayResponse = {}) => {
  if (payment.status === 'completed') return;
  payment.status = status;
  payment.failure_reason = reason;
  payment.gateway_response = gatewayResponse;
  await payment.save();
};

// Send the browser back to the app, or show a small page when no return URL was given
const finish = (res, payment, status) => {
  const returnUrl = payment?.metadata?.returnUrl;
  const order = payment?.metadata?.invoiceNumber || '';
  if (returnUrl) {
    const sep = returnUrl.includes('?') ? '&' : '?';
    return res.redirect(303, `${returnUrl}${sep}status=${status}&order=${encodeURIComponent(order)}`);
  }
  const text = status === 'paid' ? 'Payment successful' : status === 'cancelled' ? 'Payment cancelled' : 'Payment failed';
  return res
    .status(200)
    .type('html')
    .send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;text-align:center;padding:48px 16px"><h2>${text}</h2><p>Order ${order}</p><p>You can close this page and return to the Gadget Brust app.</p></body>`);
};

class OrderPaymentController {
  // GET /payments/order/methods
  static methods(req, res) {
    return ResponseUtil.success(res, methodList(), 'Payment methods');
  }

  // POST /payments/order/start { invoiceNumber, phone, method, returnUrl } -> { paymentUrl }
  static async start(req, res, next) {
    try {
      const { invoiceNumber, phone, method, returnUrl } = req.body;
      if (!ONLINE_METHODS.includes(method)) return ResponseUtil.badRequest(res, 'Choose SSLCommerz or Stripe to pay online');
      if (!isMethodEnabled(method)) return ResponseUtil.badRequest(res, 'This payment method is not available right now');
      if (returnUrl && !isAllowedReturnUrl(returnUrl)) return ResponseUtil.badRequest(res, 'Invalid return address');

      const invoice = await findOrder(invoiceNumber, phone);
      if (!invoice) return ResponseUtil.notFound(res, "We couldn't find an order with that number and phone");
      if (invoice.paymentStatus === 'completed') return ResponseUtil.badRequest(res, 'This order is already paid');
      if (invoice.orderStatus === 'cancelled') return ResponseUtil.badRequest(res, 'This order was cancelled');

      const base = backendBase(req);
      const tran = `${invoice.invoiceNumber}-${Date.now().toString(36).toUpperCase()}`;
      const payment = await PaymentModel.create({
        user_id: invoice.user_id,
        invoice_id: invoice._id,
        payment_method: method,
        amount: invoice.total,
        currency: 'BDT',
        status: 'pending',
        transaction_id: tran,
        metadata: { invoiceNumber: invoice.invoiceNumber, returnUrl: returnUrl || '' },
      });

      let paymentUrl;
      if (method === 'ssl_commerz') {
        const params = new URLSearchParams({
          store_id: sslCommerzConfig.storeId,
          store_passwd: sslCommerzConfig.storePassword,
          total_amount: invoice.total.toFixed(2),
          currency: 'BDT',
          tran_id: tran,
          success_url: `${base}/api/payments/order/ssl-return?outcome=success`,
          fail_url: `${base}/api/payments/order/ssl-return?outcome=fail`,
          cancel_url: `${base}/api/payments/order/ssl-return?outcome=cancel`,
          cus_name: invoice.customer?.name || 'Customer',
          cus_email: invoice.customer?.email || 'customer@gadgetbrust.com',
          cus_phone: invoice.phone,
          cus_add1: invoice.shippingAddress?.street || 'N/A',
          cus_city: invoice.shippingAddress?.city || 'Dhaka',
          cus_postcode: invoice.shippingAddress?.zipCode || '1000',
          cus_country: 'Bangladesh',
          shipping_method: 'NO',
          num_of_item: String(invoice.items.length),
          product_name: `Order ${invoice.invoiceNumber}`.slice(0, 250),
          product_category: 'electronics',
          product_profile: 'physical-goods',
          value_a: invoice.invoiceNumber,
        });
        if (process.env.BACKEND_URL) params.set('ipn_url', `${base}/api/payments/order/ssl-ipn`);

        const { data } = await axios.post(`${sslCommerzConfig.baseUrl}/gwprocess/v4/api.php`, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 20000,
        });
        if (data?.status !== 'SUCCESS' || !data.GatewayPageURL) {
          await markUnpaid(payment, 'failed', data?.failedreason || 'Could not start SSLCommerz session', data);
          return ResponseUtil.error(res, data?.failedreason || 'Could not start SSLCommerz payment', 502);
        }
        payment.metadata = { ...payment.metadata, session_key: data.sessionkey };
        paymentUrl = data.GatewayPageURL;
      } else {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          client_reference_id: tran,
          customer_email: invoice.customer?.email || undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'bdt',
                unit_amount: toMinor(invoice.total),
                product_data: {
                  name: `Gadget Brust order ${invoice.invoiceNumber}`,
                  description: invoice.items.map((i) => `${i.qty}× ${i.title}`).join(', ').slice(0, 500),
                },
              },
            },
          ],
          metadata: { invoiceNumber: invoice.invoiceNumber, tran },
          success_url: `${base}/api/payments/order/stripe-return?tran=${encodeURIComponent(tran)}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/api/payments/order/stripe-return?tran=${encodeURIComponent(tran)}&outcome=cancel`,
        });
        payment.payment_intent_id = session.id;
        paymentUrl = session.url;
      }

      invoice.paymentMethod = method;
      await invoice.save();
      payment.markModified('metadata');
      await payment.save();

      return ResponseUtil.success(res, { paymentUrl, transactionId: tran }, 'Payment started');
    } catch (error) {
      if (error.type?.startsWith?.('Stripe')) return ResponseUtil.error(res, error.message, 502);
      next(error);
    }
  }

  // POST /payments/order/cod { invoiceNumber, phone }: switch an unpaid order to cash on delivery
  static async switchToCod(req, res, next) {
    try {
      const invoice = await findOrder(req.body.invoiceNumber, req.body.phone);
      if (!invoice) return ResponseUtil.notFound(res, "We couldn't find an order with that number and phone");
      if (invoice.paymentStatus === 'completed') return ResponseUtil.badRequest(res, 'This order is already paid');
      if (invoice.orderStatus === 'cancelled') return ResponseUtil.badRequest(res, 'This order was cancelled');
      invoice.paymentMethod = 'cash_on_delivery';
      await invoice.save();
      return ResponseUtil.success(res, { paymentMethod: invoice.paymentMethod }, 'You will pay on delivery');
    } catch (error) {
      next(error);
    }
  }

  // SSLCommerz posts the browser here (success/fail/cancel); validate val_id with SSLCommerz before trusting it
  static async sslReturn(req, res, next) {
    try {
      const data = { ...req.query, ...req.body };
      const payment = await PaymentModel.findOne({ transaction_id: clean(data.tran_id, 80), payment_method: 'ssl_commerz' });
      if (!payment) return res.status(404).send('Payment not found');
      if (payment.status === 'completed') return finish(res, payment, 'paid');

      if (data.outcome !== 'success' || !data.val_id) {
        const status = data.outcome === 'cancel' ? 'cancelled' : 'failed';
        await markUnpaid(payment, status, data.error || `Payment ${status} on SSLCommerz`, data);
        return finish(res, payment, status);
      }

      const verified = await OrderPaymentController.verifySsl(payment, data.val_id);
      return finish(res, payment, verified ? 'paid' : 'failed');
    } catch (error) {
      next(error);
    }
  }

  // Server-to-server notification from SSLCommerz (needs a public BACKEND_URL)
  static async sslIpn(req, res, next) {
    try {
      const payment = await PaymentModel.findOne({ transaction_id: clean(req.body.tran_id, 80), payment_method: 'ssl_commerz' });
      if (payment && payment.status !== 'completed' && req.body.val_id) await OrderPaymentController.verifySsl(payment, req.body.val_id);
      return res.status(200).send('OK');
    } catch (error) {
      next(error);
    }
  }

  static async verifySsl(payment, valId) {
    const { data } = await axios.get(`${sslCommerzConfig.baseUrl}/validator/api/validationserverAPI.php`, {
      params: { val_id: valId, store_id: sslCommerzConfig.storeId, store_passwd: sslCommerzConfig.storePassword, format: 'json' },
      timeout: 20000,
    });
    const invoice = await InvoiceModel.findById(payment.invoice_id);
    const ok =
      invoice &&
      ['VALID', 'VALIDATED'].includes(data?.status) &&
      data.tran_id === payment.transaction_id &&
      data.currency_type === 'BDT' &&
      toMinor(data.currency_amount) >= toMinor(invoice.total);

    if (ok) await markPaid(invoice, payment, data);
    else await markUnpaid(payment, 'failed', 'SSLCommerz could not verify this payment', data);
    return ok;
  }

  // Stripe Checkout sends the browser here; re-read the session from Stripe before trusting it
  static async stripeReturn(req, res, next) {
    try {
      const payment = await PaymentModel.findOne({ transaction_id: clean(req.query.tran, 80), payment_method: 'stripe' });
      if (!payment) return res.status(404).send('Payment not found');
      if (payment.status === 'completed') return finish(res, payment, 'paid');

      if (req.query.outcome === 'cancel' || !req.query.session_id) {
        await markUnpaid(payment, 'cancelled', 'Payment cancelled on Stripe');
        return finish(res, payment, 'cancelled');
      }

      const session = await stripe.checkout.sessions.retrieve(clean(req.query.session_id, 200));
      const invoice = await InvoiceModel.findById(payment.invoice_id);
      const ok =
        invoice &&
        session.id === payment.payment_intent_id &&
        session.client_reference_id === payment.transaction_id &&
        session.payment_status === 'paid' &&
        session.currency === 'bdt' &&
        session.amount_total >= toMinor(invoice.total);

      if (ok) {
        await markPaid(invoice, payment, { session_id: session.id, payment_intent: session.payment_intent, amount_total: session.amount_total });
        return finish(res, payment, 'paid');
      }
      await markUnpaid(payment, 'failed', `Stripe payment status: ${session.payment_status}`, { session_id: session.id });
      return finish(res, payment, 'failed');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { OrderPaymentController, isMethodEnabled };
