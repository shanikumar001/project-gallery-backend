import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    escrowProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowProject' },
    type: {
      type: String,
      enum: [
        'advance_payment',
        'final_payment',
        'platform_commission',
        'worker_payout',
        'refund',
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentGatewayRef: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'transactions' }
);

export default mongoose.model('Transaction', transactionSchema);
