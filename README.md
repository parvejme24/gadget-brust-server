# 🛒 Gadget Brust Server

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-green?style=for-the-badge&logo=vercel)](https://gadget-brust-server.vercel.app/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge&logo=github)](https://github.com/parvejme24/gadget-brust-server.git)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-green?style=for-the-badge&logo=mongodb)](https://mongodb.com/)
[![Express.js](https://img.shields.io/badge/Express.js-Framework-black?style=for-the-badge&logo=express)](https://expressjs.com/)

> **A comprehensive e-commerce backend API built with Node.js, Express.js, and MongoDB. Features complete authentication, payment processing, product management, and order handling for modern e-commerce applications.**

## 🚀 Live Demo

**API Base URL:** [https://gadget-brust-server.vercel.app/](https://gadget-brust-server.vercel.app/)

**GitHub Repository:** [https://github.com/parvejme24/gadget-brust-server.git](https://github.com/parvejme24/gadget-brust-server.git)

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🏗️ Architecture](#️-architecture)
- [📚 API Documentation](#-api-documentation)
- [🚀 Quick Start](#-quick-start)
- [🔧 Environment Setup](#-environment-setup)
- [📊 Database Schema](#-database-schema)
- [🔐 Authentication](#-authentication)
- [💳 Payment Integration](#-payment-integration)
- [🧪 Testing](#-testing)
- [📈 Performance](#-performance)
- [🔒 Security](#-security)
- [🚀 Deployment](#-deployment)
- [📝 API Examples](#-api-examples)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

### 🔐 **Authentication & Authorization**
- **JWT-based authentication** with refresh tokens
- **Role-based access control** (User/Admin)
- **Secure password hashing** with bcrypt
- **Profile management** and user settings
- **Session management** with token expiration

### 🛍️ **E-commerce Core**
- **Product management** with categories, subcategories, and brands
- **Advanced product search** with filtering and pagination
- **Shopping cart** functionality with persistent storage
- **Wishlist** management for users
- **Product reviews** and rating system
- **Inventory management** with stock tracking

### 💳 **Payment Processing**
- **Multiple payment gateways** integration:
  - **Stripe** (International payments)
  - **ShurjoPay** (Bangladesh)
  - **SSL Commerz** (Bangladesh)
  - **Cash on Delivery** option
- **Secure payment processing** with webhook validation
- **Payment status tracking** and refund management
- **Invoice generation** and management

### 📦 **Order Management**
- **Complete order lifecycle** management
- **Shipping address** management
- **Order tracking** and status updates
- **Invoice generation** with PDF support
- **Order history** and analytics

### 🔧 **Developer Experience**
- **RESTful API** design with consistent response format
- **Comprehensive error handling** and validation
- **API rate limiting** and security middleware
- **Request logging** and monitoring
- **Environment-based configuration**

---

## 🛠️ Tech Stack

### **Backend**
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing

### **Payment Gateways**
- **Stripe** - International payments
- **ShurjoPay** - Bangladesh payments
- **SSL Commerz** - Bangladesh payments

### **Security & Middleware**
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - API protection
- **XSS Protection** - Input sanitization
- **MongoDB Sanitization** - NoSQL injection prevention

### **Development Tools**
- **Nodemon** - Development server
- **Morgan** - HTTP request logger
- **Multer** - File upload handling
- **Cloudinary** - Image management

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Database      │
│   (React/Vue)   │◄──►│   (Express.js)  │◄──►│   (MongoDB)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Payment APIs   │
                       │ (Stripe/Shurjo) │
                       └─────────────────┘
```

### **Project Structure**
```
gadget-brust-server/
├── modules/                 # Feature modules
│   ├── auth/               # Authentication
│   ├── product/           # Product management
│   ├── category/          # Category management
│   ├── brand/             # Brand management
│   ├── cart/              # Shopping cart
│   ├── wishlist/          # User wishlist
│   ├── review/            # Product reviews
│   ├── payment/           # Payment processing
│   ├── invoice/           # Order management
│   └── shipping/          # Shipping management
├── shared/                 # Shared utilities
│   ├── config/            # Configuration files
│   ├── middlewares/       # Custom middlewares
│   └── utils/             # Utility functions
├── data/                  # Sample data
└── app.js                 # Main application file
```

---

## 📚 API Documentation

### **Base URL**
```
Production: https://gadget-brust-server.vercel.app/api
Development: http://localhost:5000/api
```

### **Authentication Endpoints**
```http
POST   /api/register          # User registration
POST   /api/login             # User login
POST   /api/logout            # User logout
GET    /api/profile           # Get user profile
PUT    /api/profile           # Update user profile
```

### **Product Endpoints**
```http
GET    /api/products          # Get all products
GET    /api/products/:id      # Get product by ID
POST   /api/products          # Create product (Admin)
PUT    /api/products/:id      # Update product (Admin)
DELETE /api/products/:id      # Delete product (Admin)
```

### **Payment Endpoints**
```http
GET    /api/payments/methods           # Get payment methods
POST   /api/payments/stripe/create-intent    # Create Stripe payment
POST   /api/payments/shurjopay/create-session # Create ShurjoPay session
POST   /api/payments/cash-on-delivery   # Cash on delivery
```

---

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+ 
- MongoDB 6+
- npm or yarn

### **Installation**
```bash
# Clone the repository
git clone https://github.com/parvejme24/gadget-brust-server.git

# Navigate to project directory
cd gadget-brust-server

# Install dependencies
npm install

# Start development server
npm run dev
```

### **Environment Variables**
Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/gadget-hub
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:3000

# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
STRIPE_SECRET_KEY=sk_test_your_stripe_secret

# ShurjoPay Configuration
SP_ENDPOINT=https://sandbox.shurjopayment.com
SP_USERNAME=your_username
SP_PASSWORD=your_password
```

---

## 🔧 Environment Setup

### **Development**
```bash
npm run dev          # Start with nodemon
npm start           # Start production server
npm run build       # Build for production
```

### **Production**
```bash
npm start           # Start production server
```

---

## 📊 Database Schema

### **User Model**
```javascript
{
  fullName: String,
  email: String (unique),
  password: String (hashed),
  role: String (user/admin),
  profileImage: Object,
  createdAt: Date,
  updatedAt: Date
}
```

### **Product Model**
```javascript
{
  title: String,
  shortDescription: String,
  keyFeatures: Array,
  price: Number,
  discount: Number,
  images: Array,
  stock: Number,
  category: ObjectId,
  subcategory: String,
  brand: ObjectId,
  star: Number,
  remark: String
}
```

---

## 🔐 Authentication

### **Registration**
```bash
curl -X POST https://gadget-brust-server.vercel.app/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

### **Login**
```bash
curl -X POST https://gadget-brust-server.vercel.app/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

---

## 💳 Payment Integration

### **Stripe Payment**
```javascript
// Create payment intent
const response = await fetch('/api/payments/stripe/create-intent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    invoice_id: 'invoice_id',
    amount: 10000, // Amount in cents
    currency: 'usd'
  })
});
```

### **ShurjoPay Integration**
```javascript
// Create ShurjoPay session
const response = await fetch('/api/payments/shurjopay/create-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    invoice_id: 'invoice_id',
    amount: 1000,
    customer_name: 'John Doe',
    customer_phone: '+8801234567890'
  })
});
```

---

## 🧪 Testing

### **API Testing with cURL**

**Test Server Health:**
```bash
curl https://gadget-brust-server.vercel.app/
```

**Test Product Endpoint:**
```bash
curl https://gadget-brust-server.vercel.app/api/products
```

**Test Authentication:**
```bash
# Register
curl -X POST https://gadget-brust-server.vercel.app/api/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test User","email":"test@example.com","password":"test123"}'

# Login
curl -X POST https://gadget-brust-server.vercel.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

---

## 📈 Performance

### **Optimization Features**
- **Database indexing** for faster queries
- **Pagination** for large datasets
- **Response compression** with gzip
- **Caching strategies** for frequently accessed data
- **Connection pooling** for database efficiency

### **Monitoring**
- **Request logging** with Morgan
- **Error tracking** and reporting
- **Performance metrics** collection
- **Health check endpoints**

---

## 🔒 Security

### **Security Measures**
- **JWT token authentication** with expiration
- **Password hashing** with bcrypt
- **Input validation** and sanitization
- **SQL injection prevention**
- **XSS protection**
- **Rate limiting** to prevent abuse
- **CORS configuration**
- **Security headers** with Helmet

### **Data Protection**
- **Environment variables** for sensitive data
- **Secure API key management**
- **Payment data encryption**
- **User data privacy** compliance

---

## 🚀 Deployment

### **Vercel Deployment**
The application is deployed on Vercel with automatic CI/CD:

**Live URL:** [https://gadget-brust-server.vercel.app/](https://gadget-brust-server.vercel.app/)

### **Deployment Features**
- **Automatic deployments** from GitHub
- **Environment variable management**
- **Serverless architecture**
- **Global CDN** distribution
- **SSL certificates** included

---

## 📝 API Examples

### **Complete E-commerce Flow**

**1. User Registration:**
```javascript
const registerUser = async () => {
  const response = await fetch('https://gadget-brust-server.vercel.app/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'John Doe',
      email: 'john@example.com',
      password: 'securePassword123'
    })
  });
  return response.json();
};
```

**2. Browse Products:**
```javascript
const getProducts = async () => {
  const response = await fetch('https://gadget-brust-server.vercel.app/api/products');
  return response.json();
};
```

**3. Add to Cart:**
```javascript
const addToCart = async (productId, token) => {
  const response = await fetch('https://gadget-brust-server.vercel.app/api/cart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      product_id: productId,
      quantity: 1
    })
  });
  return response.json();
};
```

**4. Process Payment:**
```javascript
const processPayment = async (invoiceId, token) => {
  const response = await fetch('https://gadget-brust-server.vercel.app/api/payments/stripe/create-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      invoice_id: invoiceId,
      amount: 5000,
      currency: 'usd'
    })
  });
  return response.json();
};
```

---

## 🎯 Key Achievements

### **Technical Excellence**
- ✅ **Full-stack e-commerce solution** with complete backend API
- ✅ **Multiple payment gateway integration** (Stripe, ShurjoPay, SSL Commerz)
- ✅ **Secure authentication system** with JWT and role-based access
- ✅ **Comprehensive product management** with categories, brands, and reviews
- ✅ **Advanced order processing** with invoice generation and tracking
- ✅ **Production-ready deployment** on Vercel with CI/CD

### **Business Impact**
- 🚀 **Scalable architecture** supporting thousands of concurrent users
- 💳 **Multi-currency payment processing** for global reach
- 📱 **Mobile-responsive API** for cross-platform compatibility
- 🔒 **Enterprise-grade security** with comprehensive data protection
- 📊 **Analytics-ready** with comprehensive logging and monitoring

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### **Development Guidelines**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Contact

**Developer:** Parvej Me
- **GitHub:** [@parvejme24](https://github.com/parvejme24)
- **Project:** [Gadget Brust Server](https://github.com/parvejme24/gadget-brust-server.git)
- **Live Demo:** [https://gadget-brust-server.vercel.app/](https://gadget-brust-server.vercel.app/)

---

<div align="center">

### 🌟 **Star this repository if you found it helpful!** 🌟

**Built with ❤️ by [Parvej Me](https://github.com/parvejme24)**

</div>
