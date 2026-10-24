const mongoose = require("mongoose");

// saved delivery addresses (same fields the app's address book uses)
const AddressSchema = new mongoose.Schema({
  label: { type: String, trim: true, default: "Home" },
  name: { type: String, trim: true, required: true },
  phone: { type: String, trim: true, required: true },
  street: { type: String, trim: true, required: true },
  city: { type: String, trim: true, required: true },
  zipCode: { type: String, trim: true, default: "" },
  // delivery note for the courier (landmark, best time) and the form's extra fields (house, road, ...)
  note: { type: String, trim: true, default: "", maxlength: 300 },
  details: { type: Map, of: String, default: undefined },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

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
  addresses: {
    type: [AddressSchema],
    default: [],
  },
  // set when the account was created or linked with Google sign-in
  googleId: {
    type: String,
    index: true,
    sparse: true,
  },
  // forgot-password code: stored hashed, expires after 10 minutes
  resetCode: { type: String, select: false },
  resetCodeExpires: { type: Date, select: false },
  resetAttempts: { type: Number, default: 0, select: false },
}, {
  timestamps: true
});

const UserModel = mongoose.model("users", UserSchema);

module.exports = UserModel;
