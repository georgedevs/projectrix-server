// controller/feedbackController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import Feedback from '../models/feedback.model';
import User from '../models/userModel';

// Submit new feedback
export const submitFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const { category, title, description, rating, tags } = req.body;

    // Validate required fields
    if (!category) {
      return next(new ErrorHandler("Category is required", 400));
    }
    if (!title) {
      return next(new ErrorHandler("Title is required", 400));
    }
    if (!description) {
      return next(new ErrorHandler("Description is required", 400));
    }

    // Create feedback
    const feedback = await Feedback.create({
      userId: req.user._id,
      category,
      title,
      description,
      rating: rating || 5,
      tags: tags || [],
      status: 'pending'
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

// Get my feedback
export const getMyFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const feedback = await Feedback.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('userId', 'name username avatar');

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
    const { category, status, sort = 'upvotes', order = 'desc', limit = '50' } = req.query;

    // Build query
    const query: any = {};
    if (category) query.category = category;
    if (status) query.status = status;

    // Parse limit
    const limitNum = parseInt(limit as string) || 50;

    // Sort options
    const sortOptions: any = {};
    if (sort === 'upvotes') {
      // For upvotes, we need to sort by the length of the upvotes array
      sortOptions['upvotes'] = order === 'asc' ? 1 : -1;
    } else if (sort === 'createdAt') {
      sortOptions['createdAt'] = order === 'asc' ? 1 : -1;
    }

    // Execute query
    const feedback = await Feedback.find(query)
      .sort(sortOptions)
      .limit(limitNum)
      .populate('userId', 'name username avatar');

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

    // Find feedback
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return next(new ErrorHandler("Feedback not found", 404));
    }

    // Check if user already upvoted
    const alreadyUpvoted = feedback.upvotes.includes(req.user._id);

    // Toggle upvote
    if (alreadyUpvoted) {
      // Remove upvote
      feedback.upvotes = feedback.upvotes.filter(id => id.toString() !== req.user._id.toString());
    } else {
      // Add upvote
      feedback.upvotes.push(req.user._id);
    }

    await feedback.save();

    res.status(200).json({
      success: true,
      message: alreadyUpvoted ? "Upvote removed" : "Upvote added",
      upvoteCount: feedback.upvotes.length,
      isUpvoted: !alreadyUpvoted
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ADMIN ROUTES

// Get all feedback (admin only)
export const getAllFeedback = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler("Not authorized", 403));
    }

    const { category, status, sort = 'upvotes', order = 'desc' } = req.query;

    // Build query
    const query: any = {};
    if (category) query.category = category;
    if (status) query.status = status;

    // Sort options
    const sortOptions: any = {};
    if (sort === 'upvotes') {
      sortOptions['upvotes'] = order === 'asc' ? 1 : -1;
    } else if (sort === 'createdAt') {
      sortOptions['createdAt'] = order === 'asc' ? 1 : -1;
    }

    // Execute query
    const feedback = await Feedback.find(query)
      .sort(sortOptions)
      .populate('userId', 'name username avatar');

    res.status(200).json({
      success: true,
      count: feedback.length,
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update feedback status (admin only)
export const updateFeedbackStatus = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler("Not authorized", 403));
    }

    const { feedbackId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!['pending', 'under-review', 'implemented', 'declined'].includes(status)) {
      return next(new ErrorHandler("Invalid status value", 400));
    }

    // Find and update feedback
    const feedback = await Feedback.findByIdAndUpdate(
      feedbackId,
      { status, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('userId', 'name username avatar');

    if (!feedback) {
      return next(new ErrorHandler("Feedback not found", 404));
    }

    res.status(200).json({
      success: true,
      message: `Feedback status updated to ${status}`,
      feedback
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});