// Starts the API in-process on a free port, against the database in .env
// (`npm test` points MONGODB_DB_NAME at gadget_brust_test and reseeds it first).
require("dotenv").config();

// one run makes far more requests than a shopper would
process.env.RATE_LIMIT_MAX ||= "100000";
process.env.CHECKOUT_RATE_LIMIT_MAX ||= "100000";
process.env.AUTH_RATE_LIMIT_MAX ||= "100000";
process.env.NODE_ENV ||= "test";
// test accounts use example.com addresses: never send them real email
delete process.env.SMTP_HOST;

const mongoose = require("mongoose");
const app = require("../app");
const { connectDB } = require("../shared/config/database");

// demo accounts created by `npm run seed`
const ACCOUNTS = {
  admin: { email: "admin@gadgetbrust.com", password: "Admin@123" },
  manager: { email: "manager@gadgetbrust.com", password: "Manager@123" },
  inventory: { email: "store@gadgetbrust.com", password: "Store@123" },
  cashier: { email: "cashier@gadgetbrust.com", password: "Cashier@123" },
  marketing: { email: "marketing@gadgetbrust.com", password: "Marketing@123" },
  user: { email: "rahim@example.com", password: "User@123" },
};
const ROLES = Object.keys(ACCOUNTS);

// seed ids used across the tests
const SEED = {
  customerId: "e0e0e1000000000000000002", // rahim
  otherCustomerId: "e0e0e1000000000000000003", // nusrat
  shippingInsideDhaka: "5a1b01000000000000000001",
  courierSteadfast: "c0c1e2000000000000000001",
  courierInactive: "c0c1e2000000000000000006",
};

// a unique tag per run, so test records never collide with seed data or earlier runs
const RUN = Date.now().toString(36);

let server;
let baseUrl;
const tokens = {};

const start = async () => {
  if (server) return;
  if (mongoose.connection.readyState !== 1) {
    const log = console.log;
    console.log = () => {};
    try {
      await connectDB();
    } finally {
      console.log = log;
    }
  }
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
};

const stop = async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  await mongoose.disconnect();
};

// api("GET", "/products", { as: "admin", body, query, token }) -> { status, body }
const api = async (method, path, { as, token, body, query } = {}) => {
  const url = new URL(baseUrl + path);
  Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers = { "Content-Type": "application/json" };
  const bearer = token || (as ? await tokenFor(as) : null);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};

const login = async (email, password) => {
  const res = await api("POST", "/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

// cached access token per demo role
const tokenFor = async (role) => {
  if (!tokens[role]) {
    const account = ACCOUNTS[role];
    if (!account) throw new Error(`No demo account for role ${role}`);
    tokens[role] = (await login(account.email, account.password)).token;
  }
  return tokens[role];
};

// a fresh customer account for tests that change account data
const newCustomer = async (label = "customer") => {
  const email = `test.${label}.${RUN}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = "Test@1234";
  const reg = await api("POST", "/register", { body: { fullName: `Test ${label}`, email, password } });
  if (reg.status !== 201) throw new Error(`Register failed: ${JSON.stringify(reg.body)}`);
  const session = await login(email, password);
  return { email, password, ...session };
};

// an in-stock product with at least `minStock` units
const ProductModel = require("../modules/product/product.model");
const inStockProduct = async (minStock = 5, skip = 0) => {
  const product = await ProductModel.findOne({ stock: { $gte: minStock } }).sort({ _id: 1 }).skip(skip);
  if (!product) throw new Error(`No product with ${minStock}+ in stock`);
  return product;
};

module.exports = { start, stop, api, login, tokenFor, newCustomer, inStockProduct, ACCOUNTS, ROLES, SEED, RUN };
