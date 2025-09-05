const stripe = require('stripe');

// Stripe Configuration
const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: process.env.STRIPE_CURRENCY || 'usd'
};

// SSL Commerz Configuration
const sslCommerzConfig = {
  storeId: process.env.SSL_COMMERZ_STORE_ID,
  storePassword: process.env.SSL_COMMERZ_STORE_PASSWORD,
  sandbox: process.env.SSL_COMMERZ_SANDBOX === 'true',
  currency: 'BDT',
  baseUrl: process.env.SSL_COMMERZ_SANDBOX === 'true' 
    ? 'https://sandbox.sslcommerz.com' 
    : 'https://securepay.sslcommerz.com'
};

// ShurjoPay Configuration
const shurjoPayConfig = {
  endpoint: process.env.SP_ENDPOINT,
  username: process.env.SP_USERNAME,
  password: process.env.SP_PASSWORD,
  prefix: process.env.SP_PREFIX,
  returnUrl: process.env.SP_RETURN_URL,
  currency: 'BDT'
};

// Initialize Stripe only if secret key is available
const stripeInstance = stripeConfig.secretKey ? stripe(stripeConfig.secretKey) : null;

// Payment Methods Configuration
const paymentMethods = {
  stripe: {
    name: 'Stripe',
    description: 'Pay with Credit/Debit Card via Stripe',
    enabled: !!stripeConfig.secretKey,
    currency: stripeConfig.currency
  },
  ssl_commerz: {
    name: 'SSL Commerz',
    description: 'Pay with Credit/Debit Card, Mobile Banking via SSL Commerz',
    enabled: !!sslCommerzConfig.storeId,
    currency: sslCommerzConfig.currency
  },
  shurjopay: {
    name: 'ShurjoPay',
    description: 'Pay with Credit/Debit Card, Mobile Banking via ShurjoPay',
    enabled: !!(shurjoPayConfig.endpoint && shurjoPayConfig.username && shurjoPayConfig.password),
    currency: shurjoPayConfig.currency
  },
  cash_on_delivery: {
    name: 'Cash on Delivery',
    description: 'Pay when you receive your order',
    enabled: true,
    currency: 'BDT'
  }
};

module.exports = {
  stripe: stripeInstance,
  stripeConfig,
  sslCommerzConfig,
  shurjoPayConfig,
  paymentMethods
};
