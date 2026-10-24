const express = require("express");
const router = express.Router();
const NotificationController = require("./notification.controller");
const { authenticate, optionalAuth } = require("../../shared/middlewares/auth.middleware");

router.get("/", optionalAuth, NotificationController.list);
router.patch("/read-all", authenticate, NotificationController.markAllRead);
router.patch("/:id/read", authenticate, NotificationController.markRead);

module.exports = router;
