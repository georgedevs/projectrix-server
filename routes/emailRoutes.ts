// routes/emailRoutes.ts
import express from 'express';
import { 
  sendTestEmail,
  sendNewsletterToAllUsers,
  unsubscribeFromNewsletter,
  updateNewsletterPreference,
  getNewsletterPreference
} from '../controller/emailController';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';

const emailRouter = express.Router();

// Public routes
emailRouter.get('/email/unsubscribe', unsubscribeFromNewsletter);

// Authenticated user routes
emailRouter.get('/email/preferences', isAuthenticated, getNewsletterPreference);
emailRouter.post('/email/preferences', isAuthenticated, updateNewsletterPreference);

// Admin only routes
emailRouter.post('/email/test', isAuthenticated, isAdmin, sendTestEmail);
emailRouter.post('/email/send-newsletter', isAuthenticated, isAdmin, sendNewsletterToAllUsers);

export default emailRouter;