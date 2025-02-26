// controller/userProfileController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import UserProfile from '../models/userProfile.model';
import User from '../models/userModel';
import GeneratedProject from '../models/generateProject.model';

// Get or create user profile
export const getUserProfile = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
  
    const userId = req.user._id;

    let profile = await UserProfile.findOne({ userId });

    // If profile doesn't exist, create it
    if (!profile) {
      profile = await UserProfile.create({
        userId,
        bio: "",
        skills: [],
        website: "",
        githubProfile: "",
        twitterProfile: "",
        linkedinProfile: "",
        availability: "available",
        hoursPerWeek: "10-20 hours",
        preferredTechnologies: [],
        preferredRoles: [],
        publicEmail: false
      });
    }

    res.status(200).json({
      success: true,
      profile
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update user profile
export const updateUserProfile = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
  
    const userId = req.user._id;
    const updates = req.body;

    // Validate and sanitize fields
    const allowedFields = [
      'bio', 'skills', 'website', 'githubProfile', 'twitterProfile', 'linkedinProfile',
      'availability', 'hoursPerWeek', 'preferredTechnologies', 'preferredRoles', 'publicEmail'
    ];
    
    const sanitizedUpdates: any = {};
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    });

    // Find or create profile
    let profile = await UserProfile.findOne({ userId });
    
    if (!profile) {
      profile = await UserProfile.create({
        userId,
        ...sanitizedUpdates
      });
    } else {
      profile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: sanitizedUpdates },
        { new: true }
      );
    }

    // Update user's skills in the User model as well
    if (sanitizedUpdates.skills) {
      await User.findByIdAndUpdate(userId, { skills: sanitizedUpdates.skills });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get public profile for any user
export const getPublicProfile = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username } = req.params;
    console.log("🔍 Looking for user with username:", username);

    // Find user by username, making the query case-insensitive
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    }).select('name username avatar email createdAt projectsGenerated projectsCollaborated');
    
    if (!user) {
      console.log("❌ User not found with username:", username);
      return next(new ErrorHandler("User not found", 404));
    }

    console.log("✅ User found:", user._id, user.username);

    // Get user profile
    const profile = await UserProfile.findOne({ userId: user._id });
    
    // Get published projects
    const publishedProjects = await GeneratedProject.find({ 
      userId: user._id,
      isPublished: true
    }).select('title subtitle description technologies complexity teamStructure duration teamSize createdAt');

    // Count collaborations
    const collaborationsCount = user.projectsCollaborated || 0;
    
    // Prepare the response
    const publicProfile = {
      user: {
        ...user.toObject(),
        email: profile?.publicEmail ? user.email : undefined
      },
      profile: profile || {},
      stats: {
        projectsGenerated: user.projectsGenerated || 0,
        projectsCollaborated: collaborationsCount,
        publishedProjects: publishedProjects.length
      },
      publishedProjects,
    };

    res.status(200).json({
      success: true,
      publicProfile
    });
  } catch (error: any) {
    console.error("Error in getPublicProfile:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});