const express = require("express");
const router = express.Router();
const PosController = require("./pos.controller");
const { can } = require("../../shared/middlewares/auth.middleware");

router.post("/orders", can("pos"), PosController.createSale);

module.exports = router;
