import express from 'express';     
import { isAuthenticated } from '../middleware/auth';
import { 
  getUserProfile, 
  githubAuth, 
  logout, 
  refreshUserCache, 
  updateUserPreferences 
} from '../controller/userController';

const userRouter = express.Router();

// Auth routes
userRouter.post('/auth/github', githubAuth);
userRouter.post('/auth/logout', isAuthenticated, logout);
userRouter.get('/auth/refresh', isAuthenticated, refreshUserCache);

// User profile routes
userRouter.get('/me', isAuthenticated, getUserProfile);
userRouter.patch('/user/preferences', isAuthenticated, updateUserPreferences);

export default userRouter;