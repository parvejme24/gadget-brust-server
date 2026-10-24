// Roles and what each one may do in the dashboard / API.
// Keep in sync with gadget-brust-client/lib/permissions.js

const ALL = [
  "dashboard",
  "reports",
  "catalog",
  "inventory",
  "reviews",
  "coupons",
  "pos",
  "orders",
  "payments",
  "customers",
  "couriers",
  "shipping",
  "settings",
  "staff",
];

const STAFF_PERMISSIONS = {
  admin: ALL,
  manager: ALL.filter((p) => !["settings", "staff"].includes(p)),
  inventory: ["dashboard", "catalog", "inventory", "reviews"],
  cashier: ["dashboard", "pos", "orders", "customers", "couriers"],
  marketing: ["dashboard", "reports", "coupons", "reviews", "catalog"],
};

// customers get their own area of the dashboard (orders, wishlist, reviews)
const ROLE_PERMISSIONS = { ...STAFF_PERMISSIONS, user: ["account"] };

const STAFF_ROLES = Object.keys(STAFF_PERMISSIONS);
const ALL_ROLES = ["user", ...STAFF_ROLES];

const hasPermission = (role, permission) => !!ROLE_PERMISSIONS[role]?.includes(permission);
const permissionsOf = (role) => ROLE_PERMISSIONS[role] || [];
const isStaff = (role) => STAFF_ROLES.includes(role);

module.exports = { ALL, ROLE_PERMISSIONS, STAFF_ROLES, ALL_ROLES, hasPermission, permissionsOf, isStaff };
