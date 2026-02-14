import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    email: { type: String, sparse: true, lowercase: true, trim: true },
    phone: { type: String, sparse: true, trim: true },
    password: { type: String, minlength: 6, default: null },
    profilePhoto: { type: String, default: null },
    bio: { type: String, default: '', trim: true, maxlength: 500 },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    googleId: { type: String, default: null, sparse: true },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, collection: 'project_user' }
);

// Ensure at least email or phone is provided (skip for Google OAuth users)
userSchema.pre('validate', function(next) {
  // Skip validation for Google OAuth users (they have googleId)
  if (this.googleId) {
    return next();
  }
  if (!this.email && !this.phone) {
    return next(new Error('Either email or phone number is required'));
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
