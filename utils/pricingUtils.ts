import dotenv from 'dotenv';
import { Request } from 'express';
import User from '../models/userModel';
import ErrorHandler from '../utils/ErrorHandler';

dotenv.config();

// Check if pricing features are enabled (for transitioning from beta to production)
export const isPricingEnabled = (): boolean => {
  return process.env.PRICING_ENABLED === 'true';
};

// Check if user has reached the free plan publish limit
export const checkPublishLimit = async (userId: string): Promise<boolean> => {
  // Don't enforce limit if pricing isn't enabled
  if (!isPricingEnabled()) {
    return true;
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  // Pro users have unlimited publishes
  if (user.plan === 'pro') {
    return true;
  }
  
  // Free users can only publish 1 project
  return user.publishedProjectsCount < 1;
};

// Check if user has reached the free plan collaboration request limit
export const checkCollaborationRequestLimit = async (userId: string): Promise<boolean> => {
  // Don't enforce limit if pricing isn't enabled
  if (!isPricingEnabled()) {
    return true;
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  // Pro users have unlimited collaboration requests
  if (user.plan === 'pro') {
    return true;
  }
  
  // Free users are limited to 3 collaboration requests
  return user.collaborationRequestsLeft > 0;
};

// Check if user has reached the free plan active collaboration limit
export const checkActiveCollaborationLimit = async (userId: string): Promise<boolean> => {
  // Don't enforce limit if pricing isn't enabled
  if (!isPricingEnabled()) {
    return true;
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  // Pro users have unlimited active collaborations
  if (user.plan === 'pro') {
    return true;
  }
  
  // Free users are limited to 1 active collaboration
  return user.projectsCollaborated < 1;
};

// Check if user can edit projects (only pro users)
export const canEditProject = async (userId: string): Promise<boolean> => {
  // Don't enforce limit if pricing isn't enabled
  if (!isPricingEnabled()) {
    return true;
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  // Only pro users can edit projects
  return user.plan === 'pro';
};

// Decrement user's collaboration request limit
export const decrementCollaborationRequests = async (userId: string): Promise<void> => {
  // Don't enforce if pricing isn't enabled
  if (!isPricingEnabled()) {
    return;
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  // Don't decrement for pro users
  if (user.plan === 'pro') {
    return;
  }
  
  // Decrement collaboration requests left
  if (user.collaborationRequestsLeft > 0) {
    user.collaborationRequestsLeft -= 1;
    await user.save();
  }
};

// Increment user's published project count
export const incrementPublishedProjects = async (userId: string): Promise<void> => {
  // Don't enforce if pricing isn't enabled
  if (!isPricingEnabled()) {
    return;
  }
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  // Increment published projects count
  user.publishedProjectsCount = (user.publishedProjectsCount || 0) + 1;
  await user.save();
};

// Helper function to set up initial values for both plans
export const initializeUserPlanLimits = (user: any): void => {
  // Set initial values based on plan
  if (user.plan === 'pro') {
  
    user.projectIdeasLeft = 10;
    user.collaborationRequestsLeft = 999999; // Effectively unlimited
  } else {
    // Free users get 3 project ideas and 3 collaboration requests per month
    user.projectIdeasLeft = 3;
    user.collaborationRequestsLeft = 3;
  }
};

// Helper function to reset monthly limits
export const resetMonthlyLimits = async (userId: string): Promise<void> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ErrorHandler('User not found', 404);
  }
  
  if (user.plan === 'free') {
    user.projectIdeasLeft = 3;
    user.collaborationRequestsLeft = 3;
    await user.save();
  }
};