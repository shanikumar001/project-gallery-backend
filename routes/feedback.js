import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Feedback from '../models/Feedback.js';
import User from '../models/User.js';

const router = express.Router();

// Get all approved feedbacks with user info, sorted by rating and date
router.get('/', async (req, res) => {
  try {
    const { limit = 10, minRating = 4 } = req.query;
    
    const feedbacks = await Feedback.find({ isApproved: true })
      .sort({ rating: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name username profilePhoto')
      .lean();

    // Filter by minimum rating if provided
    const filteredFeedbacks = minRating 
      ? feedbacks.filter(f => f.rating >= parseInt(minRating))
      : feedbacks;

    const formatted = filteredFeedbacks.map((f) => ({
      id: f._id.toString(),
      rating: f.rating,
      comment: f.comment,
      createdAt: f.createdAt,
      user: f.userId ? {
        id: f.userId._id.toString(),
        name: f.userId.name,
        username: f.userId.username,
        profilePhoto: f.userId.profilePhoto,
      } : null,
    }));

    // Calculate average rating
    const avgRating = feedbacks.length > 0
      ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
      : 0;

    res.json({
      feedbacks: formatted,
      averageRating: Math.round(avgRating * 10) / 10,
      totalCount: feedbacks.length,
    });
  } catch (err) {
    console.error('Get feedbacks error:', err);
    res.status(500).json({ error: 'Failed to fetch feedbacks' });
  }
});

// Get popular feedbacks (high rating, recent)
router.get('/popular', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const feedbacks = await Feedback.find({ 
      isApproved: true,
      rating: { $gte: 4 } // 4 stars and above
    })
      .sort({ rating: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name username profilePhoto')
      .lean();

    const formatted = feedbacks.map((f) => ({
      id: f._id.toString(),
      rating: f.rating,
      comment: f.comment,
      createdAt: f.createdAt,
      user: f.userId ? {
        id: f.userId._id.toString(),
        name: f.userId.name,
        username: f.userId.username,
        profilePhoto: f.userId.profilePhoto,
      } : null,
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Get popular feedbacks error:', err);
    res.status(500).json({ error: 'Failed to fetch popular feedbacks' });
  }
});

// Create feedback (requires authentication)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check if user already submitted feedback
    const existingFeedback = await Feedback.findOne({ userId: req.user._id });
    if (existingFeedback) {
      // Update existing feedback
      existingFeedback.rating = rating;
      if (comment !== undefined) existingFeedback.comment = comment?.trim() || '';
      await existingFeedback.save();

      return res.json({
        id: existingFeedback._id.toString(),
        rating: existingFeedback.rating,
        comment: existingFeedback.comment,
        createdAt: existingFeedback.createdAt,
        message: 'Feedback updated successfully',
      });
    }

    // Create new feedback
    const feedback = await Feedback.create({
      userId: req.user._id,
      rating,
      comment: comment?.trim() || '',
    });

    res.status(201).json({
      id: feedback._id.toString(),
      rating: feedback.rating,
      comment: feedback.comment,
      createdAt: feedback.createdAt,
      message: 'Feedback submitted successfully',
    });
  } catch (err) {
    console.error('Create feedback error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit feedback' });
  }
});

// Get user's own feedback
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const feedback = await Feedback.findOne({ userId: req.user._id })
      .populate('userId', 'name username profilePhoto')
      .lean();

    if (!feedback) {
      return res.json(null);
    }

    res.json({
      id: feedback._id.toString(),
      rating: feedback.rating,
      comment: feedback.comment,
      createdAt: feedback.createdAt,
      user: feedback.userId ? {
        id: feedback.userId._id.toString(),
        name: feedback.userId.name,
        username: feedback.userId.username,
        profilePhoto: feedback.userId.profilePhoto,
      } : null,
    });
  } catch (err) {
    console.error('Get user feedback error:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

export default router;
