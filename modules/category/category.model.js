const mongoose = require("mongoose");

const CategorySchema = mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    categoryImg: {
      url: String,
    },
    subcategories: {
      type: [String],
      default: []
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const CategoryModel = mongoose.model("categories", CategorySchema);

module.exports = CategoryModel;
