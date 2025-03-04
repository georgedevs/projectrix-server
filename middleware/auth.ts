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

export const verifyFirebaseToken = async (token: string) => {
  try {
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
  role:string;
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

    const publicRoutes = [
      '/published-projects',
      '/published-projects/technologies',
      '/published-projects/roles'
    ];

    // Get the path without query parameters
    const path = req.path.split('?')[0];
    
    // Check if the current path is a public route or starts with '/published-projects/'
    const isPublicRoute = publicRoutes.includes(path) || 
                          path.startsWith('/published-projects/');
    
    if (isPublicRoute) {
      return next(); // Skip authentication for public routes
    }
    
    const token = req.headers.authorization?.split('Bearer ')[1];
    
    if (!token) {
      return next(new ErrorHandler('Authentication token is required', 401));
    }

    // Verify Firebase token
    const decodedToken = await verifyFirebaseToken(token);
    const userId = decodedToken.uid;

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
      
      // Cache user data - Set to 24 hours (86400 seconds)
      await redis.set(userId, JSON.stringify(user), 'EX', 86400);
      console.log('✅ User cached in Redis');
    }

    req.user = user;
    next();
  } catch (error: any) {
    console.error('Authentication error:', error);
    return next(new ErrorHandler('Authentication failed: ' + error.message, 401));
  }
};