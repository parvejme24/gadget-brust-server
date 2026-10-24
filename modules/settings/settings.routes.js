const express = require("express");
const router = express.Router();
const SettingsController = require("./settings.controller");
const { can } = require("../../shared/middlewares/auth.middleware");

router.get("/", SettingsController.getSettings);
router.put("/", can('settings'), SettingsController.updateSettings);

module.exports = router;
