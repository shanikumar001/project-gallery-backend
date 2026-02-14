import mongoose from 'mongoose';

const workerReviewSchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    escrowProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowProject', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: '' },
  },
  { timestamps: true, collection: 'worker_reviews' }
);

export default mongoose.model('WorkerReview', workerReviewSchema);
