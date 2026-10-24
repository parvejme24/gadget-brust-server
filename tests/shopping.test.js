// Cart, wishlist and saved addresses for signed-in customers
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, newCustomer, inStockProduct, SEED } = require("./helpers");
const CartModel = require("../modules/cart/cart.model");
const WishlistModel = require("../modules/wishlist/wishlist.model");
const ProductModel = require("../modules/product/product.model");

before(start);
after(stop);

describe("cart", () => {
  let c;
  let other;
  let product;
  let second;
  before(async () => {
    c = await newCustomer("cart");
    other = await newCustomer("cart-other");
    product = await inStockProduct(3);
    second = await inStockProduct(3, 1);
  });

  test("guests must sign in", async () => {
    assert.equal((await api("GET", "/cart/me")).status, 401);
    assert.equal((await api("POST", "/cart", { body: { product_id: product._id } })).status, 401);
  });

  test("add uses the server price and the token's user", async () => {
    const res = await api("POST", "/cart", {
      token: c.token,
      body: { product_id: product._id, qty: 1, price: 1, user_id: SEED.otherCustomerId },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const line = await CartModel.findById(res.body.data._id);
    assert.equal(String(line.user_id), String(c.user._id));
    assert.equal(line.color, "Default");
    assert.equal(line.size, "Standard");
    const expected = product.discount > 0 ? product.price - (product.price * product.discount) / 100 : product.price;
    assert.equal(line.price, expected);
  });

  test("adding the same product again increases the quantity, capped at stock", async () => {
    const again = await api("POST", "/cart", { token: c.token, body: { product_id: product._id, qty: 1 } });
    assert.equal(again.status, 200);
    assert.equal(again.body.data.qty, 2);

    const huge = await api("POST", "/cart", { token: c.token, body: { product_id: product._id, qty: 100000 } });
    assert.equal(huge.status, 200);
    assert.equal(huge.body.data.qty, product.stock);
    assert.match(huge.body.message, /limited/);
  });

  test("invalid and out-of-stock products are refused", async () => {
    assert.equal((await api("POST", "/cart", { token: c.token, body: { product_id: "nope" } })).status, 400);
    assert.equal((await api("POST", "/cart", { token: c.token, body: { product_id: "0123456789abcdef01234567" } })).status, 404);
    const empty = await ProductModel.findOne({ stock: 0 });
    if (empty) assert.equal((await api("POST", "/cart", { token: c.token, body: { product_id: empty._id } })).status, 400);
  });

  test("sync merges a guest cart without duplicates", async () => {
    const res = await api("POST", "/cart/sync", {
      token: c.token,
      body: {
        items: [
          { product_id: product._id, qty: 1 }, // already in the cart with a larger qty: kept
          { product_id: second._id, qty: 2 },
          { product_id: "0123456789abcdef01234567", qty: 1 },
        ],
      },
    });
    assert.equal(res.status, 200);
    const { cartItems, cartSummary, skipped } = res.body.data;
    assert.equal(cartItems.length, 2);
    assert.equal(skipped.length, 1);
    const first = cartItems.find((i) => i.product_id._id === String(product._id));
    assert.equal(first.qty, product.stock);
    assert.equal(cartSummary.itemCount, 2);
    assert.equal(cartSummary.totalItems, product.stock + 2);

    assert.equal((await api("POST", "/cart/sync", { token: c.token, body: { items: "x" } })).status, 400);
  });

  test("quantity changes and removal only touch your own lines", async () => {
    const { body } = await api("GET", "/cart/me", { token: c.token });
    const line = body.data.cartItems.find((i) => i.product_id._id === String(second._id));

    assert.equal((await api("PATCH", `/cart/${line._id}/quantity`, { token: other.token, body: { qty: 1 } })).status, 404);
    assert.equal((await api("DELETE", `/cart/${line._id}`, { token: other.token })).status, 404);
    assert.equal((await api("GET", `/cart/${line._id}`, { token: other.token })).status, 404);
    assert.equal((await api("GET", `/cart/user/${c.user._id}`, { token: other.token })).status, 403);

    assert.equal((await api("PATCH", `/cart/${line._id}/quantity`, { token: c.token, body: { qty: 0 } })).status, 400);
    const upd = await api("PATCH", `/cart/${line._id}/quantity`, { token: c.token, body: { qty: 1 } });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.qty, 1);

    assert.equal((await api("DELETE", `/cart/${line._id}`, { token: c.token })).status, 200);
    assert.equal(await CartModel.countDocuments({ user_id: c.user._id }), 1);
  });

  test("staff can see a customer's cart", async () => {
    const res = await api("GET", `/cart/user/${c.user._id}`, { as: "cashier" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.cartItems.length, 1);
  });

  test("PUT /cart/me saves exactly the given cart (lower quantities and removals included)", async () => {
    const res = await api("PUT", "/cart/me", {
      token: c.token,
      body: { items: [{ product_id: second._id, qty: 2 }, { product_id: "bad", qty: 1 }] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.cartItems.length, 1);
    assert.equal(res.body.data.cartItems[0].qty, 2);
    assert.equal(res.body.data.skipped.length, 1);
    assert.ok("brandName" in (res.body.data.cartItems[0].product_id.brand || {}), "brand name is included for the storefront");

    const lower = await api("PUT", "/cart/me", { token: c.token, body: { items: [{ product_id: second._id, qty: 1 }] } });
    assert.equal(lower.body.data.cartItems[0].qty, 1);
    assert.equal(await CartModel.countDocuments({ user_id: c.user._id }), 1);
    assert.equal((await api("PUT", "/cart/me", { token: c.token, body: {} })).status, 400);
  });

  test("clear my cart", async () => {
    const res = await api("DELETE", "/cart/me", { token: c.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.deletedCount, 1);
    assert.equal(await CartModel.countDocuments({ user_id: c.user._id }), 0);
  });
});

describe("wishlist", () => {
  let c;
  let other;
  let product;
  let second;
  before(async () => {
    c = await newCustomer("wish");
    other = await newCustomer("wish-other");
    product = await inStockProduct(1);
    second = await inStockProduct(1, 2);
  });

  test("add, add again, check", async () => {
    const added = await api("POST", "/wishlist", { token: c.token, body: { productID: product._id, customerID: SEED.otherCustomerId } });
    assert.equal(added.status, 201);
    const row = await WishlistModel.findById(added.body.data._id);
    assert.equal(String(row.customerID), String(c.user._id));
    assert.equal(row.customerEmail, c.email);

    const again = await api("POST", "/wishlist", { token: c.token, body: { productID: product._id } });
    assert.equal(again.status, 200);
    assert.equal(await WishlistModel.countDocuments({ customerID: c.user._id }), 1);

    const check = await api("GET", "/wishlist/check", { token: c.token, query: { productID: product._id } });
    assert.equal(check.body.data.isInWishlist, true);
    const otherCheck = await api("GET", "/wishlist/check", { token: other.token, query: { productID: product._id } });
    assert.equal(otherCheck.body.data.isInWishlist, false);
  });

  test("sync merges a guest wishlist", async () => {
    const res = await api("POST", "/wishlist/sync", {
      token: c.token,
      body: { productIDs: [product._id, second._id, second._id, "bad-id"] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 2);
    assert.equal(res.body.data.skipped.length, 1);
  });

  test("remove by product id; other users can't remove yours", async () => {
    assert.equal((await api("DELETE", `/wishlist/${second._id}`, { token: other.token })).status, 404);
    assert.equal((await api("DELETE", `/wishlist/${second._id}`, { token: c.token })).status, 200);
    const mine = await api("GET", "/wishlist/me", { token: c.token });
    assert.deepEqual(mine.body.data.map((i) => i.productID._id), [String(product._id)]);
  });

  test("PUT /wishlist/me saves exactly the given products", async () => {
    const res = await api("PUT", "/wishlist/me", { token: c.token, body: { productIDs: [second._id] } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.items.map((i) => i.productID._id), [String(second._id)]);
    assert.equal(await WishlistModel.countDocuments({ customerID: c.user._id }), 1);
  });

  test("clear my wishlist", async () => {
    assert.equal((await api("DELETE", "/wishlist/me", { token: c.token })).status, 200);
    assert.equal(await WishlistModel.countDocuments({ customerID: c.user._id }), 0);
  });
});

describe("saved addresses", () => {
  let c;
  const home = { label: "Home", name: "Test Buyer", phone: "01711000000", street: "House 1, Road 2, Banani", city: "Dhaka", zipCode: "1213" };
  before(async () => {
    c = await newCustomer("addr");
  });

  test("validation", async () => {
    const res = await api("POST", "/addresses", { token: c.token, body: { name: "No street" } });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /phone/);
  });

  test("the first address becomes the default; the same street + city updates instead of duplicating", async () => {
    const first = await api("POST", "/addresses", { token: c.token, body: home });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.address.isDefault, true);

    const same = await api("POST", "/addresses", { token: c.token, body: { ...home, street: " house 1, road 2, banani ", label: "Flat" } });
    assert.equal(same.body.data.addresses.length, 1);
    assert.equal(same.body.data.address.label, "Flat");
  });

  test("set default, update, delete", async () => {
    const office = await api("POST", "/addresses", {
      token: c.token,
      body: { ...home, label: "Office", street: "Level 3, Gulshan Avenue", isDefault: true },
    });
    const list = office.body.data.addresses;
    assert.equal(list.length, 2);
    assert.equal(list.filter((a) => a.isDefault).length, 1);
    assert.equal(list.find((a) => a.isDefault).label, "Office");

    const homeId = list.find((a) => a.label === "Flat")._id;
    const def = await api("PATCH", `/addresses/${homeId}/default`, { token: c.token });
    assert.equal(def.body.data.find((a) => a.isDefault)._id, homeId);

    const upd = await api("PUT", `/addresses/${homeId}`, { token: c.token, body: { city: "Chattogram" } });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.address.city, "Chattogram");
    assert.equal((await api("PUT", `/addresses/${homeId}`, { token: c.token, body: { city: "" } })).status, 400);

    // deleting the default promotes another one
    const del = await api("DELETE", `/addresses/${homeId}`, { token: c.token });
    assert.equal(del.body.data.length, 1);
    assert.equal(del.body.data[0].isDefault, true);

    assert.equal((await api("DELETE", "/addresses/0123456789abcdef01234567", { token: c.token })).status, 404);
    assert.equal((await api("DELETE", "/addresses/bad", { token: c.token })).status, 404);
  });

  test("a delivery note and the form's extra fields are kept", async () => {
    const res = await api("POST", "/addresses", {
      token: c.token,
      body: { ...home, street: "House 4, Road 7, Uttara", note: "Landmark: near the mosque", details: { house: "4", road: "7", bad_key: "x", nested: { a: 1 } } },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.address.note, "Landmark: near the mosque");
    assert.deepEqual(res.body.data.address.details, { house: "4", road: "7" });
    await api("DELETE", `/addresses/${res.body.data.address._id}`, { token: c.token });
  });

  test("addresses are private to their owner", async () => {
    const other = await newCustomer("addr-other");
    const mine = await api("GET", "/addresses", { token: c.token });
    const id = mine.body.data[0]._id;
    assert.equal((await api("PUT", `/addresses/${id}`, { token: other.token, body: { city: "X" } })).status, 404);
    assert.equal((await api("GET", "/addresses", { token: other.token })).body.data.length, 0);
  });

  test("at most 10 addresses", async () => {
    const d = await newCustomer("addr-max");
    for (let i = 0; i < 10; i++) {
      const res = await api("POST", "/addresses", { token: d.token, body: { ...home, street: `Street ${i}` } });
      assert.equal(res.status, 201);
    }
    assert.equal((await api("POST", "/addresses", { token: d.token, body: { ...home, street: "Street 11" } })).status, 400);
  });
});
