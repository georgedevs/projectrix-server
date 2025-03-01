// routes/feedbackRoutes.ts
import express from 'express';
import { 
  submitFeedback,
  getAllFeedback,
  getMyFeedback,
  getPublicFeedback,
  upvoteFeedback,
  updateFeedbackStatus
} from '../controller/feedbackController';
import { isAuthenticated } from '../middleware/auth';

const feedbackRouter = express.Router();

// Routes requiring authentication
feedbackRouter.post('/submit', isAuthenticated, submitFeedback);
feedbackRouter.get('/my-feedback', isAuthenticated, getMyFeedback);
feedbackRouter.post('/:feedbackId/upvote', isAuthenticated, upvoteFeedback);

// Admin routes
feedbackRouter.get('/admin/all', isAuthenticated, getAllFeedback);
feedbackRouter.patch('/admin/:feedbackId/status', isAuthenticated, updateFeedbackStatus);

// Public routes
feedbackRouter.get('/public', getPublicFeedback);

export default feedbackRouter;