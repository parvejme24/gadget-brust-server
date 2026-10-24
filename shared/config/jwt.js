const jwt = require("jsonwebtoken");

// Without real secrets anyone could forge a token, so production refuses to run on the fallbacks
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be set in production");
}

const ACCESS_SECRET = process.env.JWT_SECRET || "dev-only-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-only-refresh-secret";

const signAccessToken = (user) =>
  jwt.sign({ userId: user._id, email: user.email, role: user.role }, ACCESS_SECRET, { expiresIn: "1h" });

const signRefreshToken = (user) => jwt.sign({ userId: user._id }, REFRESH_SECRET, { expiresIn: "7d" });

const verifyAccessToken = (token) => jwt.verify(token, ACCESS_SECRET);
const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_SECRET);

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
