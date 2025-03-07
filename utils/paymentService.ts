import Stripe from 'stripe';
import Flutterwave from 'flutterwave-node-v3';
import ErrorHandler from './ErrorHandler';
import User from '../models/userModel';
import Subscription from '../models/subscription.model';
import dotenv from 'dotenv';

dotenv.config();

// Initialize payment providers with API keys
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2025-02-24.acacia',
  });

const flutterwave = new Flutterwave(
  process.env.FLUTTERWAVE_PUBLIC_KEY as string,
  process.env.FLUTTERWAVE_SECRET_KEY as string
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

    // Create a subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: process.env.STRIPE_PRICE_ID as string, // Monthly subscription price ID
        },
      ],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId
      }
    });

    // @ts-ignore - Stripe types are sometimes incomplete
    const clientSecret = subscription.latest_invoice.payment_intent.client_secret;

    return {
      subscriptionId: subscription.id,
      clientSecret
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
    const payload = {
      tx_ref: `projectrix-${Date.now()}-${userId}`,
      amount: PAYMENT_CONFIG.NGN.amount / 100, // Convert from kobo to naira
      currency: 'NGN',
      payment_options: 'card,ussd,banktransfer',
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

    const response = await flutterwave.Charge.card(payload);
    
    return {
      paymentLink: response.meta.authorization.redirect,
      transactionRef: payload.tx_ref
    };
  } catch (error) {
    console.error('Flutterwave payment error:', error);
    throw new ErrorHandler('Failed to create payment link', 500);
  }
}

// Verify Flutterwave payment
export async function verifyFlutterwavePayment(transactionId: string) {
  try {
    const response = await flutterwave.Transaction.verify({ id: transactionId });
    
    if (response.data.status === 'successful') {
      const { userId } = response.data.meta;
      
      // Update user subscription
      await updateUserSubscription(userId);
      
      return {
        success: true,
        message: 'Payment verified successfully'
      };
    } else {
      return {
        success: false,
        message: 'Payment verification failed'
      };
    }
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
          
          // Update user subscription
          await updateUserSubscription(userId);
        }
        break;
        
      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;
        const { userId } = subscription.metadata;
        
        // Downgrade user to free plan
        await User.findByIdAndUpdate(userId, { plan: 'free' });
        
        // Update subscription record
        await Subscription.findOneAndUpdate(
          { userId, 'provider.stripeSubscriptionId': subscription.id },
          { 
            status: 'cancelled',
            endDate: new Date(subscription.current_period_end * 1000)
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
    // Update user to pro plan
    await User.findByIdAndUpdate(userId, {
      plan: 'pro',
      planExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      projectIdeasLeft: 999999, // Effectively unlimited
      collaborationRequestsLeft: 999999 // Effectively unlimited
    });
    
    // Create or update subscription record
    const subscriptionData: any = {
      userId,
      status: 'active',
      plan: 'pro',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      provider: {}
    };
    
    // Add provider-specific data
    if (provider === 'stripe') {
      subscriptionData.provider.name = 'stripe';
      if (providerId) {
        subscriptionData.provider.stripeSubscriptionId = providerId;
      }
    } else {
      subscriptionData.provider.name = 'flutterwave';
      if (providerId) {
        subscriptionData.provider.flutterwaveTransactionRef = providerId;
      }
    }
    
    // Create or update subscription
    await Subscription.findOneAndUpdate(
      { userId },
      subscriptionData,
      { upsert: true, new: true }
    );
    
    return true;
  } catch (error) {
    console.error('Update subscription error:', error);
    throw new ErrorHandler('Failed to update subscription', 500);
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