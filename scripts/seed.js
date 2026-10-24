// Usage:
//   npm run seed           -> wipe the seeded collections and import data/*.json
//   npm run seed:destroy   -> wipe the seeded collections only
require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("../shared/config/database");

const CategoryModel = require("../modules/category/category.model");
const BrandModel = require("../modules/brand/brand.model");
const ProductModel = require("../modules/product/product.model");
const UserModel = require("../modules/user/user.model");
const ReviewModel = require("../modules/review/review.model");
const WishlistModel = require("../modules/wishlist/wishlist.model");
const CartModel = require("../modules/cart/cart.model");
const ShippingModel = require("../modules/shipping/shipping.model");
const InvoiceModel = require("../modules/invoice/invoice.model");
const PaymentModel = require("../modules/payment/payment.model");
const SettingsModel = require("../modules/settings/settings.model");
const CourierModel = require("../modules/courier/courier.model");
const CouponModel = require("../modules/coupon/coupon.model");
const StockMovementModel = require("../modules/inventory/stockMovement.model");
const NotificationModel = require("../modules/notification/notification.model");
const ContactModel = require("../modules/contact/contact.model");
const RefreshTokenModel = require("../modules/auth/auth.model");

// order matters: referenced documents are inserted first
const collections = [
  ["category", CategoryModel],
  ["brand", BrandModel],
  ["product", ProductModel],
  ["user", UserModel],
  ["shipping", ShippingModel],
  ["courier", CourierModel],
  ["coupon", CouponModel],
  ["review", ReviewModel],
  ["wishlist", WishlistModel],
  ["cart", CartModel],
  ["invoice", InvoiceModel],
  ["payment", PaymentModel],
  ["stockMovement", StockMovementModel],
  ["settings", SettingsModel],
  ["notification", NotificationModel],
  ["contact", ContactModel],
];

const loadData = (name) => require(path.join(__dirname, "..", "data", `${name}.json`));

const destroy = async () => {
  for (const [name, Model] of [...collections].reverse()) {
    const { deletedCount } = await Model.deleteMany({});
    console.log(`🗑️  ${name}: removed ${deletedCount}`);
  }
  // sessions of the wiped users are no longer valid
  await RefreshTokenModel.deleteMany({});
};

const importData = async () => {
  for (const [name, Model] of collections) {
    const docs = loadData(name);
    // timestamps: false keeps the createdAt/updatedAt values from the JSON
    await Model.insertMany(docs, { timestamps: false });
    console.log(`✅ ${name}: inserted ${docs.length}`);
  }
  // unique indexes (email, invoice number, cart line, ...) must exist before the API takes writes
  for (const [, Model] of collections) await Model.syncIndexes();
};

const run = async () => {
  await connectDB();
  try {
    await destroy();
    if (!process.argv.includes("--destroy")) {
      await importData();
    }
    console.log("🌱 Seeding finished");
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
};

run();
