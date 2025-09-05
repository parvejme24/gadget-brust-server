const mongoose = require("mongoose");

const RefreshTokenSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true
});

// Index for better performance
RefreshTokenSchema.index({ userId: 1 });
RefreshTokenSchema.index({ token: 1 });

const RefreshTokenModel = mongoose.model("refreshTokens", RefreshTokenSchema);
module.exports = RefreshTokenModel;

