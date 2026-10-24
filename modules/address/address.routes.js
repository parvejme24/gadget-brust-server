const express = require("express");
const router = express.Router();
const AddressController = require("./address.controller");
const { authenticate } = require("../../shared/middlewares/auth.middleware");

// the signed-in user's own saved delivery addresses
router.use(authenticate);
router.get("/", AddressController.list);
router.post("/", AddressController.create);
router.put("/:id", AddressController.update);
router.delete("/:id", AddressController.remove);
router.patch("/:id/default", AddressController.setDefault);

module.exports = router;
