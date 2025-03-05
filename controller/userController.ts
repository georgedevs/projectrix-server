import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import { redis } from '../utils/redis';
import { verifyFirebaseToken } from '../utils/fbauth';
import User from '../models/userModel';

// Register or login user with GitHub
export const githubAuth = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Starting GitHub auth process...');
    const { token } = req.body;
    
    if (!token) {
      return next(new ErrorHandler('Please provide a token', 400));
    }

    try {
      // Verify Firebase token and get user data
      const decodedToken = await verifyFirebaseToken(token);
      
      if (!decodedToken) {
        return next(new ErrorHandler('Invalid token', 401));
      }

      // Extract user information from decoded token
      const {
        uid: githubId,
        email,
        name: displayName,
        picture: photoURL,
      } = decodedToken;
      
      // Use email username or a fallback if none exists
      const username = email ? email.split('@')[0] : `user_${githubId.substring(0, 8)}`;

      // Check if user already exists
      let user = await User.findOne({ githubId });

      if (!user) {
        console.log('Creating new user...');
        // Create new user with default project limits
        const userData = {
          name: displayName || username,
          email: email || `${username}@github.com`,
          avatar: photoURL || `https://avatars.githubusercontent.com/${username}`,
          githubId,
          username,
          skills: [],
          projectIdeasLeft: 3, // Default number of free projects
          projectsGenerated: 0,
          createdAt: new Date(),
        };
        
        user = await User.create(userData);
        console.log('New user created:', user._id);
      } else {
        console.log('Existing user found:', user._id);
      }

      // Cache user data in Redis - 24 hours (86400 seconds)
      await redis.set(githubId, JSON.stringify(user), 'EX', 86400);

      res.status(200).json({
        success: true,
        user,
        // Include token expires info for frontend
        tokenExpiresIn: 86400, // 24 hours in seconds
      });
    } catch (verificationError: any) {
      console.error('Token Verification Error:', {
        name: verificationError.name,
        message: verificationError.message,
        code: verificationError.code,
      });
      return next(new ErrorHandler(`Token verification failed: ${verificationError.message}`, 401));
    }
  } catch (error: any) {
    console.error('GitHub Auth Error:', {
      name: error.name,
      message: error.message,
      code: error.code,
    });
    return next(new ErrorHandler(error.message || 'Authentication failed', error.statusCode || 400));
  }
}); 

// Logout user
export const logout = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // User is already authenticated via the middleware
    const user = req.user;
    
    if (!user) {
      return next(new ErrorHandler('Not authenticated', 401));
    }

    // Remove user data from Redis
    await redis.del(user.githubId);
    console.log('User removed from Redis cache');

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || 'Logout failed', 400));
  }
});

// Get user profile
export const getUserProfile = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    if (!user) {
      return next(new ErrorHandler('Please login to access this resource', 401));
    }

    // Get fresh user data from database to ensure it's up-to-date
    const freshUser = await User.findById(user._id);
    
    if (!freshUser) {
      return next(new ErrorHandler('User not found', 404));
    }

    res.status(200).json({
      success: true,
      user: freshUser,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// Update user preferences
export const updateUserPreferences = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    
    if (!user) {
      return next(new ErrorHandler('Please login to update preferences', 401));
    }
    
    const {
      skills,
      bio,
      isAvailable,
      contactPreferences
    } = req.body;
    
    // Only update fields that are provided in the request
    const updateData: any = {};
    
    if (skills !== undefined) updateData.skills = skills;
    if (bio !== undefined) updateData.bio = bio;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
    
    // Update user in database
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return next(new ErrorHandler('User not found', 404));
    }
    
    // Update Redis cache
    await redis.set(user.githubId, JSON.stringify(updatedUser), 'EX', 86400);
    
    res.status(200).json({
      success: true,
      user: updatedUser
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// For refreshing user data in the Redis cache
export const refreshUserCache = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    
    if (!user) {
      return next(new ErrorHandler('Not authenticated', 401));
    }
    
    // Get fresh user data from database
    const freshUser = await User.findById(user._id);
    
    if (!freshUser) {
      return next(new ErrorHandler('User not found', 404));
    }
    
    // Update Redis cache
    await redis.set(user.githubId, JSON.stringify(freshUser), 'EX', 86400);
    
    res.status(200).json({
      success: true,
      user: freshUser,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || 'Failed to refresh user cache', 400));
  }
});