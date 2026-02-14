import express from 'express';
import Notification from '../models/Notification.js';
import DeviceToken from '../models/DeviceToken.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register device for push notifications (Android, iOS, Web, Windows, Mac)
router.post('/register-device', authenticateToken, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'token (FCM device token) is required' });
    }
    const normalized = token.trim();
    const plat = ['android', 'ios', 'web', 'windows', 'mac'].includes(platform) ? platform : 'web';
    await DeviceToken.findOneAndUpdate(
      { userId: req.user._id, token: normalized },
      { $set: { platform: plat, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unregister device (e.g. on logout)
router.post('/unregister-device', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (token && typeof token === 'string') {
      await DeviceToken.deleteOne({ userId: req.user._id, token: token.trim() });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(notifications.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      message: n.message,
      escrowProjectId: n.escrowProjectId?.toString(),
      read: n.read,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
