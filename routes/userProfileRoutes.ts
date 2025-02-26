import express from 'express';
import { 
  getUserProfile,
  updateUserProfile,
  getPublicProfile
} from '../controller/userProfileController';
import { isAuthenticated } from '../middleware/auth';

const userProfileRouter = express.Router();

// Routes requiring authentication
userProfileRouter.get('/profile', isAuthenticated, getUserProfile);
userProfileRouter.patch('/profile', isAuthenticated, updateUserProfile);

// Public route
userProfileRouter.get('/profile/:username', getPublicProfile);

export default userProfileRouter;