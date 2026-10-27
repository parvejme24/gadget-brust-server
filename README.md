# ⚙️ Gadget Brust — Backend Server

[![API Live](https://img.shields.io/badge/API-Live_Deployment-10b981?style=for-the-badge&logo=vercel&logoColor=white)](https://gadgetbrust-server.vercel.app/api/health)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-Framework-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Tests](https://img.shields.io/badge/Automated_Tests-131_Passing-blue?style=for-the-badge&logo=jest&logoColor=white)](https://github.com/parvejme24/gadget-brust-server)

---

## 📌 Short Description

**Gadget Brust Server** is a robust, production-tested RESTful API backend engineered with **Node.js**, **Express.js**, and **MongoDB**. Serving as the central operational backbone for both web and mobile client applications, it powers comprehensive multi-role access control (RBAC for 6 roles), server-authoritative cart and price calculations, atomic inventory reservations, multi-gateway payment processing (Stripe & ShurjoPay), and automated courier fulfillment.

---

## ✨ Key Features

### 🔐 Multi-Tier Authentication & RBAC
- **Dual JWT Token Architecture:** Short-lived access tokens combined with secure refresh token rotation to mitigate token hijacking.
- **Granular 6-Role Authorization:** Enforces strict permission boundaries across Admin, Manager, Store Keeper, Cashier, Marketing, and Customer.
- **Bcrypt Password Hashing:** Salted cryptography with password reset verification tokens via email.

### 🛍️ E-Commerce Engine & Inventory Integrity
- **Server-Authoritative Pricing:** All coupon discounts, item prices, sub-totals, and delivery tariffs are calculated strictly on the backend to prevent price tampering.
- **Atomic Stock Management:** Real-time inventory tracking with race-condition prevention during flash sales and peak checkout loads.
- **Product & Taxonomy Management:** Multi-level categorization, brand associations, SKU management, and customer ratings/reviews.

### 💳 Dual Payment Gateway Integration
- **Stripe:** Direct credit/debit card processing with webhooks for international transactions.
- **ShurjoPay:** Integration for local debit/credit and mobile financial services (bKash, Nagad, Rocket) in Bangladesh.
- **Cash on Delivery (COD):** In-store counter POS and delivery verification support.

### 🚚 Courier Logistics & Point of Sale (POS)
- **Courier Logistics Shims:** Built-in adapter interfaces for automated parcel consignment dispatch and tracking status updates.
- **POS Checkout & Invoicing:** Real-time order generation designed for counter cashiers with live stock deductions and receipt data formatting.

### 🧪 Robust Test Coverage
- **131+ Automated Tests:** Comprehensive test suite validating public endpoints, role-based access restrictions, checkout edge cases, and payment callbacks.

---

## 🛠️ Tech Stack

| Category | Technology | Description |
|---|---|---|
| **Runtime** | Node.js (v18+) | Asynchronous event-driven JavaScript execution |
| **Framework** | Express.js | High-performance, unopinionated web framework |
| **Database** | MongoDB & Mongoose | Document-oriented NoSQL database with strict schema modeling |
| **Authentication** | JSON Web Tokens (JWT) & Bcrypt | Stateless authentication with cryptographic password hashing |
| **Payment Gateways** | Stripe SDK & ShurjoPay | Global card processing and regional Mobile Financial Services (MFS) |
| **Validation** | Joi / Zod & Express Validators | Request payload sanitization and schema verification |
| **Email Service** | Nodemailer | Transactional email delivery for password resets and order memos |
| **Testing** | Jest & Supertest | Automated unit, integration, and security test runners |
| **Deployment** | Vercel Serverless / Node Container | Scalable serverless or containerized deployment runtime |

---

## 💡 Why This Project?

Traditional e-commerce backends often fall into two problematic extremes:
1. **Bloated Monolithic CMSs (e.g., WooCommerce, Magento):** High memory overhead, sluggish API performance, and steep maintenance costs that hinder modern frontend development.
2. **Oversimplified Tutorial APIs:** Minimal CRUD projects that trust user-submitted prices from the frontend, lack atomic stock decrementing, and lack multi-role staff permission architectures.

**Gadget Brust Server was developed to fill this gap with a modern, high-speed, enterprise-grade architecture.** It is lightweight, stateless, thoroughly tested against race conditions, and equipped out of the box to power both an omnichannel web application and a native mobile app from a single, unified codebase.

---

## 🎯 Which Problems Solved?

1. **Client-Side Price Manipulation:** Eliminated security risks where bad actors tamper with client payloads; all cart calculations and coupon discounts are strictly computed server-side.
2. **Inventory Overselling & Race Conditions:** Atomic database transactions guarantee that simultaneous orders never sell inventory below zero stock.
3. **Fragmented Store Staff Management:** Provides fine-grained role control so that store clerks, cashiers, marketers, and administrators each access only what their role demands.
4. **Cross-Border Payment Friction:** Bridges global and local commerce by embedding Stripe for international buyers alongside ShurjoPay for regional mobile payment methods.
5. **Session Invalidation Vulnerabilities:** Features server-side token revocation upon user logout, ensuring that stolen refresh tokens cannot remain active.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18 or higher
- **MongoDB** running locally or a [MongoDB Atlas](https://www.mongodb.com/atlas) connection URI

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/parvejme24/gadget-brust.git
cd gadget-brust/gadget-brust-server

# Install dependencies
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
PORT=6060
NODE_ENV=development
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/gadget_brust
JWT_ACCESS_SECRET=your_jwt_access_secret_key
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Payment Gateways
STRIPE_SECRET_KEY=sk_test_...
SHURJOPAY_API_KEY=your_shurjopay_key

# Email Service
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_app_password
```

### 3. Run the Server
```bash
# Development mode with hot-reloading
npm run dev

# Production start
npm start
```
The server will boot on `http://localhost:6060` (or your defined `PORT`).

### 4. Running Automated Tests
```bash
# Run test suite
npm test

# Run tests with coverage report
npm run test:coverage
```

---

## 📡 Core API Modules

| Endpoint Group | Description |
|---|---|
| `/api/v1/auth` | User registration, login, logout, refresh tokens, and password resets |
| `/api/v1/products` | Catalog listing, searching, filtering, and stock adjustments |
| `/api/v1/categories` | Product hierarchy and brand categorizations |
| `/api/v1/orders` | Checkout execution, guest order creation, tracking, and status transitions |
| `/api/v1/pos` | Cashier point-of-sale checkout and thermal receipt generation |
| `/api/v1/couriers` | Courier shipment assignment and dispatch management |
| `/api/v1/coupons` | Promo code validation, usage restrictions, and discount calculation |
| `/api/v1/reviews` | Verified product feedback, ratings, and moderation |
| `/api/v1/users` | Staff role assignment, customer profile management, and permissions |

---

## 🏁 Conclusion

The **Gadget Brust Server** provides the foundational reliability, security, and scalability necessary for a multi-channel retail ecosystem. By pairing atomic inventory consistency with robust multi-gateway payments and strict role-based access control, it ensures dependable data integrity across every customer purchase and store operation.

- 🌐 **Looking for the web client?** Check out [Gadget Brust Client](../gadget-brust-client).
- 📱 **Looking for the mobile app?** Check out [Gadget Brust App](../gadget-brust-app).
