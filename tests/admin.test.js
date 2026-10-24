// Reviews, catalog, coupons, staff, settings and the contact inbox, done by the role that owns each
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, newCustomer, inStockProduct, RUN } = require("./helpers");
const ReviewModel = require("../modules/review/review.model");
const ProductModel = require("../modules/product/product.model");
const UserModel = require("../modules/user/user.model");
const ContactModel = require("../modules/contact/contact.model");
const CategoryModel = require("../modules/category/category.model");
const BrandModel = require("../modules/brand/brand.model");

before(start);
after(stop);

describe("reviews", () => {
  let author;
  let other;
  let product;
  let review;

  before(async () => {
    author = await newCustomer("reviewer");
    other = await newCustomer("reviewer-other");
    product = await inStockProduct(1, 4);
  });

  test("a customer reviews a product once; the author comes from the token", async () => {
    assert.equal((await api("POST", "/reviews", { body: { productID: product._id, reviewText: "x", rating: 5 } })).status, 401);
    assert.equal((await api("POST", "/reviews", { token: author.token, body: { productID: "0123456789abcdef01234567", reviewText: "Great", rating: 5 } })).status, 400);

    const res = await api("POST", "/reviews", {
      token: author.token,
      body: { productID: product._id, reviewText: "Works great, fast delivery.", rating: 4, customerEmail: "someone@else.com" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    review = await ReviewModel.findById(res.body.data._id);
    assert.equal(review.customerEmail, author.email);
    assert.equal(String(review.customerID), String(author.user._id));

    const dup = await api("POST", "/reviews", { token: author.token, body: { productID: product._id, reviewText: "Again", rating: 1 } });
    assert.equal(dup.status, 409);
  });

  test("public review lists show the author's name, not their email", async () => {
    const pub = await api("GET", `/reviews/product/${product._id}`);
    const mine = pub.body.data.find((r) => r._id === String(review._id));
    assert.equal(mine.customerName, "Test reviewer");
    assert.equal(mine.customerEmail, undefined);
    assert.equal(mine.customerID.email, undefined);
    assert.ok(pub.body.data.every((r) => r.customerEmail === undefined));

    const mod = await api("GET", `/reviews/product/${product._id}`, { as: "marketing" });
    assert.equal(mod.body.data.find((r) => r._id === String(review._id)).customerEmail, author.email);
  });

  test("only the author or a moderator may edit or delete", async () => {
    assert.equal((await api("PUT", `/reviews/${review._id}`, { token: other.token, body: { rating: 1 } })).status, 403);
    assert.equal((await api("DELETE", `/reviews/${review._id}`, { token: other.token })).status, 403);
    assert.equal((await api("PUT", `/reviews/${review._id}`, { as: "cashier", body: { rating: 1 } })).status, 403);

    const edit = await api("PUT", `/reviews/${review._id}`, {
      token: author.token,
      body: { rating: 5, reviewText: "Even better after a week.", productID: "0123456789abcdef01234567" },
    });
    assert.equal(edit.status, 200);
    const fresh = await ReviewModel.findById(review._id);
    assert.equal(fresh.rating, 5);
    assert.equal(String(fresh.productID), String(product._id), "authors can't move a review to another product");
    assert.equal((await api("PUT", `/reviews/${review._id}`, { token: author.token, body: { rating: 9 } })).status, 400);

    const mod = await api("PUT", `/reviews/${review._id}`, { as: "inventory", body: { reviewText: "Edited by moderator" } });
    assert.equal(mod.status, 200);

    assert.equal((await api("DELETE", `/reviews/${review._id}`, { token: author.token })).status, 200);
    assert.equal(await ReviewModel.exists({ _id: review._id }), null);
  });
});

describe("catalog (store keeper)", () => {
  let created;

  test("create, edit and delete a product; opening stock is logged", async () => {
    const category = await CategoryModel.findOne();
    const brand = await BrandModel.findOne();
    const body = {
      title: `Test Gadget ${RUN}`,
      shortDescription: "A gadget created by the API tests",
      price: 2500,
      discount: 10,
      stock: 7,
      category: category._id,
      subcategory: category.subcategories?.[0]?.name || category.subcategories?.[0] || "General",
      brand: brand._id,
      imageUrl: "https://example.com/gadget.png",
    };
    assert.equal((await api("POST", "/products", { as: "inventory", body: { title: "Missing fields" } })).status, 400);
    const res = await api("POST", "/products", { as: "inventory", body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created = res.body.data;
    assert.equal(created.discountPrice, 2250);
    assert.equal(created.image.url, "https://example.com/gadget.png");

    const moves = await api("GET", "/inventory/movements", { as: "inventory", query: { product: created._id } });
    assert.equal(moves.status, 200);

    const edit = await api("PUT", `/products/${created._id}`, { as: "marketing", body: { price: 3000 } });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal((await ProductModel.findById(created._id)).price, 3000);

    const pub = await api("GET", `/products/${created._id}`);
    assert.equal(pub.status, 200);

    assert.equal((await api("DELETE", `/products/${created._id}`, { as: "inventory" })).status, 200);
    assert.equal(await ProductModel.exists({ _id: created._id }), null);
  });

  test("storefront product filters", async () => {
    const res = await api("GET", "/products", { query: { limit: 5, inStock: "true", sortBy: "price", sortOrder: "asc" } });
    assert.equal(res.status, 200);
    const all = await api("GET", "/products/search", { query: { q: "phone" } });
    assert.ok([200, 400].includes(all.status));
    assert.equal((await api("GET", "/products/0123456789abcdef01234567")).status, 404);
  });
});

describe("coupons (marketing)", () => {
  let coupon;
  const code = `TEST${RUN}`.toUpperCase().slice(0, 16);

  test("create, apply, toggle, delete", async () => {
    const res = await api("POST", "/coupons", {
      as: "marketing",
      body: { code, title: "Test 15% off", type: "percentage", value: 15, minOrderAmount: 0, isPublic: false },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    coupon = res.body.data;

    const product = await inStockProduct(1);
    const applied = await api("POST", "/coupons/apply", { body: { code: code.toLowerCase(), items: [{ product: product._id, qty: 1 }] } });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.ok(applied.body.data.discount > 0);

    const offers = await api("GET", "/coupons/offers");
    assert.ok(!offers.body.data.some((o) => o.code === code), "private coupons aren't advertised");

    const off = await api("PATCH", `/coupons/${coupon._id}/toggle`, { as: "marketing" });
    assert.equal(off.status, 200);
    assert.equal((await api("POST", "/coupons/apply", { body: { code, items: [{ product: product._id, qty: 1 }] } })).status, 400);

    assert.equal((await api("DELETE", `/coupons/${coupon._id}`, { as: "marketing" })).status, 200);
  });
});

describe("staff management and settings (admin)", () => {
  test("create a cashier, change role, deactivate, delete", async () => {
    const email = `test.staff.${RUN}@example.com`;
    const created = await api("POST", "/users", { as: "admin", body: { fullName: "Test Cashier", email, password: "Staff@123", role: "cashier" } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data._id;
    assert.equal((await api("POST", "/users", { as: "admin", body: { fullName: "X", email, password: "Staff@123" } })).status, 400);
    assert.equal((await api("POST", "/users", { as: "admin", body: { fullName: "X", email: `x.${RUN}@example.com`, password: "Staff@123", role: "superuser" } })).status, 400);

    const role = await api("PUT", `/users/${id}/role`, { as: "admin", body: { role: "marketing" } });
    assert.equal(role.body.data.role, "marketing");
    assert.equal((await api("PUT", `/users/${id}/role`, { as: "admin", body: { role: "god" } })).status, 400);

    const admin = await UserModel.findOne({ email: "admin@gadgetbrust.com" });
    assert.equal((await api("PUT", `/users/${admin._id}/role`, { as: "admin", body: { role: "user" } })).status, 400, "admins can't demote themselves");
    assert.equal((await api("PUT", `/users/${admin._id}`, { as: "admin", body: { isActive: false } })).status, 400);

    assert.equal((await api("DELETE", `/users/${id}`, { as: "admin" })).status, 200);
    assert.equal(await UserModel.exists({ _id: id }), null);
  });

  test("store settings: admin updates, everyone reads", async () => {
    const before = (await api("GET", "/store-settings")).body.data;
    const res = await api("PUT", "/store-settings", { as: "admin", body: { announcement: { text: `Test announcement ${RUN}` }, role: "ignored" } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const after = (await api("GET", "/store-settings")).body.data;
    assert.equal(after.announcement.text, `Test announcement ${RUN}`);
    assert.equal(after.announcement.enabled, before.announcement.enabled, "a partial update keeps the other fields");
    assert.equal(after.storeName, before.storeName);

    assert.equal((await api("PUT", "/store-settings", { as: "admin", body: { announcement: "plain text" } })).status, 400);
    assert.equal((await api("PUT", "/store-settings", { as: "admin", body: { taxRate: 500 } })).status, 400);

    // put the announcement back
    await api("PUT", "/store-settings", { as: "admin", body: { announcement: { text: before.announcement.text } } });
    assert.equal((await api("GET", "/store-settings")).body.data.announcement.text, before.announcement.text);
  });
});

describe("contact inbox", () => {
  let message;

  test("a visitor sends a message", async () => {
    assert.equal((await api("POST", "/contact", { body: { name: "X", email: "bad", message: "Hello there, testing" } })).status, 400);
    assert.equal((await api("POST", "/contact", { body: { name: "X", email: "x@example.com", message: "short" } })).status, 400);
    const res = await api("POST", "/contact", {
      body: { name: "Test Visitor", email: `visitor.${RUN}@example.com`, subject: "Question", message: "Do you ship to Sylhet on weekends?" },
    });
    assert.equal(res.status, 201);
    message = res.body.data;
  });

  test("staff read, search and update it", async () => {
    const list = await api("GET", "/contact", { as: "cashier", query: { status: "unread", search: `visitor.${RUN}` } });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.messages.length, 1);
    assert.ok(list.body.data.counts.unread >= 1);

    const upd = await api("PATCH", `/contact/${message._id}/status`, { as: "cashier", body: { status: "replied" } });
    assert.equal(upd.status, 200);
    assert.equal((await ContactModel.findById(message._id)).status, "replied");
    assert.equal((await api("PATCH", `/contact/${message._id}/status`, { as: "cashier", body: { status: "spam" } })).status, 400);
    assert.equal((await api("PATCH", "/contact/bad-id/status", { as: "cashier", body: { status: "read" } })).status, 404);
  });
});

describe("dashboards and search per role", () => {
  for (const role of ["admin", "manager", "inventory", "cashier", "marketing"]) {
    test(`${role} overview loads`, async () => {
      const stats = await api("GET", "/dashboard/stats", { as: role });
      assert.equal(stats.status, 200);
      const me = await api("GET", "/dashboard/me", { as: role });
      assert.equal(me.status, 200);
      const search = await api("GET", "/search", { as: role, query: { q: "a" } });
      assert.equal(search.status, 200);
    });
  }
});
