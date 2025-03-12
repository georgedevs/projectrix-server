// middleware/auth.ts
import admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import User from '../models/userModel';
import { redis } from '../utils/redis';
import ErrorHandler from '../utils/ErrorHandler';

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  // Check if environment variables are defined
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Firebase configuration is missing. Check your environment variables.');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export const auth = admin.auth();

// Cache for blacklisted tokens
const tokenBlacklist = new Set<string>();

// Function to add a token to the blacklist with expiration
const addToBlacklist = async (token: string, expiry: number) => {
  tokenBlacklist.add(token);
  
  // Set expiry for the blacklisted token
  setTimeout(() => {
    tokenBlacklist.delete(token);
  }, expiry * 1000); // Convert seconds to milliseconds
  
  // Also store in Redis for persistence across server restarts
  try {
    await redis.set(`blacklist:${token}`, '1', 'EX', expiry);
  } catch (error) {
    console.error('Error storing blacklisted token in Redis:', error);
  }
};

// Check if a token is blacklisted
const isBlacklisted = async (token: string): Promise<boolean> => {
  // Check memory cache first (faster)
  if (tokenBlacklist.has(token)) {
    return true;
  }
  
  // Then check Redis
  try {
    const blacklisted = await redis.get(`blacklist:${token}`);
    return !!blacklisted;
  } catch (error) {
    console.error('Error checking token blacklist in Redis:', error);
    return false;
  }
};

export const verifyFirebaseToken = async (token: string) => {
  try {
    // Check if token is blacklisted
    if (await isBlacklisted(token)) {
      throw new Error('Token has been revoked');
    }
    
    console.log('🔍 Verifying Firebase token...');
    const decodedToken = await auth.verifyIdToken(token);
    console.log('✅ Token verified. User ID:', decodedToken.uid);
    return decodedToken;
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    throw error; // Keep the original error for better debugging
  }
};

// Type declaration for the user document
export interface UserDocument {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  githubId: string;
  username: string;
  skills: string[];
  projectIdeasLeft?: number;
  projectsGenerated?: number;
  role: string;
}

// Declare request type extension
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // public routes that don't require authentication
    const publicRoutes = [
      '/published-projects',
      '/published-projects/technologies',
      '/published-projects/roles',
      '/discord/callback',
      '/webhooks/stripe',
      '/github/callback'
    ];

    // Get the path without query parameters
    const path = req.path.split('?')[0];
    
    // Check if the current path is a public route 
    const isPublicRoute = publicRoutes.includes(path) || 
                          path.startsWith('/published-projects/') ||
                          path.startsWith('/webooks/') ||
                          path.startsWith('/discord/callback'); 
    
    if (isPublicRoute) {
      return next(); // Skip authentication for public routes
    }
    
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return next(new ErrorHandler('Authentication token is required', 401));
    }

    // Check if token is blacklisted
    if (await isBlacklisted(token)) {
      return next(new ErrorHandler('Invalid or expired token', 401));
    }

    try {
      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(token);
      const userId = decodedToken.uid;
      const tokenExp = decodedToken.exp;

      // Try getting user from cache first (Redis)
      const cachedUser = await redis.get(userId);
      let user: UserDocument | null = null;

      if (cachedUser) {
        try {
          user = JSON.parse(cachedUser) as UserDocument;
          console.log('✅ User found in Redis cache');
        } catch (error) {
          console.error('Error parsing cached user:', error);
        }
      }
      
      if (!user) {
        // Get from database if not in cache
        user = await User.findOne({ githubId: userId });
        
        if (!user) {
          return next(new ErrorHandler('User not found. Please log in again.', 404));
        }
        
        // Cache user data - Set to 1 hour (3600 seconds)
        // We use a shorter cache time than token expiry to ensure fresh data
        await redis.set(userId, JSON.stringify(user), 'EX', 3600);
        console.log('✅ User cached in Redis');
      }

      req.user = user;
      next();
    } catch (tokenError: any) {
      console.error('Token verification error:', tokenError);
      
      // Handle specific Firebase auth errors
      if (tokenError.code === 'auth/id-token-expired') {
        return next(new ErrorHandler('Token has expired. Please log in again.', 401));
      } else if (tokenError.code === 'auth/id-token-revoked') {
        // Add to blacklist to prevent further usage attempts
        await addToBlacklist(token, 3600); // 1 hour blacklist
        return next(new ErrorHandler('Token has been revoked. Please log in again.', 401));
      } else if (tokenError.code === 'auth/argument-error') {
        return next(new ErrorHandler('Invalid token format', 401));
      }
      
      return next(new ErrorHandler('Authentication failed: ' + tokenError.message, 401));
    }
  } catch (error: any) {
    console.error('Authentication error:', error);
    return next(new ErrorHandler('Authentication failed: ' + error.message, 401));
  }
};

// Middleware to handle logout and token revocation
export const handleLogout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (token) {
      // Add the token to the blacklist
      // Get the token expiration from the decoded token
      try {
        const decodedToken = await auth.verifyIdToken(token);
        const expiresIn = decodedToken.exp - Math.floor(Date.now() / 1000);
        
        // Only blacklist if the token is still valid
        if (expiresIn > 0) {
          await addToBlacklist(token, expiresIn);
        }
      } catch (error) {
        console.error('Error during token revocation:', error);
        // Continue with logout even if revocation fails
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
};