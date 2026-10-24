const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      // MONGODB_DB_NAME overrides the database in the URI (the tests use gadget_brust_test)
      ...(process.env.MONGODB_DB_NAME && { dbName: process.env.MONGODB_DB_NAME }),
    });
    console.log(`✅ MongoDB Connected Successfully (${conn.connection.name})`);
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
