import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isApproved: {
      type: Boolean,
      default: true, // Auto-approve for now, can be changed to false for moderation
    },
  },
  { timestamps: true, collection: 'feedback' }
);

// Index for efficient queries
feedbackSchema.index({ rating: -1, createdAt: -1 });
feedbackSchema.index({ userId: 1 });
feedbackSchema.index({ isApproved: 1, rating: -1 });

// Virtual for average rating (can be calculated)
feedbackSchema.virtual('averageRating').get(function() {
  // This would need to be calculated via aggregation
  return null;
});

feedbackSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Feedback', feedbackSchema);
