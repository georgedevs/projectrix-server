// routes/paymentRoutes.ts
import express from 'express';
import { 
  getPricing,
  createPaymentSession,
  verifyPayment,
  stripeWebhook,
  manualUpgrade,
  getSubscriptionStatus,
  cancelSubscription,
  getPaymentHistory
} from '../controller/paymentController';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';

const paymentRouter = express.Router();

// Public endpoint to get pricing based on location
paymentRouter.get('/pricing', getPricing);


// Authenticated routes
paymentRouter.post('/create-payment', isAuthenticated, createPaymentSession);
paymentRouter.post('/verify-payment', isAuthenticated, verifyPayment);
paymentRouter.get('/subscription', isAuthenticated, getSubscriptionStatus);
paymentRouter.post('/cancel', isAuthenticated, cancelSubscription);
paymentRouter.get('/payment-history', isAuthenticated, getPaymentHistory);

// Admin routes
paymentRouter.post('/manual-upgrade', isAuthenticated, isAdmin, manualUpgrade);



export default paymentRouter;