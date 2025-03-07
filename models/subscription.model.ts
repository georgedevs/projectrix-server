// models/subscription.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface ISubscription extends Document {
  userId: Schema.Types.ObjectId;
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  plan: 'free' | 'pro';
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  provider: {
    name: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    flutterwaveTransactionRef?: string;
  };
  paymentHistory: Array<{
    amount: number;
    currency: string;
    date: Date;
    reference: string;
    provider: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema: Schema<ISubscription> = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "User ID is required"]
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'pending'],
    default: 'pending'
  },
  plan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  renewalDate: {
    type: Date,
    default: function() {
      // Default renewal date is 30 days from start date
      const date = new Date(this.startDate);
      date.setDate(date.getDate() + 30);
      return date;
    }
  },
  provider: {
    name: {
      type: String,
      enum: ['stripe', 'flutterwave'],
      required: true
    },
    stripeSubscriptionId: String,
    stripeCustomerId: String,
    flutterwaveTransactionRef: String
  },
  paymentHistory: [{
    amount: Number,
    currency: {
      type: String,
      enum: ['USD', 'NGN']
    },
    date: {
      type: Date,
      default: Date.now
    },
    reference: String,
    provider: {
      type: String,
      enum: ['stripe', 'flutterwave']
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster queries
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ 'provider.stripeSubscriptionId': 1 });
subscriptionSchema.index({ 'provider.flutterwaveTransactionRef': 1 });

const Subscription: Model<ISubscription> = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;