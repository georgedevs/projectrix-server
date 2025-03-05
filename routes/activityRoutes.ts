// routes/activityRoutes.ts
import express from 'express';
import { 
  getUserActivities,
  getUnreadCount,
  markActivityAsRead,
  markAllAsRead,
  deleteActivity,
  clearAllActivities
} from '../controller/activityController';
import { isAuthenticated } from '../middleware/auth';

const activityRouter = express.Router();

// All routes require authentication
activityRouter.use(isAuthenticated);

// Get user's activities with pagination and filtering
activityRouter.get('/activities', getUserActivities);

// Get count of unread notifications
activityRouter.get('/activities/unread-count', getUnreadCount);

// Mark a specific activity as read
activityRouter.patch('/activities/:activityId/read', markActivityAsRead);

// Mark all activities as read
activityRouter.patch('/activities/mark-all-read', markAllAsRead);

// Delete an activity
activityRouter.delete('/activities/:activityId', deleteActivity);

//delete all activities
activityRouter.delete('/activities', clearAllActivities);

export default activityRouter;