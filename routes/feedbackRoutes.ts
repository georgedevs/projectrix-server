import express from 'express';
import { 
  submitFeedback,
  getMyFeedback,
  getPublicFeedback,
  upvoteFeedback,
  getAllFeedback,
  updateFeedbackStatus
} from '../controller/feedbackController';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';

const feedbackRouter = express.Router();

// Public routes
feedbackRouter.get('/feedback/public', getPublicFeedback);

// Authenticated user routes
feedbackRouter.post('/feedback/submit', isAuthenticated, submitFeedback);
feedbackRouter.get('/feedback/my-feedback', isAuthenticated, getMyFeedback);
feedbackRouter.post('/feedback/:feedbackId/upvote', isAuthenticated, upvoteFeedback);

// Admin only routes
feedbackRouter.get('/feedback/admin/all', isAuthenticated, isAdmin, getAllFeedback);
feedbackRouter.patch('/feedback/admin/:feedbackId/status', isAuthenticated, isAdmin, updateFeedbackStatus);

export default feedbackRouter;