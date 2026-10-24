const { verifyAccessToken } = require("../config/jwt");
const ResponseUtil = require("../utils/response.util");
const { hasPermission } = require("../config/permissions");

const readToken = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const verify = (token) => {
  const payload = verifyAccessToken(token);
  return { userId: payload.userId, id: payload.userId, email: payload.email, role: payload.role };
};

// Requires a valid access token; sets req.user = { userId, email, role }
const authenticate = (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    return ResponseUtil.unauthorized(res, "Authentication required");
  }
  try {
    req.user = verify(token);
    next();
  } catch (error) {
    return ResponseUtil.error(res, error.name === "TokenExpiredError" ? "Session expired" : "Invalid token", 401);
  }
};

// Sets req.user when a valid token is present, but never blocks the request
const optionalAuth = (req, res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      req.user = verify(token);
    } catch {
      // treat as a guest
    }
  }
  next();
};

// Must run after authenticate
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return ResponseUtil.forbidden(res, "Access denied. Admin only.");
  }
  next();
};

// authenticate + allow staff whose role has at least one of the given permissions
const can = (...permissions) => [
  authenticate,
  (req, res, next) => {
    if (permissions.some((p) => hasPermission(req.user?.role, p))) return next();
    return ResponseUtil.forbidden(res, "You don't have permission to do this.");
  },
];

const adminOnly = [authenticate, requireAdmin];
const verifyToken = authenticate;
const requirePermission = can;

module.exports = { authenticate, optionalAuth, requireAdmin, adminOnly, can, verifyToken, requirePermission };
