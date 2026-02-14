import express from 'express';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Heartbeat - call when user is active (e.g. every 2 min while on site)
router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { lastSeenAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if users are online (for batch)
router.post('/check', async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.json({});
    }
    const users = await User.find(
      { _id: { $in: userIds } },
      { _id: 1, lastSeenAt: 1 }
    ).lean();
    const now = Date.now();
    const result = {};
    users.forEach((u) => {
      const lastSeen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
      result[u._id.toString()] = now - lastSeen < ACTIVE_THRESHOLD_MS;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
