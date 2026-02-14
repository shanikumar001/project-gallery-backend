import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from './cloudinary.js';

import passport from 'passport';
import authRoutes, { initPassport } from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import messageRoutes from './routes/messages.js';
import { authenticateToken } from './middleware/auth.js';
import Project from './models/Project.js';
import User from './models/User.js';
import locationRoutes from './routes/location.js';
import UserCard from './models/UserCard.js';
import feedbackRoutes from './routes/feedback.js';
import presenceRoutes from './routes/presence.js';
import escrowRoutes from './routes/escrow.js';
import notificationRoutes from './routes/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// MongoDB connection with better error handling
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Please check your MONGODB_URI in .env file');
    process.exit(1);
  });

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || getExtensionFromMimetype(file.mimetype);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

function getExtensionFromMimetype(mimetype) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return map[mimetype] || '.bin';
}

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: JPEG, PNG, WebP, MP4, WebM'));
    }
  },
});

initPassport();
const frontendUrl = process.env.FRONTEND_URL;
// ? frontendUrl.split(',').map((u) => u.trim()).filter(Boolean) : true
app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(passport.initialize());

// cloudinary :
const uploadOnCloudinary = async (localFilePath) => {
  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    fs.unlinkSync(localFilePath);
    // console.log(result);
    return result;
    
  } catch (err) {
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    return null;
  }
};

