const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  invoice_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  payment_method: {
    type: String,
    enum: ['stripe', 'ssl_commerz', 'cash_on_delivery'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'BDT'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  transaction_id: {
    type: String,
    unique: true,
    sparse: true
  },
  payment_intent_id: {
    type: String,
    sparse: true
  },
  gateway_response: {
    type: Object,
    default: {}
  },
  failure_reason: {
    type: String
  },
  payment_date: {
    type: Date
  },
  refunded_at: {
    type: Date
  },
  refund_amount: {
    type: Number,
    default: 0
  },
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for better query performance
paymentSchema.index({ user_id: 1, created_at: -1 });
paymentSchema.index({ invoice_id: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ transaction_id: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
