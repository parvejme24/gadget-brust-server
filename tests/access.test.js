// Route × role access matrix: every protected route is called by a guest and by each demo role.
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, ROLES, SEED } = require("./helpers");
const { hasPermission } = require("../shared/config/permissions");

const PUBLIC = "public";
const ANY = "signed-in";
// roles whose permissions include any of the given ones
const withPerm = (...perms) => ROLES.filter((role) => perms.some((p) => hasPermission(role, p)));

const FAKE_ID = "0123456789abcdef01234567";

// [method, path, who may call it]; reads are checked for 200, writes only for 401/403
const READS = [
  ["GET", "/health", PUBLIC],
  ["GET", "/products", PUBLIC],
  ["GET", "/categories", PUBLIC],
  ["GET", "/brands", PUBLIC],
  ["GET", "/shipping", PUBLIC],
  ["GET", "/store-settings", PUBLIC],
  ["GET", "/coupons/offers", PUBLIC],
  ["GET", "/reviews", PUBLIC],
  ["GET", "/notifications", PUBLIC],
  ["GET", "/profile", ANY],
  ["GET", "/addresses", ANY],
  ["GET", "/cart/me", ANY],
  ["GET", "/wishlist/me", ANY],
  ["GET", "/invoices/mine", ANY],
  ["GET", "/dashboard/me", ANY],
  ["GET", "/search?q=phone", ANY],
  ["GET", "/users", withPerm("customers", "staff")],
  ["GET", `/users/${SEED.otherCustomerId}`, withPerm("customers", "staff")],
  ["GET", "/users/email/nusrat@example.com", withPerm("customers", "staff", "pos")],
  ["GET", "/dashboard/stats", withPerm("dashboard")],
  ["GET", "/dashboard/revenue", withPerm("dashboard")],
  ["GET", "/dashboard/products", withPerm("dashboard")],
  ["GET", "/dashboard/customers", withPerm("dashboard")],
  ["GET", "/dashboard/sales", withPerm("dashboard")],
  ["GET", "/dashboard/activities", withPerm("dashboard")],
  ["GET", "/inventory/summary", withPerm("inventory")],
  ["GET", "/inventory/movements", withPerm("inventory")],
  ["GET", "/invoices", withPerm("orders", "reports", "customers")],
  ["GET", `/invoices/user/${SEED.otherCustomerId}`, withPerm("orders", "reports", "customers", "pos")],
  ["GET", "/payments/admin/all", withPerm("payments", "reports")],
  ["GET", "/payments/admin/stats", withPerm("payments", "reports")],
  ["GET", `/payments/user/${SEED.otherCustomerId}`, withPerm("payments", "reports")],
  ["GET", "/coupons", withPerm("coupons", "pos")],
  ["GET", "/couriers", withPerm("couriers", "orders")],
  ["GET", "/contact", withPerm("dashboard")],
  ["GET", "/cart", withPerm("customers")],
  ["GET", `/cart/user/${SEED.otherCustomerId}`, withPerm("customers")],
  ["GET", "/wishlist", withPerm("customers")],
  ["GET", `/wishlist/user/${SEED.otherCustomerId}`, withPerm("customers")],
];

const WRITES = [
  ["POST", "/products", withPerm("catalog")],
  ["PUT", `/products/${FAKE_ID}`, withPerm("catalog")],
  ["DELETE", `/products/${FAKE_ID}`, withPerm("catalog")],
  ["POST", "/categories", withPerm("catalog")],
  ["POST", "/brands", withPerm("catalog")],
  ["PUT", "/store-settings", withPerm("settings")],
  ["POST", "/users", withPerm("staff")],
  ["PUT", `/users/${FAKE_ID}`, withPerm("staff")],
  ["PUT", `/users/${FAKE_ID}/role`, withPerm("staff")],
  ["DELETE", `/users/${FAKE_ID}`, withPerm("staff")],
  ["POST", "/pos/orders", withPerm("pos")],
  ["POST", "/inventory/adjust", withPerm("inventory")],
  ["POST", "/coupons", withPerm("coupons")],
  ["DELETE", `/coupons/${FAKE_ID}`, withPerm("coupons")],
  ["POST", "/couriers", withPerm("couriers")],
  ["DELETE", `/couriers/${FAKE_ID}`, withPerm("couriers")],
  ["POST", "/shipping", withPerm("shipping")],
  ["DELETE", `/shipping/${FAKE_ID}`, withPerm("shipping")],
  ["PUT", `/invoices/${FAKE_ID}`, withPerm("orders")],
  ["PATCH", `/invoices/${FAKE_ID}/order-status`, withPerm("orders")],
  ["PATCH", `/invoices/${FAKE_ID}/shipment`, withPerm("orders")],
  ["DELETE", `/invoices/${FAKE_ID}`, withPerm("orders")],
  ["PATCH", `/payments/${FAKE_ID}/status`, withPerm("payments", "reports")],
  ["PATCH", `/contact/${FAKE_ID}/status`, withPerm("dashboard")],
  ["DELETE", `/cart/user/${FAKE_ID}/clear`, withPerm("customers")],
  ["DELETE", `/wishlist/${FAKE_ID}/clear`, withPerm("customers")],
  ["POST", "/upload/single", withPerm("catalog", "couriers", "settings")],
];

const allowed = (who, role) => who === PUBLIC || who === ANY || who.includes(role);

before(start);
after(stop);

describe("reads", () => {
  for (const [method, path, who] of READS) {
    test(`${method} ${path}`, async () => {
      const guest = await api(method, path);
      if (who === PUBLIC) assert.equal(guest.status, 200, `guest: ${JSON.stringify(guest.body)}`);
      else assert.equal(guest.status, 401, "guest must be asked to sign in");

      for (const role of ROLES) {
        const res = await api(method, path, { as: role });
        const expected = allowed(who, role) ? 200 : 403;
        assert.equal(res.status, expected, `${role}: ${JSON.stringify(res.body).slice(0, 200)}`);
      }
    });
  }
});

describe("writes are refused for roles without the permission", () => {
  for (const [method, path, who] of WRITES) {
    test(`${method} ${path}`, async () => {
      assert.equal((await api(method, path, { body: {} })).status, 401, "guest");
      for (const role of ROLES) {
        const res = await api(method, path, { as: role, body: {} });
        if (allowed(who, role)) assert.notEqual(res.status, 403, `${role} should be allowed`);
        else assert.equal(res.status, 403, `${role}: ${JSON.stringify(res.body).slice(0, 200)}`);
      }
    });
  }
});

test("guests see no notifications; customers don't see staff notifications", async () => {
  const guest = await api("GET", "/notifications");
  assert.deepEqual(guest.body.data, { items: [], unread: 0 });
  const customer = await api("GET", "/notifications", { as: "user", query: { limit: 100 } });
  assert.ok(customer.body.data.items.every((n) => !["order.new", "stock.low", "stock.out", "review.new"].includes(n.type)));
});

test("a forged token signed with the old default secret is rejected", async () => {
  const jwt = require("jsonwebtoken");
  const forged = jwt.sign({ userId: FAKE_ID, email: "x@example.com", role: "admin" }, "your-secret-key");
  assert.equal((await api("GET", "/users", { token: forged })).status, 401);
});
