  // controller/userController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import { redis } from '../utils/redis';
import { verifyFirebaseToken } from '../utils/fbauth';
import User from '../models/userModel';
import { initializeUserPlanLimits } from '../utils/pricingUtils';
import { sendUserWelcomeEmail } from './emailController';

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
      let isNewUser = false;

      if (!user) {
        console.log('Creating new user...');
        isNewUser = true;
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
          publishedProjectsCount: 0, // Initialize published projects count
          collaborationRequestsLeft: 3, // Initialize collaboration requests
          createdAt: new Date(),
          lastLogin: new Date(),
          role: 'user',
          plan: 'free', // Default to free plan
          newsletterSubscribed: true, // Subscribe to newsletters by default
          emailVerified: !!email, // Mark as verified if email exists (from GitHub)
        };
        
        // Initialize user plan limits
        initializeUserPlanLimits(userData);
        
        user = await User.create(userData);
        console.log('New user created:', user._id);
        
        // Send welcome email for new users
        if (email) {
          // Send welcome email asynchronously (don't await)
          sendUserWelcomeEmail(user._id.toString())
            .then((result) => {
              console.log(`Welcome email sent to ${email}: ${result ? 'Success' : 'Failed'}`);
            })
            .catch((error) => {
              console.error('Error sending welcome email:', error);
            });
        }
      } else {
        console.log('Existing user found:', user._id);
        
        await user.save();
      }

      // Calculate token expiration time
      // Firebase tokens expire in 1 hour by default
      const tokenExpiresIn = 3600; // 1 hour in seconds

      // Cache user data in Redis - 1 hour (3600 seconds) to match token expiry
      await redis.set(githubId, JSON.stringify(user), 'EX', tokenExpiresIn);

      res.status(200).json({
        success: true,
        user,
        tokenExpiresIn, // Include token expires info for frontend
        isNewUser, // Include flag indicating if user is new
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

    // Get the token from authorization header
    const token = req.headers.authorization?.split('Bearer ')[1];

    // Remove user data from Redis
    await redis.del(user.githubId);
    console.log('User removed from Redis cache');

    // Add the token to a blacklist in Redis to prevent reuse
    // The handleLogout middleware should have already blacklisted the token,
    // but we'll add an additional check here
    if (token) {
      const tokenInfo = await verifyFirebaseToken(token).catch(() => null);
      if (tokenInfo && tokenInfo.exp) {
        // Calculate token time to live in seconds
        const ttl = tokenInfo.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          // Store token in blacklist with the same expiry as the token
          await redis.set(`blacklist:${token}`, '1', 'EX', ttl);
          console.log(`Token blacklisted for ${ttl} seconds`);
        }
      }
    }

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
    if (contactPreferences !== undefined) updateData.contactPreferences = contactPreferences;
    
    // Update user in database
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return next(new ErrorHandler('User not found', 404));
    }
    
    // Update Redis cache with fresh user data - 1 hour expiry
    await redis.set(user.githubId, JSON.stringify(updatedUser), 'EX', 3600);
    
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
    
    // Update Redis cache with fresh user data - 1 hour expiry
    await redis.set(user.githubId, JSON.stringify(freshUser), 'EX', 3600);
    
    res.status(200).json({
      success: true,
      user: freshUser,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || 'Failed to refresh user cache', 400));
  }
});

// Validate token
export const validateToken = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Token validation is already handled by isAuthenticated middleware
    // This route simply confirms that the token is valid
    
    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user: req.user
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || 'Token validation failed', 400));
  }
});

// Refresh token
export const refreshToken = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return next(new ErrorHandler('Please provide a token', 400));
    }
    
    // Verify current token
    const decodedToken = await verifyFirebaseToken(token);
    const userId = decodedToken.uid;
    
    // Check if user exists
    const user = await User.findOne({ githubId: userId });
    
    if (!user) {
      return next(new ErrorHandler('User not found', 404));
    }
    
    // Update Redis cache with fresh token expiry - 1 hour
    await redis.set(userId, JSON.stringify(user), 'EX', 3600);
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      user,
      tokenExpiresIn: 3600 // 1 hour in seconds
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || 'Token refresh failed', 400));
  }
});