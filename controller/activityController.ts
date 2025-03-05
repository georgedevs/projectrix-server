import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import Activity from '../models/activity.model';

// Create an activity record
export const createActivity = async (
  userId: string,
  type: string,
  message: string,
  entityId?: string,
  entityType?: string,
  entityName?: string
) => {
  try {
    const activity = await Activity.create({
      userId,
      type,
      message,
      entityId,
      entityType,
      entityName,
      read: false,
      createdAt: new Date()
    });
    
    // Emit socket event for real-time notification
    const io = global.io;
    if (io) {
      io.to(userId.toString()).emit('new_activity', {
        activity: {
          _id: activity._id,
          type: activity.type,
          message: activity.message,
          entityId: activity.entityId,
          entityType: activity.entityType,
          entityName: activity.entityName,
          read: activity.read,
          createdAt: activity.createdAt
        }
      });
    }
    
    return activity;
  } catch (error) {
    console.error('Error creating activity:', error);
    return null;
  }
};

// Get user's activities
export const getUserActivities = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, filter } = req.query;
    
    // Prepare query
    const query: any = { userId };
    
    // Add filter if provided
    if (filter) {
      query.type = filter;
    }
    
    const options = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      sort: { createdAt: -1 }
    };
    
    // Get total count
    const total = await Activity.countDocuments(query);
    
    // Get paginated activities
    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit);
    
    res.status(200).json({
      success: true,
      activities,
      pagination: {
        total,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get unread notifications count
export const getUnreadCount = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;
    
    const count = await Activity.countDocuments({ userId, read: false });
    
    res.status(200).json({
      success: true,
      unreadCount: count
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Mark activity as read
export const markActivityAsRead = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;
    
    const activity = await Activity.findOne({ _id: activityId, userId });
    
    if (!activity) {
      return next(new ErrorHandler("Activity not found", 404));
    }
    
    activity.read = true;
    await activity.save();
    
    res.status(200).json({
      success: true,
      message: "Activity marked as read"
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Mark all activities as read
export const markAllAsRead = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;
    
    await Activity.updateMany({ userId, read: false }, { read: true });
    
    res.status(200).json({
      success: true,
      message: "All activities marked as read"
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete an activity
export const deleteActivity = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;
    
    const activity = await Activity.findOne({ _id: activityId, userId });
    
    if (!activity) {
      return next(new ErrorHandler("Activity not found", 404));
    }
    
    await activity.remove();
    
    res.status(200).json({
      success: true,
      message: "Activity deleted successfully"
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});