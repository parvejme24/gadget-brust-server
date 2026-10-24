const mongoose = require("mongoose");
const NotificationModel = require("./notification.model");
const { audienceFilter } = require("./notification.service");
const ResponseUtil = require("../../shared/utils/response.util");

const shape = (n, userId) => ({
  _id: n._id,
  type: n.type,
  title: n.title,
  message: n.message,
  link: n.link,
  createdAt: n.createdAt,
  read: n.readBy.some((id) => String(id) === String(userId)),
});

class NotificationController {
  // ?limit=20&unread=true
  async list(req, res, next) {
    try {
      const user = req.user;
      // every notification is for a user or a staff permission, so guests have none
      if (!user) return ResponseUtil.success(res, { items: [], unread: 0 }, "Notifications");
      const userId = user.userId;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const filter = audienceFilter(user);
      const listFilter = req.query.unread === "true" ? { ...filter, readBy: { $ne: userId } } : filter;

      const [items, unread] = await Promise.all([
        NotificationModel.find(listFilter).sort({ createdAt: -1 }).limit(limit),
        NotificationModel.countDocuments({ ...filter, readBy: { $ne: userId } }),
      ]);
      return ResponseUtil.success(
        res,
        { items: items.map((n) => shape(n, userId)), unread },
        "Notifications"
      );
    } catch (error) {
      next(error);
    }
  }

  async markRead(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return ResponseUtil.badRequest(res, "Invalid notification");
      const updated = await NotificationModel.findOneAndUpdate(
        { _id: req.params.id, ...audienceFilter(req.user) },
        { $addToSet: { readBy: req.user.userId } },
        { new: true }
      );
      if (!updated) return ResponseUtil.notFound(res, "Notification not found");
      return ResponseUtil.success(res, shape(updated, req.user.userId), "Marked as read");
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req, res, next) {
    try {
      const { modifiedCount } = await NotificationModel.updateMany(
        { ...audienceFilter(req.user), readBy: { $ne: req.user.userId } },
        { $addToSet: { readBy: req.user.userId } }
      );
      return ResponseUtil.success(res, { updated: modifiedCount }, "All notifications marked as read");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
