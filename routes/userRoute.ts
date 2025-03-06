// routes/userRoute.ts
import express from 'express';     
import { isAuthenticated, handleLogout } from '../middleware/auth';
import { 
  getUserProfile, 
  githubAuth, 
  logout, 
  refreshUserCache, 
  updateUserPreferences,
  validateToken,
  refreshToken
} from '../controller/userController';

const userRouter = express.Router();

// Auth routes
userRouter.post('/auth/github', githubAuth);
userRouter.post('/auth/logout', isAuthenticated, handleLogout, logout);
userRouter.get('/auth/refresh', isAuthenticated, refreshUserCache);
userRouter.post('/auth/validate-token', isAuthenticated, validateToken);
userRouter.post('/auth/refresh-token', refreshToken);
 
// User profile routes
userRouter.get('/me', isAuthenticated, getUserProfile);
userRouter.patch('/user/preferences', isAuthenticated, updateUserPreferences);

export default userRouter;