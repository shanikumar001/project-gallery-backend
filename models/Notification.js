import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'project_offer',
        'project_accepted',
        'project_rejected',
        'advance_paid',
        'project_mid_level',
        'project_completed',
        'final_payment_required',
        'payment_released',
        'project_cancelled',
        'new_message',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    escrowProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowProject' },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notifications' }
);

export default mongoose.model('Notification', notificationSchema);