app.post("/api/media", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadOnCloudinary(req.file.path);

    if (!result) {
      return res.status(500).json({ message: "Upload failed" });
    }

    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Serve uploaded media files
// app.use('/api/media', express.static(UPLOADS_DIR));

// Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Get all projects (public - no auth required)
app.get('/api/projects', async (req, res) => {
  try {
    const { sort, lat, lon } = req.query;
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const hasLocation = !isNaN(userLat) && !isNaN(userLon);

    let projects = await Project.find()
      .sort(sort === 'popular' ? { order: 1 } : { order: 1, createdAt: -1 })
      .populate('userId', 'name username profilePhoto')
      .lean();

    let formatted = projects.map((p) => ({
      id: p._id.toString(),
      title: p.title,
      description: p.description,
      media: p.media,
      order: p.order,
      createdAt: p.createdAt,
      liveDemoUrl: p.liveDemoUrl || '',
      codeUrl: p.codeUrl || '',
      likeCount: p.likes?.length || 0,
      commentCount: p.comments?.length || 0,
      comments: p.comments || [],
      likes: p.likes?.map((id) => id.toString()) || [],
      savedBy: p.savedBy?.map((id) => id.toString()) || [],
      user: p.userId
        ? { id: p.userId._id.toString(), name: p.userId.name, username: p.userId.username, profilePhoto: p.userId.profilePhoto }
        : null,
    }));

    // Sort by likes (popular) - already fetched, sort in memory
    if (sort === 'popular') {
      formatted.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    }

    // Sort by nearest (need creator location from UserCard)
    if (hasLocation && sort === 'nearby') {
      const userIds = [...new Set(formatted.map((p) => p.user?.id).filter(Boolean))];
      const userCards = await UserCard.find({ userId: { $in: userIds } }).select('userId location').lean();
      const locMap = new Map();
      userCards.forEach((uc) => {
        const coords = uc.location?.coordinates;
        if (coords && (coords.latitude != null || coords.longitude != null)) {
          locMap.set(uc.userId?.toString(), {
            lat: coords.latitude ?? coords.lat,
            lon: coords.longitude ?? coords.lng ?? coords.lon,
          });
        }
      });
      formatted = formatted.map((p) => {
        const loc = locMap.get(p.user?.id);
        let distance = Infinity;
        if (loc && loc.lat != null && loc.lon != null) {
          distance = haversineDistance(userLat, userLon, loc.lat, loc.lon);
        }
        return { ...p, _distance: distance };
      });
      formatted.sort((a, b) => a._distance - b._distance);
      formatted = formatted.map(({ _distance, ...p }) => p);
    }

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project (public)
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('userId', 'name username profilePhoto')
      .lean();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({
      id: project._id.toString(),
      ...project,
      likeCount: project.likes?.length || 0,
      commentCount: project.comments?.length || 0,
      user: project.userId
        ? { id: project.userId._id.toString(), name: project.userId.name, username: project.userId.username, profilePhoto: project.userId.profilePhoto }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});




// Add new project (requires authentication) - must be before projectRoutes
app.post('/api/projects', authenticateToken, upload.single('media'), async (req, res) => {
  try {
    const { title, description, liveDemoUrl, codeUrl } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!description?.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required' });
    }

    // 🔥 Upload project media to Cloudinary
    const uploadResult = await uploadOnCloudinary(req.file.path);

    if (!uploadResult) {
      return res.status(500).json({ error: 'Media upload failed' });
    }

    const count = await Project.countDocuments();

    const project = await Project.create({
      title: title.trim(),
      description: description.trim(),
      media: [{ url: uploadResult.secure_url }],
      order: count,
      userId: req.user._id,
      liveDemoUrl: liveDemoUrl?.trim() || '',
      codeUrl: codeUrl?.trim() || '',
    });

    res.status(201).json({
      id: project._id.toString(),
      title: project.title,
      description: project.description,
      media: project.media,
      order: project.order,
      createdAt: project.createdAt,
    });
    // console.log('OSM RAW RESPONSE:', data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



const uploadProfilePhoto = async (localFilePath) => {
  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      folder: "user_profiles",
      resource_type: "image",
      width: 400,
      height: 400,
      crop: "fill",
      quality: "auto",
      format: "webp",
    });

    fs.unlinkSync(localFilePath);
    return result;
  } catch (err) {
    console.error("Profile photo upload failed:", err);
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    return null;
  }
};


const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get current user's card (authenticated)
app.get("/api/user-card/me", authenticateToken, async (req, res) => {
  try {
    const card = await UserCard.findOne({ userId: req.user._id })
      .populate('userId', 'name username profilePhoto lastSeenAt')
      .lean();
    if (!card) return res.status(404).json({ error: 'No profile card found' });
    const lastSeen = card.userId?.lastSeenAt ? new Date(card.userId.lastSeenAt).getTime() : 0;
    const isOnline = Date.now() - lastSeen < ACTIVE_THRESHOLD_MS;
    res.json({
      id: card._id.toString(),
      fullName: card.fullName,
      username: card.username,
      passion: card.passion,
      education: card.education,
      skills: card.skills,
      profilePhoto: card.profilePhoto,
      location: card.location,
      portfolioUrl: card.portfolioUrl,
      projectDemoUrl: card.projectDemoUrl,
      order: card.order,
      createdAt: card.createdAt,
      rating: card.rating ?? 0,
      ratingCount: card.ratingCount ?? 0,
      isOnline: !!isOnline,
      lastSeenAt: card.userId?.lastSeenAt || null,
      user: card.userId ? { id: card.userId._id.toString(), name: card.userId.name, username: card.userId.username, profilePhoto: card.userId.profilePhoto } : null,
      userId: card.userId ? card.userId._id.toString() : null,
    });
  } catch (err) {
    console.error('Fetch my user card error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete current user's card
app.delete("/api/user-card", authenticateToken, async (req, res) => {
  try {
    const result = await UserCard.deleteOne({ userId: req.user._id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'No profile card found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user card error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user-card", async (req, res) => {
  try {
    const { passion, location, lat, lon, radiusKm, sort } = req.query;
    let query = {};

    if (passion?.trim()) {
      query.passion = { $regex: passion.trim(), $options: 'i' };
    }
    if (location?.trim()) {
      query['location.address'] = { $regex: location.trim(), $options: 'i' };
    }

    const sortObj = sort === 'rating' ? { rating: -1, ratingCount: -1, order: 1 } : { order: 1, createdAt: -1 };
    const cards = await UserCard.find(query)
      .sort(sortObj)
      .populate('userId', 'name username profilePhoto lastSeenAt')
      .select("fullName username passion skills profilePhoto location order createdAt education portfolioUrl projectDemoUrl userId rating ratingCount")
      .lean();

    let formatted = cards.map((card) => {
      const lastSeen = card.userId?.lastSeenAt ? new Date(card.userId.lastSeenAt).getTime() : 0;
      const isOnline = Date.now() - lastSeen < ACTIVE_THRESHOLD_MS;
      return {
        id: card._id.toString(),
        fullName: card.fullName,
        username: card.username,
        passion: card.passion,
        education: card.education,
        skills: card.skills,
        profilePhoto: card.profilePhoto,
        location: card.location,
        portfolioUrl: card.portfolioUrl,
        projectDemoUrl: card.projectDemoUrl,
        order: card.order,
        createdAt: card.createdAt,
        rating: card.rating ?? 0,
        ratingCount: card.ratingCount ?? 0,
        isOnline: !!isOnline,
        lastSeenAt: card.userId?.lastSeenAt || null,
        user: card.userId ? {
          id: card.userId._id.toString(),
          name: card.userId.name,
          username: card.userId.username,
          profilePhoto: card.userId.profilePhoto,
        } : null,
        userId: card.userId ? card.userId._id.toString() : null,
      };
    });

    // Filter by live location (lat, lon, radiusKm) if provided
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    const radius = parseFloat(radiusKm) || 50;
    if (!isNaN(userLat) && !isNaN(userLon)) {
      formatted = formatted.filter((c) => {
        const coords = c.location?.coordinates;
        if (!coords || (coords.latitude == null && coords.longitude == null)) return true;
        const lat2 = coords.latitude ?? coords.lat;
        const lon2 = coords.longitude ?? coords.lng ?? coords.lon;
        if (lat2 == null || lon2 == null) return true;
        const dist = haversineDistance(userLat, userLon, lat2, lon2);
        return dist <= radius;
      });
    }

    res.json(formatted);
  } catch (err) {
    console.error("Fetch user cards error:", err);
    res.status(500).json({ error: "Failed to fetch user cards" });
  }
});


// This is for user card :
app.post(
  "/api/user-card",
  authenticateToken,
  upload.single("profilePhoto"),
  async (req, res) => {
    try {
      const {
        fullName,
        username,
        passion,
        education,
        skills,
        location,
        portfolioUrl,
        projectDemoUrl,
        coordinates,
      } = req.body;

      const skillsArray = Array.isArray(skills)
        ? skills
        : skills?.split(",").map((s) => s.trim()).filter(Boolean);

      if (!skillsArray || skillsArray.length === 0) {
        return res.status(400).json({ error: "Skills are required" });
      }

      /* ---------- Parse coordinates ---------- */
      let parsedCoordinates;
      if (coordinates) {
        parsedCoordinates =
          typeof coordinates === "string"
            ? JSON.parse(coordinates)
            : coordinates;
      }

      /* ---------- Upload profile photo / sync from User ---------- */
      let profilePhoto;
      const userDoc = await User.findById(req.user._id).select('name username profilePhoto').lean();

      if (req.file) {
        const uploadResult = await uploadProfilePhoto(req.file.path);
        if (!uploadResult) {
          return res.status(500).json({ error: "Profile photo upload failed" });
        }
        profilePhoto = { url: uploadResult.secure_url, filename: uploadResult.public_id };
        await User.findByIdAndUpdate(req.user._id, { profilePhoto: uploadResult.secure_url });
      } else if (userDoc?.profilePhoto) {
        profilePhoto = typeof userDoc.profilePhoto === 'string'
          ? { url: userDoc.profilePhoto, filename: '' }
          : userDoc.profilePhoto;
      }

      /* ---------- Sync name/username: use User's if creating, else payload; update User ---------- */
      const trimmedName = fullName?.trim() || userDoc?.name || req.user.name || '';
      const trimmedUsername = username?.trim().toLowerCase() || userDoc?.username || req.user.username || '';
      if (!trimmedName || !trimmedUsername) {
        return res.status(400).json({ error: "Full name and username are required" });
      }

      await User.findByIdAndUpdate(req.user._id, {
        name: trimmedName,
        username: trimmedUsername,
      });

      /* ---------- Order handling ---------- */
      const existingCard = await UserCard.findOne({ userId: req.user._id });
      const order = existingCard ? existingCard.order : await UserCard.countDocuments();

      /* ---------- Payload ---------- */
      const payload = {
        userId: req.user._id,
        fullName: trimmedName,
        username: trimmedUsername,
        passion: passion?.trim() || "",
        education: education?.trim() || "",
        skills: skillsArray,
        portfolioUrl: portfolioUrl?.trim() || "",
        projectDemoUrl: projectDemoUrl?.trim() || "",
        order,
        location: {
          address: location || "",
          coordinates: parsedCoordinates,
        },
      };

      if (profilePhoto) {
        payload.profilePhoto = profilePhoto;
      }

      /* ---------- Create or Update (one card per user) ---------- */
      const userCard = await UserCard.findOneAndUpdate(
        { userId: req.user._id },
        payload,
        { new: true, upsert: true }
      ).populate('userId', 'name username profilePhoto');

      const updatedUser = await User.findById(req.user._id).select('name username profilePhoto').lean();
      /* ---------- Response ---------- */
      res.status(201).json({
        id: userCard._id.toString(),
        fullName: userCard.fullName,
        username: userCard.username,
        updatedUser: updatedUser ? {
          name: updatedUser.name,
          username: updatedUser.username,
          profilePhoto: updatedUser.profilePhoto,
        } : null,
        passion: userCard.passion,
        education: userCard.education,
        skills: userCard.skills,
        profilePhoto: userCard.profilePhoto,
        location: userCard.location,
        portfolioUrl: userCard.portfolioUrl,
        projectDemoUrl: userCard.projectDemoUrl,
        order: userCard.order,
        createdAt: userCard.createdAt,
        user: userCard.userId ? {
          id: userCard.userId._id.toString(),
          name: userCard.userId.name,
          username: userCard.userId.username,
          profilePhoto: userCard.userId.profilePhoto,
        } : null,
        userId: userCard.userId ? userCard.userId._id.toString() : null,
      });
    } catch (err) {
      console.error("User card error:", err);
      if (err.code === 11000) {
        return res.status(409).json({ error: "Username already exists" });
      }
      res.status(500).json({ error: err.message });
    }
  }
);



//location :
app.use('/api/location', locationRoutes);

// Feedback routes
app.use('/api/feedback', feedbackRoutes);

// Presence (online status)
app.use('/api/presence', presenceRoutes);

// Escrow projects & payments
app.use('/api/escrow', escrowRoutes);

// Notifications
app.use('/api/notifications', notificationRoutes);



// Project interactions (like, comment, save)
app.use('/api/projects', projectRoutes);

app.listen(PORT, () => {
  console.log(`ProWorkers API running at http://localhost:${PORT}`);
});
