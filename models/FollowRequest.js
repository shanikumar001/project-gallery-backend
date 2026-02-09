import mongoose from 'mongoose';

const followRequestSchema = new mongoose.Schema(
  {
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  },
  { timestamps: true, collection: 'follow_request' }
);

followRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
followRequestSchema.index({ toUserId: 1, status: 1 });

export default mongoose.model('FollowRequest', followRequestSchema);
