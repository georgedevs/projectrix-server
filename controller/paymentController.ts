// controller/paymentController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import User from '../models/userModel';
import Subscription from '../models/subscription.model';
import { 
  createStripePaymentSession, 
  createFlutterwavePayment, 
  verifyFlutterwavePayment, 
  handleStripeWebhook,
  getPricingForLocation,
  updateUserSubscription
} from '../utils/paymentService';
import Stripe from 'stripe';

// Get pricing information based on user location
export const getPricing = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get country code from request
      const { countryCode } = req.query;
      
      if (!countryCode) {
        return next(new ErrorHandler("Country code is required", 400));
      }
      
      console.log(`Getting pricing for country: ${countryCode}`);
      
      // Get pricing for location
      const pricing = getPricingForLocation(countryCode as string);
      
      console.log(`Pricing returned: ${JSON.stringify(pricing)}`);
      
      res.status(200).json({
        success: true,
        pricing
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  });

// Create a payment session (Stripe or Flutterwave)
export const createPaymentSession = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
    
    const { paymentMethod, phoneNumber } = req.body;
    const userId = req.user._id;
    const email = req.user.email;
    const name = req.user.name;
    
    // Validate payment method
    if (!paymentMethod || !['stripe', 'flutterwave'].includes(paymentMethod)) {
      return next(new ErrorHandler("Invalid payment method", 400));
    }
    
    // Create payment based on method
    if (paymentMethod === 'stripe') {
      const session = await createStripePaymentSession(userId.toString(), email, name);
      
      res.status(200).json({
        success: true,
        session
      });
    } else {
      // For Flutterwave, validate phone number
      if (!phoneNumber && paymentMethod === 'flutterwave') {
        return next(new ErrorHandler("Phone number is required for Flutterwave payments", 400));
      }
      
      const payment = await createFlutterwavePayment(
        userId.toString(), 
        email, 
        name, 
        phoneNumber
      );
      
      res.status(200).json({
        success: true,
        payment
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Verify Flutterwave payment
export const verifyPayment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
    
    const { transactionId } = req.body;
    
    if (!transactionId) {
      return next(new ErrorHandler("Transaction ID is required", 400));
    }
    
    const result = await verifyFlutterwavePayment(transactionId);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: "Payment verified successfully"
      });
    } else {
      return next(new ErrorHandler("Payment verification failed", 400));
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Handle Stripe webhook
export const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  
  console.log('Received Stripe webhook', {
    signatureExists: !!signature,
    bodyLength: req.body?.length || 0
  });
  
  if (!signature) {
    console.error('Stripe webhook missing signature');
    return res.status(400).json({ success: false, message: 'Stripe signature missing' });
  }
  
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2025-02-24.acacia',
    });
    
    // Ensure the webhook secret is correctly set
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('Stripe webhook secret missing in environment variables');
      return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
    }
    
    console.log('Constructing Stripe event with secret ending with:', webhookSecret.substring(webhookSecret.length - 4));
    
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
    
    console.log('Successfully constructed event:', event.type);
    
    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      
      console.log('Checkout session completed for user:', userId);
      
      if (userId) {
        // Update user subscription
        await updateUserSubscription(userId, session.id, 'stripe');
        console.log(`User ${userId} upgraded to Pro plan via Stripe Checkout`);
      } else {
        console.error('Missing userId in session metadata');
      }
    }
    
    // Process other events as needed
    await handleStripeWebhook(event);
    
    console.log('Webhook processed successfully');
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Stripe webhook error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Handle manual upgrade (for testing or admin purposes)
export const manualUpgrade = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler("Not authorized", 403));
    }
    
    const { userId } = req.body;
    
    if (!userId) {
      return next(new ErrorHandler("User ID is required", 400));
    }
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    
    // Update user subscription
    await updateUserSubscription(userId);
    
    res.status(200).json({
      success: true,
      message: "User upgraded to Pro plan successfully"
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get subscription status
export const getSubscriptionStatus = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
    
    const userId = req.user._id;
    
    // Get subscription information
    const subscription = await Subscription.findOne({ userId });
    
    if (!subscription) {
      return res.status(200).json({
        success: true,
        status: 'none',
        plan: 'free'
      });
    }
    
    res.status(200).json({
      success: true,
      status: subscription.status,
      plan: subscription.plan,
      endDate: subscription.endDate,
      renewalDate: subscription.renewalDate
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Cancel subscription
export const cancelSubscription = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
    
    const userId = req.user._id;
    
    // Find subscription
    const subscription = await Subscription.findOne({ userId, status: 'active' });
    
    if (!subscription) {
      return next(new ErrorHandler("No active subscription found", 404));
    }
    
    // Handle based on provider
    if (subscription.provider.name === 'stripe' && subscription.provider.stripeSubscriptionId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
        apiVersion: '2025-02-24.acacia',
      });
      
      // Cancel at period end
      await stripe.subscriptions.update(subscription.provider.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      
      // Update subscription status
      subscription.status = 'cancelled';
      await subscription.save();
      
      res.status(200).json({
        success: true,
        message: "Subscription will be cancelled at the end of the billing period"
      });
    } else {
      // For Flutterwave or other providers, cancel immediately
      subscription.status = 'cancelled';
      await subscription.save();
      
      // Update user plan to free
      await User.findByIdAndUpdate(userId, { plan: 'free' });
      
      res.status(200).json({
        success: true,
        message: "Subscription cancelled successfully"
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get payment history
export const getPaymentHistory = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
    
    const userId = req.user._id;
    
    // Find subscription
    const subscription = await Subscription.findOne({ userId });
    
    if (!subscription) {
      // If no subscription found, return empty payment history
      return res.status(200).json({
        success: true,
        payments: []
      });
    }
    
    // Return payment history from subscription
    res.status(200).json({
      success: true,
      payments: subscription.paymentHistory || []
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});