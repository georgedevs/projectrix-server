import Stripe from 'stripe';
import Flutterwave from 'flutterwave-node-v3';
import ErrorHandler from './ErrorHandler';
import User from '../models/userModel';
import Subscription from '../models/subscription.model';
import dotenv from 'dotenv';
import axios from 'axios';
import { redis } from './redis';

dotenv.config();

// Initialize payment providers with API keys
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2025-02-24.acacia',
  });

const flutterwave = new Flutterwave(
  process.env.FLUTTERWAVE_PUBLIC_KEY as string,
  process.env.FLUTTERWAVE_SECRET_KEY as string,
  process.env.FLUTTERWAVE_ENCRYPTION_KEY as string
);

// Supported currencies and their configuration
const PAYMENT_CONFIG = {
  USD: {
    provider: 'stripe',
    amount: 500, // $5.00 in cents
    symbol: '$',
    displayAmount: 5
  },
  NGN: {
    provider: 'flutterwave',
    amount: 500000, // 5000 NGN in kobo (smallest unit)
    symbol: '₦',
    displayAmount: 5000
  }
};

// Detect currency based on country
export const detectCurrencyFromCountryCode = (countryCode: string): 'USD' | 'NGN' => {
  // Nigeria uses NGN, all other countries use USD
  return countryCode === 'NG' ? 'NGN' : 'USD';
};

// Get payment configuration based on currency
export const getPaymentConfig = (currency: 'USD' | 'NGN') => {
  return PAYMENT_CONFIG[currency];
};

// Create a payment intent/session with Stripe
export async function createStripePaymentSession(
  userId: string,
  email: string,
  name: string
) {
  try {
    // Create a customer if not exists
    let customerId;
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          userId
        }
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID as string, // Monthly subscription price ID 
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      metadata: {
        userId
      }
    });

    return {
      id: session.id,
      url: session.url
    };
  } catch (error) {
    console.error('Stripe payment session error:', error);
    throw new ErrorHandler('Failed to create payment session', 500);
  }
}

// Create a payment link with Flutterwave
export async function createFlutterwavePayment(
  userId: string,
  email: string,
  name: string,
  phoneNumber: string = ''
) {
  try {
    // Generate a transaction reference
    const txRef = `projectrix-${Date.now()}-${userId}`;

    // Create a payment link 
    const paymentData = {
      tx_ref: txRef,
      amount: PAYMENT_CONFIG.NGN.amount / 100, // Convert from kobo to naira (5000)
      currency: 'NGN',
      redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
      customer: {
        email,
        name,
        phonenumber: phoneNumber
      },
      customizations: {
        title: 'Projectrix Pro Subscription',
        description: 'Monthly subscription to Projectrix Pro',
        logo: `${process.env.FRONTEND_URL}/logo.png`
      },
      meta: {
        userId
      }
    };

    // Use the standard endpoint to create a payment link
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    );

    if (response.data && response.data.status === 'success') {
      return {
        paymentLink: response.data.data.link,
        transactionRef: txRef
      };
    } else {
      throw new Error('Failed to create payment link');
    }
  } catch (error) {
    console.error('Flutterwave payment error:', error);
    throw new ErrorHandler('Failed to create payment link', 500);
  }
}

// Verify Flutterwave payment
export async function verifyFlutterwavePayment(transactionId: string) {
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    );
    
    if (response.data.status === 'success' && 
        response.data.data.status === 'successful') {
      // Extract userId from meta data or transaction reference
      const txRef = response.data.data.tx_ref;
      // The format should be projectrix-timestamp-userId
      const userId = txRef.split('-')[2];

      await addPaymentToHistory(
        userId,
        response.data.amount,
        response.data.currency,
        response.data.tx_ref,
        'flutterwave',
        'successful'
      );
      
      if (userId) {
        // Update user subscription
        await updateUserSubscription(userId, txRef, 'flutterwave');
        
        return {
          success: true,
          message: 'Payment verified successfully'
        };
      }
    }
    
    return {
      success: false,
      message: 'Payment verification failed'
    };
  } catch (error) {
    console.error('Flutterwave verification error:', error);
    throw new ErrorHandler('Failed to verify payment', 500);
  }
}

