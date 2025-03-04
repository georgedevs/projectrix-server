// models/feedback.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IFeedback extends Document {
  userId: Schema.Types.ObjectId;
  category: 'bug' | 'feature' | 'improvement' | 'general';
  title: string;
  description: string;
  rating: number;
  status: 'pending' | 'under-review' | 'implemented' | 'declined';
  upvotes: Schema.Types.ObjectId[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema: Schema<IFeedback> = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "User ID is required"]
  },
  category: {
    type: String,
    enum: ['bug', 'feature', 'improvement', 'general'],
    required: [true, "Category is required"]
  },
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    maxlength: [100, "Title cannot be more than 100 characters"]
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
    maxlength: [1000, "Description cannot be more than 1000 characters"]
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },
  status: {
    type: String,
    enum: ['pending', 'under-review', 'implemented', 'declined'],
    default: 'pending'
  },
  upvotes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  tags: [{
    type: String,
    trim: true
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

// Add indexes for faster querying
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ category: 1 });
feedbackSchema.index({ userId: 1 });
feedbackSchema.index({ createdAt: -1 });

const Feedback: Model<IFeedback> = mongoose.model("Feedback", feedbackSchema);

export default Feedback;