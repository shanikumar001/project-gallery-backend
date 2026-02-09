import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendNewMessageEmail } from '../services/email.js';

const router = express.Router();

// Get conversations list (anyone you've chatted with) with last message and unread count
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const me = req.user._id;
    const messages = await Message.find({
      $or: [{ senderId: me }, { receiverId: me }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const byOther = new Map();
    for (const m of messages) {
      const otherId = m.senderId.toString() === me.toString() ? m.receiverId.toString() : m.senderId.toString();
      if (!byOther.has(otherId)) {
        byOther.set(otherId, { lastMessage: m, unreadCount: 0 });
      }
      const entry = byOther.get(otherId);
      if (m.receiverId.toString() === me.toString() && !m.read) {
        entry.unreadCount += 1;
      }
    }

    const userIds = [...byOther.keys()];
    const users = await User.find({ _id: { $in: userIds } })
      .select('name profilePhoto')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const list = userIds.map((uid) => {
      const { lastMessage, unreadCount } = byOther.get(uid);
      const u = userMap.get(uid) || {};
      return {
        id: uid,
        name: u.name || 'Unknown',
        profilePhoto: u.profilePhoto,
        lastMessage: lastMessage
          ? {
              text: lastMessage.text,
              createdAt: lastMessage.createdAt,
              isMe: lastMessage.senderId.toString() === me.toString(),
            }
          : null,
        unreadCount,
      };
    });

    list.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || 0;
      const bTime = b.lastMessage?.createdAt || 0;
      return new Date(bTime) - new Date(aTime);
    });

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unread count (total)
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user._id,
      read: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark messages as read (conversation with userId)
router.post('/read', authenticateToken, async (req, res) => {
  try {
    const { with: withUserId } = req.body;
    if (!withUserId) return res.status(400).json({ error: 'with (userId) required' });

    await Message.updateMany(
      {
        senderId: withUserId,
        receiverId: req.user._id,
        read: false,
      },
      { read: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages between current user and another user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const withUserId = req.query.with;
    if (!withUserId) {
      return res.status(400).json({ error: 'Query param "with" (userId) required' });
    }

    const me = req.user._id;
    const other = new mongoose.Types.ObjectId(withUserId);

    const messages = await Message.find({
      $or: [
        { senderId: me, receiverId: other },
        { senderId: other, receiverId: me },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    const meStr = me.toString();
    const formatted = messages.map((m) => ({
      id: m._id.toString(),
      senderId: m.senderId.toString(),
      receiverId: m.receiverId.toString(),
      text: m.text,
      read: m.read,
      createdAt: m.createdAt,
      isMe: m.senderId.toString() === meStr,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message (anyone can message anyone)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { toUserId, text } = req.body;
    if (!toUserId || !text?.trim()) {
      return res.status(400).json({ error: 'toUserId and text required' });
    }

    const me = req.user._id;
    const receiver = await User.findById(toUserId).select('name email');
    if (!receiver) return res.status(404).json({ error: 'User not found' });

    const message = await Message.create({
      senderId: me,
      receiverId: toUserId,
      text: text.trim(),
    });

    sendNewMessageEmail({
      toEmail: receiver.email,
      toName: receiver.name,
      fromName: req.user.name,
      messagePreview: text.trim().slice(0, 100) + (text.trim().length > 100 ? '...' : ''),
    }).catch(() => {});

    res.status(201).json({
      id: message._id.toString(),
      senderId: message.senderId.toString(),
      receiverId: message.receiverId.toString(),
      text: message.text,
      read: message.read,
      createdAt: message.createdAt,
      isMe: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
