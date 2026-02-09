import mongoose from 'mongoose';

/* ---------------- Profile Photo ---------------- */
const profilePhotoSchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    filename: { type: String, default: '' },
  },
  { _id: false }
);

/* ---------------- Location ---------------- */
const locationSchema = new mongoose.Schema(
  {
    address: { type: String, default: '' }, // City, State, Country
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
  },
  { _id: false }
);

/* ---------------- User Card ---------------- */
const userCardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one card per user
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    passion: {
      type: String,
      trim: true,
      default: '',
    },

    education: {
      type: String,
      trim: true,
      default: '',
    },

    skills: {
      type: [String],
      required: true,
      default: [],
    },

    location: locationSchema,

    portfolioUrl: {
      type: String,
      default: '',
    },

    projectDemoUrl: {
      type: String,
      default: '',
    },

    profilePhoto: profilePhotoSchema,

    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'user_card',
  }
);

/* ---------------- JSON Transform ---------------- */
userCardSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('UserCard', userCardSchema);