// Handle Stripe webhook events
export async function handleStripeWebhook(event: Stripe.Event) {
  try {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          // Get the subscription
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const { userId } = subscription.metadata;
          
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
        }
        break;
      
      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as Stripe.Invoice;
        if (failedInvoice.subscription) {
          // Get the subscription
          const subscription = await stripe.subscriptions.retrieve(failedInvoice.subscription as string);
          const { userId } = subscription.metadata;
          
          // Add failed payment to history
          await addPaymentToHistory(
            userId,
            failedInvoice.amount_due / 100, // Convert from cents to dollars
            failedInvoice.currency.toUpperCase(),
            failedInvoice.id,
            'stripe',
            'failed'
          );
        }
        break;
        
      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object as Stripe.Subscription;
        const { userId } = deletedSubscription.metadata;
        
        // Downgrade user to free plan
        await User.findByIdAndUpdate(userId, { plan: 'free' });
        
        // Update subscription record
        await Subscription.findOneAndUpdate(
          { userId, 'provider.stripeSubscriptionId': deletedSubscription.id },
          { 
            status: 'cancelled',
            endDate: new Date(deletedSubscription.current_period_end * 1000)
          }
        );
        break;
    }
    
    return { received: true };
  } catch (error) {
    console.error('Stripe webhook error:', error);
    throw new ErrorHandler('Failed to process webhook', 500);
  }
}
// Update user subscription
export async function updateUserSubscription(
  userId: string, 
  providerId: string = '', 
  provider: 'stripe' | 'flutterwave' = 'stripe'
) {
  try {
    console.log(`Updating subscription for user: ${userId} via ${provider}`);
    
    // Update user to pro plan
    const updatedUser = await User.findByIdAndUpdate(
      userId, 
      {
        plan: 'pro',
        planExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        projectIdeasLeft: 999999, // Effectively unlimited
        collaborationRequestsLeft: 999999 // Effectively unlimited
      },
      { new: true }
    );
    
    if (!updatedUser) {
      console.error(`User not found: ${userId}`);
      throw new Error(`User not found: ${userId}`);
    }
    
    console.log(`User plan updated to: ${updatedUser.plan}`);
    
    // Update Redis cache with fresh user data
    await redis.set(updatedUser.githubId, JSON.stringify(updatedUser), 'EX', 3600);
    console.log('User data cached in Redis');
    
    // Create or update subscription record
    const subscriptionData: any = {
      userId,
      status: 'active',
      plan: 'pro',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      provider: {
        name: provider
      }
    };
    
    // Add provider-specific data
    if (provider === 'stripe') {
      subscriptionData.provider.stripeSubscriptionId = providerId;
    } else {
      subscriptionData.provider.flutterwaveTransactionRef = providerId;
    }
    
    // Create or update subscription
    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      subscriptionData,
      { upsert: true, new: true }
    );
    
    console.log(`Subscription updated: ${subscription._id}`);
    
    return true;
  } catch (error) {
    console.error('Update subscription error:', error);
    throw new ErrorHandler('Failed to update subscription', 500);
  }
}

export async function addPaymentToHistory(
  userId: string, 
  amount: number,
  currency: string,
  reference: string,
  provider: 'stripe' | 'flutterwave',
  status: 'successful' | 'failed' | 'pending' = 'successful'
) {
  try {
    // Find subscription or create if it doesn't exist
    let subscription = await Subscription.findOne({ userId });
    
    if (!subscription) {
      // Calculate end date (30 days from now)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      
      // Create subscription with default values
      subscription = await Subscription.create({
        userId,
        status: 'pending',
        plan: 'free',
        startDate: new Date(),
        endDate,
        provider: {
          name: provider
        },
        paymentHistory: []
      });
    }
    
    // Add payment to history
    const payment = {
      amount,
      currency,
      date: new Date(),
      reference,
      provider,
      status
    };
    
    // Add to payment history
    if (!subscription.paymentHistory) {
      subscription.paymentHistory = [];
    }
    
    subscription.paymentHistory.push(payment);
    
    // Save subscription
    await subscription.save();
    
    return true;
  } catch (error) {
    console.error('Error adding payment to history:', error);
    return false;
  }
}
// Get pricing for current user location
export function getPricingForLocation(countryCode: string) {
  const currency = detectCurrencyFromCountryCode(countryCode);
  const config = getPaymentConfig(currency);
  
  return {
    currency,
    amount: config.displayAmount,
    symbol: config.symbol
  };
}