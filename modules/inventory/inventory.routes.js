const express = require("express");
const router = express.Router();
const InventoryController = require("./inventory.controller");
const { can } = require("../../shared/middlewares/auth.middleware");

router.get("/summary", can("inventory"), InventoryController.summary);
router.get("/movements", can("inventory"), InventoryController.movements);
router.post("/adjust", can("inventory"), InventoryController.adjust);

module.exports = router;
