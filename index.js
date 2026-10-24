// load .env before anything reads process.env (payment config reads keys at require time)
require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./shared/config/database');

const PORT = process.env.PORT || process.env.SERVER_RUNNING_PORT || 5000;

// Connect to database
const startServer = async () => {
  try {
    // Try to connect to MongoDB, but don't fail if it's not available
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('⚠️  MongoDB connection failed, but server will continue:', dbError.message);
      console.log('💡 Make sure MongoDB is running or set MONGODB_URI in your .env file');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🏠 Home: http://localhost:${PORT}/`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();
