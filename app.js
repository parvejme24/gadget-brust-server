const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const path = require("path");

// Import shared utilities
const {
  errorHandler,
  notFound,
} = require("./shared/middlewares/error.middleware");

// Import modules
const authRoutes = require("./modules/auth/auth.routes");
const productRoutes = require("./modules/product/product.routes");
const categoryRoutes = require("./modules/category/category.routes");
const brandRoutes = require("./modules/brand/brand.routes");
const reviewRoutes = require("./modules/review/review.routes");
const wishlistRoutes = require("./modules/wishlist/wishlist.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const shippingRoutes = require("./modules/shipping/shipping.routes");
const invoiceRoutes = require("./modules/invoice/invoice.routes");
const uploadRoutes = require("./modules/upload/upload.routes");
const paymentRoutes = require("./modules/payment/payment.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const settingsRoutes = require("./modules/settings/settings.routes");
const courierRoutes = require("./modules/courier/courier.routes");
const couponRoutes = require("./modules/coupon/coupon.routes");
const inventoryRoutes = require("./modules/inventory/inventory.routes");
const posRoutes = require("./modules/pos/pos.routes");
const notificationRoutes = require("./modules/notification/notification.routes");
const searchRoutes = require("./modules/search/search.routes");
const contactRoutes = require("./modules/contact/contact.routes");
const addressRoutes = require("./modules/address/address.routes");
const mongoose = require("mongoose");

const app = express();

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // a storefront page makes several API calls, so 100 was hit during normal browsing
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  // mobile web app on Vercel
  "https://gadgetbrust-app.vercel.app",
  ...(process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean),
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
        /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
        // Vercel preview deployments of the mobile web app
        /^https:\/\/gadgetbrust-app(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)
      ) {
        return callback(null, true);
      }
      // unknown origins are still allowed for now (public storefront API)
      return callback(null, true);
    },
    credentials: true,
  })
);

// Logging middleware
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Home route
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to Gadget Brust API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Handle favicon.ico requests
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// API base route
app.get("/api", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Gadget Brust API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Uptime checks: 200 when the database is connected, 503 otherwise
app.get("/api/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const database = states[mongoose.connection.readyState] || "unknown";
  res.status(database === "connected" ? 200 : 503).json({
    success: database === "connected",
    status: database === "connected" ? "ok" : "degraded",
    database,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api", authRoutes);

app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);

app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);

app.use("/api/cart", cartRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/store-settings", settingsRoutes);
app.use("/api/couriers", courierRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/addresses", addressRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

module.exports = app;
