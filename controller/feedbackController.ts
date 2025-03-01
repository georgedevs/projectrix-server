// controller/feedbackController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import User from '../models/userModel';
import Feedback from '../models/feedback.model';

// Submit new feedback
export const submitFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const { category, title, description, rating, tags } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!category || !title || !description) {
      return next(new ErrorHandler("Category, title and description are required", 400));
    }

    // Create new feedback
    const feedback = await Feedback.create({
      userId,
      category,
      title,
      description,
      rating: rating || 3,
      tags: tags || [],
      upvotes: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all feedback (admin route)
export const getAllFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler("Admin access required", 403));
    }

    const { category, status, sort = 'createdAt', order = 'desc' } = req.query;
    
    // Build query
    const query: any = {};
    if (category) query.category = category;
    if (status) query.status = status;

    // Build sort options
    const sortOptions: any = {};
    sortOptions[sort as string] = order === 'asc' ? 1 : -1;

    // Add upvotes count as a secondary sort option
    if (sort !== 'upvotes') {
      sortOptions['upvotes'] = -1;
    }

    const feedback = await Feedback.find(query)
      .sort(sortOptions)
      .populate({
        path: 'userId',
        select: 'name username avatar',
        model: User
      });

    res.status(200).json({
      success: true,
      count: feedback.length,
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get my feedback
export const getMyFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const userId = req.user._id;
    const feedback = await Feedback.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: feedback.length,
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get public feedback
export const getPublicFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, status, sort = 'createdAt', order = 'desc', limit = 20 } = req.query;
    
    // Build query
    const query: any = {};
    if (category) query.category = category;
    if (status) query.status = status;

    // Build sort options
    const sortOptions: any = {};
    sortOptions[sort as string] = order === 'asc' ? 1 : -1;

    // Get feedback with populated user info
    const feedback = await Feedback.find(query)
      .sort(sortOptions)
      .limit(Number(limit))
      .populate({
        path: 'userId',
        select: 'name username avatar',
        model: User
      });

    res.status(200).json({
      success: true,
      count: feedback.length,
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Upvote feedback
export const upvoteFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const { feedbackId } = req.params;
    const userId = req.user._id;

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return next(new ErrorHandler("Feedback not found", 404));
    }

    // Check if user already upvoted
    const alreadyUpvoted = feedback.upvotes.includes(userId);
    
    if (alreadyUpvoted) {
      // Remove upvote
      feedback.upvotes = feedback.upvotes.filter(id => id.toString() !== userId.toString());
    } else {
      // Add upvote
      feedback.upvotes.push(userId);
    }

    await feedback.save();

    res.status(200).json({
      success: true,
      message: alreadyUpvoted ? "Upvote removed" : "Feedback upvoted",
      upvoteCount: feedback.upvotes.length,
      isUpvoted: !alreadyUpvoted
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update feedback status (admin only)
export const updateFeedbackStatus = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler("Admin access required", 403));
    }

    const { feedbackId } = req.params;
    const { status } = req.body;

    if (!['pending', 'under-review', 'implemented', 'declined'].includes(status)) {
      return next(new ErrorHandler("Invalid status value", 400));
    }

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return next(new ErrorHandler("Feedback not found", 404));
    }

    feedback.status = status;
    feedback.updatedAt = new Date();
    await feedback.save();

    res.status(200).json({
      success: true,
      message: "Feedback status updated",
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});