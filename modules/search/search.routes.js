const express = require("express");
const router = express.Router();
const SearchController = require("./search.controller");
const { authenticate } = require("../../shared/middlewares/auth.middleware");

router.get("/", authenticate, SearchController.search);

module.exports = router;
