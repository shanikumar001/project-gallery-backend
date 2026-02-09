import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '../cloudinary.js';

import { authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import FollowRequest from '../models/FollowRequest.js';
import { sendFollowRequestEmail } from '../services/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// const AVATARS_DIR = path.join(__dirname, '../uploads/avatars');
// if (!fs.existsSync(AVATARS_DIR)) {
//   fs.mkdirSync(AVATARS_DIR, { recursive: true });
// }

// const avatarStorage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, AVATARS_DIR),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname) || '.jpg';
//     cb(null, `avatar-${uuidv4()}${ext}`);
//   },
// });

 const uploadAvatar = multer({
  storage: multer.memoryStorage(), // ✅ correct
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image type'));
  },
});


// cloudinary :
const uploadAvatarToCloudinary = async (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'avatars',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(buffer);
  });
};


// Get current user profile - must be before /:id
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('followers', 'name profilePhoto')
      .populate('following', 'name profilePhoto');
    const projectCount = await Project.countDocuments({ userId: req.user._id });
    const obj = user.toObject();
    res.json({
      ...obj,
      id: user._id.toString(),
      username: obj.username || (obj.email && obj.email.split('@')[0]) || '',
      bio: obj.bio || '',
      followerCount: user.followers?.length || 0,
      followingCount: user.following?.length || 0,
      projectCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my connections (for chat list) - must be before /:id
router.get('/connections/list', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('connections', 'name profilePhoto')
      .select('connections')
      .lean();
    const list = (user.connections || []).map((c) => ({
      id: c._id.toString(),
      name: c.name,
      profilePhoto: c.profilePhoto,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user profile by ID or username (public)
router.get('/:id', async (req, res) => {
  try {
    const param = req.params.id;
    const isMongoId = /^[a-fA-F0-9]{24}$/.test(param);
    let user = null;
    if (isMongoId) {
      user = await User.findById(param)
        .select('name username profilePhoto bio')
        .populate('followers', 'name profilePhoto')
        .populate('following', 'name profilePhoto');
    }
    if (!user) {
      user = await User.findOne({ username: param.toLowerCase().trim() })
        .select('name username profilePhoto bio')
        .populate('followers', 'name profilePhoto')
        .populate('following', 'name profilePhoto');
    }
    if (!user) return res.status(404).json({ error: 'User not found' });

    const projects = await Project.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = projects.map((p) => ({
      id: p._id.toString(),
      title: p.title,
      description: p.description,
      media: p.media,
      liveDemoUrl: p.liveDemoUrl || '',
      codeUrl: p.codeUrl || '',
      likeCount: p.likes?.length || 0,
      commentCount: p.comments?.length || 0,
      comments: p.comments || [],
      likes: p.likes?.map((id) => id.toString()) || [],
      savedBy: p.savedBy?.map((id) => id.toString()) || [],
    }));

    res.json({
      id: user._id.toString(),
      name: user.name,
      username: user.username || (user.email && user.email.split('@')[0]) || '',
      profilePhoto: user.profilePhoto,
      bio: user.bio || '',
      followerCount: user.followers?.length || 0,
      followingCount: user.following?.length || 0,
      projects: formatted,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile (name, username, bio, photo)
router.put(
  '/me',
  authenticateToken,
  uploadAvatar.single('profilePhoto'),
  async (req, res) => {
    try {
      const updates = {};

      if (req.body.name?.trim() !== undefined)
        updates.name = req.body.name.trim();

      if (req.body.bio !== undefined)
        updates.bio = (req.body.bio || '').trim().slice(0, 500);

      if (req.file) {
        const result = await uploadAvatarToCloudinary(req.file.buffer);
        updates.profilePhoto = result.secure_url;
      }

      // username validation (unchanged)
      const usernameRaw = req.body.username?.trim()?.toLowerCase();
      if (usernameRaw) {
        if (usernameRaw.length < 3) {
          return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }
        if (!/^[a-z0-9_.]+$/.test(usernameRaw)) {
          return res.status(400).json({
            error: 'Username can only contain letters, numbers, dots and underscores',
          });
        }
        const existing = await User.findOne({
          username: usernameRaw,
          _id: { $ne: req.user._id },
        });
        if (existing) {
          return res.status(400).json({ error: 'Username already taken' });
        }
        updates.username = usernameRaw;
      }

      const user = await User.findByIdAndUpdate(req.user._id, updates, {
        new: true,
        runValidators: true,
      }).select('-password');

      res.json({
        user: {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          email: user.email,
          profilePhoto: user.profilePhoto,
          bio: user.bio || '',
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// Follow request (Instagram-style: creates "requested" until accepted)
router.post('/:id/follow', authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const target = await User.findById(targetId).select('name email');
    if (!target) return res.status(404).json({ error: 'User not found' });

    const existing = await FollowRequest.findOne({
      fromUserId: req.user._id,
      toUserId: targetId,
      status: 'pending',
    });
    if (existing) {
      return res.json({ success: true, requested: true });
    }

    const alreadyFollowing = await User.findOne({
      _id: req.user._id,
      following: targetId,
    });
    if (alreadyFollowing) {
      return res.json({ success: true, following: true });
    }

    await FollowRequest.create({
      fromUserId: req.user._id,
      toUserId: targetId,
      status: 'pending',
    });

    await sendFollowRequestEmail({
      toEmail: target.email,
      toName: target.name,
      fromName: req.user.name,
    });

    res.json({ success: true, requested: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unfollow user (or cancel pending request)
router.delete('/:id/follow', authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    await FollowRequest.findOneAndDelete({
      fromUserId: req.user._id,
      toUserId: targetId,
      status: 'pending',
    });
    await User.findByIdAndUpdate(req.user._id, { $pull: { following: targetId } });
    await User.findByIdAndUpdate(targetId, { $pull: { followers: req.user._id } });
    res.json({ success: true, following: false, requested: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my pending follow requests (for profile / notifications)
router.get('/me/follow-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await FollowRequest.find({ toUserId: req.user._id, status: 'pending' })
      .populate('fromUserId', 'name profilePhoto')
      .sort({ createdAt: -1 })
      .lean();
    const formatted = requests.map((r) => ({
      id: r._id.toString(),
      fromUser: {
        id: r.fromUserId._id.toString(),
        name: r.fromUserId.name,
        profilePhoto: r.fromUserId.profilePhoto,
      },
      createdAt: r.createdAt,
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept follow request
router.post('/follow-requests/:id/accept', authenticateToken, async (req, res) => {
  try {
    const request = await FollowRequest.findOne({
      _id: req.params.id,
      toUserId: req.user._id,
      status: 'pending',
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    await FollowRequest.findByIdAndUpdate(req.params.id, { status: 'accepted' });
    await User.findByIdAndUpdate(request.fromUserId, { $addToSet: { following: req.user._id } });
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { followers: request.fromUserId } });

    res.json({ success: true, following: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decline follow request
router.post('/follow-requests/:id/decline', authenticateToken, async (req, res) => {
  try {
    const request = await FollowRequest.findOne({
      _id: req.params.id,
      toUserId: req.user._id,
      status: 'pending',
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    await FollowRequest.findByIdAndUpdate(req.params.id, { status: 'declined' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's followers list (for profile view)
router.get('/:id/followers', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('followers')
      .populate('followers', 'name profilePhoto')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const list = (user.followers || []).map((f) => ({
      id: f._id.toString(),
      name: f.name,
      profilePhoto: f.profilePhoto,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's following list (for profile view)
router.get('/:id/following', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('following')
      .populate('following', 'name profilePhoto')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const list = (user.following || []).map((f) => ({
      id: f._id.toString(),
      name: f.name,
      profilePhoto: f.profilePhoto,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect with user (both ways - can message each other)
router.post('/:id/connect', authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot connect with yourself' });
    }

    const target = await User.findById(targetId).select('name profilePhoto');
    if (!target) return res.status(404).json({ error: 'User not found' });

    await User.findByIdAndUpdate(req.user._id, { $addToSet: { connections: targetId } });
    await User.findByIdAndUpdate(targetId, { $addToSet: { connections: req.user._id } });

    res.json({
      success: true,
      connected: true,
      user: { id: target._id.toString(), name: target.name, profilePhoto: target.profilePhoto },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if connected with user
router.get('/:id/connected', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('connections').lean();
    const connected = (user.connections || []).some((id) => id.toString() === req.params.id);
    res.json({ connected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if current user follows or has requested this user (for Follow button state)
router.get('/:id/follow-status', authenticateToken, async (req, res) => {
  try {
    const me = req.user._id;
    const otherId = req.params.id;
    const meUser = await User.findById(me).select('following').lean();
    const following = (meUser.following || []).some((id) => id.toString() === otherId);
    const pendingRequest = await FollowRequest.findOne({
      fromUserId: me,
      toUserId: otherId,
      status: 'pending',
    });
    res.json({ following, requested: !!pendingRequest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
