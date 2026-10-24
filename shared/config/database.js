const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
    });
    console.log("✅ MongoDB Connected Successfully");
    return conn;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message);
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log("MongoDB Disconnected");
  } catch (error) {
    console.error("Error disconnecting from MongoDB:", error.message);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
