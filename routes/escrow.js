import express from 'express';
import EscrowProject from '../models/EscrowProject.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import WorkerReview from '../models/WorkerReview.js';
import UserCard from '../models/UserCard.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendProjectOfferEmail } from '../services/email.js';
import { sendPushToUser } from '../services/push.js';

const router = express.Router();

async function createNotification(userId, type, title, message, escrowProjectId) {
  await Notification.create({
    userId,
    type,
    title,
    message,
    escrowProjectId: escrowProjectId || undefined,
  });
}

// Create project offer (client sends to worker)
router.post('/projects', authenticateToken, async (req, res) => {
  try {
    const { workerId, title, description, budget, deadline } = req.body;
    if (!workerId || !title?.trim() || !budget || budget <= 0 || !deadline) {
      return res.status(400).json({ error: 'workerId, title, budget, deadline required' });
    }

    const project = await EscrowProject.create({
      clientId: req.user._id,
      workerId,
      chatWithUserId: workerId,
      title: title.trim(),
      description: (description || '').trim(),
      budget: Number(budget),
      deadline: new Date(deadline),
      status: 'offer_sent',
    });

    await createNotification(
      workerId,
      'project_offer',
      'New Project Offer',
      `You received a project offer: "${title}" from ${req.user.name}`,
      project._id
    );

    const worker = await User.findById(workerId).select('email name').lean();
    if (worker?.email) {
      sendProjectOfferEmail({
        toEmail: worker.email,
        toName: worker.name,
        fromName: req.user.name,
        projectTitle: title.trim(),
        description: (description || '').trim(),
        budget: Number(budget),
        deadline: new Date(deadline),
        appUrl: process.env.FRONTEND_URL,
      }).catch((err) => console.error('Project offer email failed:', err.message));
    }

    sendPushToUser(workerId, {
      title: 'New project offer',
      body: `${req.user.name} sent you a project offer: "${title.trim()}"`,
      data: { type: 'project_offer', projectId: project._id.toString(), fromUserId: req.user._id.toString() },
    }).catch((err) => console.error('Push (project offer) failed:', err?.message));

    res.status(201).json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker accept - set timeline and cost
router.post('/projects/:id/accept', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (project.status !== 'offer_sent') {
      return res.status(400).json({ error: 'Project already processed' });
    }

    const { agreedBudget, agreedDeadline, agreedTimeline } = req.body;
    const budget = agreedBudget ?? project.budget;
    const deadline = agreedDeadline ?? project.deadline;

    project.agreedBudget = Number(budget);
    project.agreedDeadline = new Date(deadline);
    project.agreedTimeline = (agreedTimeline || '').trim();
    project.lockedAt = new Date();
    project.status = 'accepted';
    await project.save();

    await createNotification(
      project.clientId,
      'project_accepted',
      'Project Accepted',
      `Worker accepted your project "${project.title}". Advance payment (10%) required.`,
      project._id
    );

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker reject
router.post('/projects/:id/reject', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (project.status !== 'offer_sent') {
      return res.status(400).json({ error: 'Project already processed' });
    }

    project.status = 'rejected';
    await project.save();

    await createNotification(
      project.clientId,
      'project_rejected',
      'Project Rejected',
      `Worker declined your project offer "${project.title}"`,
      project._id
    );

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Client confirms and moves to pending_advance (optional - or go straight to payment)
// Advance payment (10%) - simulated for now, integrate Stripe/Razorpay later
router.post('/projects/:id/advance-payment', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id)
      .populate('clientId', 'name')
      .populate('workerId', 'name');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.clientId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!['accepted', 'pending_advance'].includes(project.status)) {
      return res.status(400).json({ error: 'Invalid status for advance payment' });
    }

    const total = project.agreedBudget || project.budget;
    const advanceAmount = Math.round(total * 0.1);

    // Simulate payment - in production use Stripe/Razorpay
    await Transaction.create({
      escrowProjectId: project._id,
      type: 'advance_payment',
      amount: advanceAmount,
      fromUserId: req.user._id,
      toUserId: null, // Escrow
      status: 'completed',
      paymentGatewayRef: `sim_${Date.now()}`,
      metadata: { description: '10% advance' },
    });

    project.advanceAmount = advanceAmount;
    project.advancePaidAt = new Date();
    project.status = 'in_progress';
    project.progressPercent = 50; // Mid-level after advance
    await project.save();

    await createNotification(
      project.workerId._id,
      'advance_paid',
      'Advance Payment Received',
      `Advance payment (10%) received for "${project.title}". Project is now In Progress.`,
      project._id
    );

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker update progress
router.patch('/projects/:id/progress', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { progressPercent, milestones } = req.body;
    if (progressPercent != null) {
      project.progressPercent = Math.min(100, Math.max(0, Number(progressPercent)));
    }
    if (Array.isArray(milestones)) {
      project.milestones = milestones;
    }
    await project.save();

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker mark as completed
router.post('/projects/:id/complete', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id)
      .populate('clientId', 'name');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.workerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!['in_progress', 'mid_level'].includes(project.status)) {
      return res.status(400).json({ error: 'Invalid status to complete' });
    }

    project.status = 'completed';
    project.progressPercent = 100;
    await project.save();

    await createNotification(
      project.clientId._id,
      'final_payment_required',
      'Project Completed',
      `Worker marked "${project.title}" as completed. Final payment (90%) required.`,
      project._id
    );

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Client pays final 90%
router.post('/projects/:id/final-payment', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id)
      .populate('workerId', 'name');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (project.status !== 'completed') {
      return res.status(400).json({ error: 'Project not completed yet' });
    }

    const total = project.agreedBudget || project.budget;
    const finalAmount = Math.round(total * 0.9);

    await Transaction.create({
      escrowProjectId: project._id,
      type: 'final_payment',
      amount: finalAmount,
      fromUserId: req.user._id,
      status: 'completed',
      paymentGatewayRef: `sim_${Date.now()}`,
      metadata: { description: '90% final payment' },
    });

    project.finalAmount = finalAmount;
    project.finalPaidAt = new Date();
    await project.save();

    await createNotification(
      project.workerId._id,
      'final_payment_required',
      'Final Payment Received',
      `Final payment received for "${project.title}". Awaiting your rating to release payment.`,
      project._id
    );

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Client submits rating - triggers payment release
router.post('/projects/:id/rate', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id)
      .populate('workerId', 'name');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (project.status !== 'completed' || !project.finalPaidAt) {
      return res.status(400).json({ error: 'Rate only after final payment' });
    }

    const { rating, review } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating 1-5 required' });
    }

    await WorkerReview.create({
      workerId: project.workerId._id,
      clientId: req.user._id,
      escrowProjectId: project._id,
      rating: Number(rating),
      review: (review || '').trim(),
    });

    project.rating = Number(rating);
    project.review = (review || '').trim();
    project.ratedAt = new Date();

    const total = project.agreedBudget || project.budget;
    const commissionPercent = project.platformCommissionPercent || 5;
    project.platformCommissionAmount = Math.round(total * (commissionPercent / 100));
    project.workerPayoutAmount = total - project.platformCommissionAmount;
    project.workerPayoutAt = new Date();
    project.status = 'completed_released';
    await project.save();

    await Transaction.create({
      escrowProjectId: project._id,
      type: 'platform_commission',
      amount: project.platformCommissionAmount,
      status: 'completed',
      metadata: { description: 'Platform commission' },
    });
    await Transaction.create({
      escrowProjectId: project._id,
      type: 'worker_payout',
      amount: project.workerPayoutAmount,
      toUserId: project.workerId._id,
      status: 'completed',
      metadata: { description: 'Payment released to worker' },
    });

    // Update worker's UserCard rating
    const card = await UserCard.findOne({ userId: project.workerId._id });
    if (card) {
      const reviews = await WorkerReview.find({ workerId: project.workerId._id });
      const sum = reviews.reduce((s, r) => s + r.rating, 0);
      card.rating = reviews.length ? sum / reviews.length : 0;
      card.ratingCount = reviews.length;
      await card.save();
    }

    await createNotification(
      project.workerId._id,
      'payment_released',
      'Payment Released',
      `Payment of ₹${project.workerPayoutAmount} released for "${project.title}"`,
      project._id
    );

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my transactions (payment history)
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const me = req.user._id;
    const txns = await Transaction.find({
      $or: [{ fromUserId: me }, { toUserId: me }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('escrowProjectId', 'title')
      .populate('fromUserId', 'name')
      .populate('toUserId', 'name')
      .lean();

    const formatted = txns.map((t) => ({
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      currency: t.currency || 'INR',
      status: t.status,
      projectTitle: t.escrowProjectId?.title,
      projectId: t.escrowProjectId?._id?.toString(),
      fromUser: t.fromUserId ? { id: t.fromUserId._id.toString(), name: t.fromUserId.name } : null,
      toUser: t.toUserId ? { id: t.toUserId._id.toString(), name: t.toUserId.name } : null,
      createdAt: t.createdAt,
      metadata: t.metadata,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get project by chat participant (for chat page)
router.get('/projects/chat/:withUserId', authenticateToken, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const withId = req.params.withUserId;

    const projects = await EscrowProject.find({
      $or: [
        { clientId: me, workerId: withId },
        { clientId: withId, workerId: me },
      ],
      status: { $nin: ['rejected', 'cancelled'] },
    })
      .sort({ createdAt: -1 })
      .populate('clientId', 'name')
      .populate('workerId', 'name')
      .lean();

    res.json(projects.map(formatProjectLean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project
router.get('/projects/:id', authenticateToken, async (req, res) => {
  try {
    const project = await EscrowProject.findById(req.params.id)
      .populate('clientId', 'name')
      .populate('workerId', 'name');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const me = req.user._id.toString();
    const isClient = project.clientId._id.toString() === me;
    const isWorker = project.workerId._id.toString() === me;
    if (!isClient && !isWorker) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(formatProject(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my projects (all)
router.get('/projects', authenticateToken, async (req, res) => {
  try {
    const projects = await EscrowProject.find({
      $or: [{ clientId: req.user._id }, { workerId: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .populate('clientId', 'name')
      .populate('workerId', 'name')
      .lean();

    res.json(projects.map(formatProjectLean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatProject(p) {
  const client = p.clientId?.toObject ? p.clientId.toObject() : p.clientId;
  const worker = p.workerId?.toObject ? p.workerId.toObject() : p.workerId;
  return {
    id: p._id.toString(),
    clientId: client?._id?.toString() || p.clientId?.toString(),
    workerId: worker?._id?.toString() || p.workerId?.toString(),
    clientName: client?.name,
    workerName: worker?.name,
    title: p.title,
    description: p.description,
    budget: p.budget,
    deadline: p.deadline,
    agreedBudget: p.agreedBudget,
    agreedDeadline: p.agreedDeadline,
    agreedTimeline: p.agreedTimeline,
    status: p.status,
    progressPercent: p.progressPercent,
    milestones: p.milestones || [],
    advancePaidAt: p.advancePaidAt,
    advanceAmount: p.advanceAmount,
    finalPaidAt: p.finalPaidAt,
    finalAmount: p.finalAmount,
    platformCommissionAmount: p.platformCommissionAmount,
    workerPayoutAmount: p.workerPayoutAmount,
    rating: p.rating,
    review: p.review,
    ratedAt: p.ratedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function formatProjectLean(p) {
  return formatProject(p);
}

export default router;
