import express from 'express';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Like project
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { likes: req.user._id } },
      { new: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      liked: true,
      likeCount: project.likes?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlike project
router.delete('/:id/like', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $pull: { likes: req.user._id } },
      { new: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      liked: false,
      likeCount: project.likes?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Comment text required' });

    const comment = {
      userId: req.user._id,
      userName: req.user.name,
      text: text.trim(),
    };

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: comment } },
      { new: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const added = project.comments[project.comments.length - 1];
    res.status(201).json({
      comment: {
        id: added._id,
        userId: added.userId,
        userName: added.userName,
        text: added.text,
        createdAt: added.createdAt,
      },
      commentCount: project.comments?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save project
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { savedBy: req.user._id } },
      { new: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unsave project
router.delete('/:id/save', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $pull: { savedBy: req.user._id } },
      { new: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ saved: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only delete your own projects' });
    }
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
