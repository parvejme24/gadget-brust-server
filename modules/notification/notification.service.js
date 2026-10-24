const NotificationModel = require("./notification.model");
const { permissionsOf } = require("../../shared/config/permissions");

// notifications the signed-in user can see: their own, plus those for any permission their role has
const audienceFilter = ({ userId, role }) => ({
  $or: [{ user: userId }, { permission: { $in: permissionsOf(role) } }],
});

// create a notification; never lets a failure here break the request that triggered it
const notify = async ({ type = "system", title, message = "", link = "", user, permission }) => {
  if (!title || (!user && !permission)) return null;
  try {
    return await NotificationModel.create({ type, title, message, link, user, permission });
  } catch (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
};

module.exports = { audienceFilter, notify };
