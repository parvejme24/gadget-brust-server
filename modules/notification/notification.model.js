const mongoose = require("mongoose");

// In-app notification. Sent to one user, or to every staff role that has `permission`.
const NotificationSchema = mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["order.new", "order.status", "order.updated", "stock.low", "stock.out", "review.new", "system"],
      default: "system",
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, trim: true, default: "" },
    link: { type: String, trim: true, default: "" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    permission: { type: String, trim: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
  },
  { timestamps: true, versionKey: false }
);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ permission: 1, createdAt: -1 });

module.exports = mongoose.model("notifications", NotificationSchema);
