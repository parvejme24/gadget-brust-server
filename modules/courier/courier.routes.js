const express = require("express");
const router = express.Router();
const CourierController = require("./courier.controller");
const { can } = require("../../shared/middlewares/auth.middleware");

router.get("/", can("couriers", "orders"), CourierController.getAll);
router.get("/:id", can("couriers", "orders"), CourierController.getById);
router.post("/", can('couriers'), CourierController.create);
router.put("/:id", can('couriers'), CourierController.update);
router.patch("/:id/toggle-status", can('couriers'), CourierController.toggleStatus);
router.patch("/:id/default", can('couriers'), CourierController.setDefault);
router.delete("/:id", can('couriers'), CourierController.remove);

module.exports = router;
