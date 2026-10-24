// Vercel serverless entry. Local development still uses index.js (app.listen).
const os = require("os");

// the deployed code is read-only; some packages (the ShurjoPay plugin) write log files to the working directory
if (process.env.VERCEL) process.chdir(os.tmpdir());

require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../app");
const { connectDB } = require("../shared/config/database");

// one connection per warm instance, shared by every request it serves
let connecting = null;
const ensureDatabase = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  connecting ||= connectDB().catch((error) => {
    connecting = null; // retry on the next request
    throw error;
  });
  return connecting;
};

module.exports = async (req, res) => {
  try {
    await ensureDatabase();
  } catch (error) {
    // the health check still answers (it reports the database as down)
    if (!req.url.startsWith("/api/health")) {
      return res.status(503).json({ success: false, message: "Database unavailable. Please try again shortly." });
    }
  }
  return app(req, res);
};
