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
    enum: ['user', 'admin', 'manager', 'inventory', 'cashier', 'marketing'],
    default: 'user',
  },
  // deactivated staff/customers can't sign in
  isActive: {
    type: Boolean,
    default: true,
  },
  phone: {
    type: String,
    trim: true,
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
