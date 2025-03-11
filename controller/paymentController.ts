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
  getPricingForLocation,
  updateUserSubscription,
  addPaymentToHistory
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
    

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('Stripe webhook secret missing in environment variables');
      return res.status(500).json({ success: false, message: 'Webhook secret not configured' });
    }
    
    console.log('Constructing Stripe event with secret ending with:', webhookSecret.substring(webhookSecret.length - 4));
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Error constructing event:', err.message);
      return res.status(400).json({ success: false, message: `Webhook signature verification failed: ${err.message}` });
    }
    
    console.log('Successfully constructed event:', event.type);
    res.status(200).json({ received: true });
    
    // Process the event asynchronously
    (async () => {
      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            console.log('Processing checkout.session.completed event');
            const session = event.data.object as Stripe.Checkout.Session;
            
            // Get user ID from metadata
            let userId = session.metadata?.userId;
            
            // If userId isn't in metadata, try to get it from the customer
            if (!userId && session.customer) {
              try {
                const customer = await stripe.customers.retrieve(session.customer as string);
                if (customer && !customer.deleted && customer.metadata?.userId) {
                  userId = customer.metadata.userId;
                }
              } catch (customerErr) {
                console.error('Error retrieving customer:', customerErr);
              }
            }
            
            console.log('Found userId:', userId);
            
            if (userId) {
              try {
                // Update user subscription
                await updateUserSubscription(userId, session.id, 'stripe');
                console.log(`User ${userId} upgraded to Pro plan via Stripe Checkout`);
              } catch (updateErr) {
                console.error('Error updating subscription:', updateErr);
              }
            } else {
              console.error('Missing userId in session metadata and customer metadata');
            }
            break;
          }
            
          case 'invoice.payment_succeeded': {
            console.log('Processing invoice.payment_succeeded event');
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.subscription) {
              try {
                // Get the subscription
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
                
                // Get user ID from metadata
                let userId = subscription.metadata?.userId;
                
                // If userId isn't in metadata, try to get it from the customer
                if (!userId && subscription.customer) {
                  try {
                    const customer = await stripe.customers.retrieve(subscription.customer as string);
                    if (customer && !customer.deleted && customer.metadata?.userId) {
                      userId = customer.metadata.userId;
                    }
                  } catch (customerErr) {
                    console.error('Error retrieving customer:', customerErr);
                  }
                }
                
                console.log('Found userId for invoice:', userId);
                
                if (userId) {
                  // Add payment to history
                  await addPaymentToHistory(
                    userId,
                    invoice.amount_paid / 100, // Convert from cents to dollars
                    invoice.currency.toUpperCase(),
                    invoice.id,
                    'stripe',
                    'successful'
                  );
                  
                  // Update user subscription
                  await updateUserSubscription(userId);
                  console.log(`Payment succeeded for user ${userId}`);
                } else {
                  console.error('Missing userId in subscription metadata and customer metadata');
                }
              } catch (err) {
                console.error('Error processing invoice.payment_succeeded:', err);
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error processing webhook event:', err);
      }
    })();
    
  } catch (error) {
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
    
    // First check the user's plan in the User model
    const user = await User.findById(userId).select('plan planExpiryDate');
    
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    
    // Get subscription information from the Subscription model
    const subscription = await Subscription.findOne({ userId });
    
    // If user is Pro but no subscription record exists, create one
    if (user.plan === 'pro' && !subscription) {
      const endDate = user.planExpiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      // Create a new subscription record
      const newSubscription = await Subscription.create({
        userId,
        status: 'active',
        plan: 'pro',
        startDate: new Date(),
        endDate,
        renewalDate: endDate,
        provider: {
          name: 'stripe' // Default provider
        }
      });
      
      return res.status(200).json({
        success: true,
        status: 'active',
        plan: 'pro',
        endDate,
        renewalDate: endDate
      });
    }
    
    // If no subscription and user is not pro
    if (!subscription && user.plan !== 'pro') {
      return res.status(200).json({
        success: true,
        status: 'none',
        plan: 'free'
      });
    }
    
    // Validate subscription status against user plan
    if (subscription && user.plan !== subscription.plan) {
      // Update subscription to match user plan
      subscription.plan = user.plan;
      await subscription.save();
    }
    
    res.status(200).json({
      success: true,
      status: subscription.status,
      plan: user.plan, // Use user.plan as the source of truth
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

