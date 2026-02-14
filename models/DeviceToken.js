import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web', 'windows', 'mac'],
      default: 'web',
    },
  },
  { timestamps: true, collection: 'device_tokens' }
);

// One token per device; same token can be re-registered (upsert by userId + token)
deviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
deviceTokenSchema.index({ userId: 1 });

export default mongoose.model('DeviceToken', deviceTokenSchema);
