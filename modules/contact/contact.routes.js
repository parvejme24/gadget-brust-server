const express = require("express");
const router = express.Router();
const contactController = require("./contact.controller");
const { authenticate, can } = require("../../shared/middlewares/auth.middleware");

// Public endpoint for submitting contact messages
router.post("/", contactController.submitMessage);

// Protected endpoints for staff/admin to view and manage inquiries
router.get("/", can("dashboard"), contactController.getMessages);
router.patch("/:id/status", can("dashboard"), contactController.updateStatus);

module.exports = router;
