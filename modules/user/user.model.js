const mongoose = require("mongoose");

const UserSchema = mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  profileImage: {
    url: String,
    publicId: String,
    assetId: String
  },
  opt: {
    type: String,
    required: false,
  },
}, {
  timestamps: true
});

const UserModel = mongoose.model("users", UserSchema);

module.exports = UserModel;
