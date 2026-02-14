import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    completedAt: { type: Date, default: null },
  },
  { _id: true }
);

const escrowProjectSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chatWithUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who client chatted with

    title: { type: String, required: true },
    description: { type: String, default: '' },
    budget: { type: Number, required: true, min: 0 },
    deadline: { type: Date, required: true },

    // Locked after both parties agree
    agreedBudget: { type: Number, default: null },
    agreedDeadline: { type: Date, default: null },
    agreedTimeline: { type: String, default: '' },
    lockedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: [
        'offer_sent',
        'accepted',
        'rejected',
        'pending_advance',
        'in_progress',
        'mid_level',
        'completed',
        'completed_released',
        'cancelled',
      ],
      default: 'offer_sent',
    },

    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    milestones: [milestoneSchema],

    advancePaidAt: { type: Date, default: null },
    advanceAmount: { type: Number, default: 0 },
    finalPaidAt: { type: Date, default: null },
    finalAmount: { type: Number, default: 0 },

    platformCommissionPercent: { type: Number, default: 5 },
    platformCommissionAmount: { type: Number, default: 0 },
    workerPayoutAmount: { type: Number, default: 0 },
    workerPayoutAt: { type: Date, default: null },

    rating: { type: Number, default: null, min: 1, max: 5 },
    review: { type: String, default: '' },
    ratedAt: { type: Date, default: null },

    cancelledBy: { type: String, enum: ['client', 'worker', 'admin'], default: null },
    cancelReason: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'escrow_projects' }
);

export default mongoose.model('EscrowProject', escrowProjectSchema);
