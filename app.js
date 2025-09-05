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

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Logging middleware
app.use(morgan("dev"));

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

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

module.exports = app;
