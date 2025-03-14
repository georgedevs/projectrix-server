// controller/emailController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import User from '../models/userModel';
import { 
  sendEmailTemplate, 
  sendWelcomeEmail, 
  sendNewsletter 
} from '../utils/emailService';
import { isAdmin } from '../middleware/isAdmin';

/**
 * Send a welcome email to a new user
 * This is not exposed as an API endpoint but called internally
 */
export const sendUserWelcomeEmail = async (userId: string): Promise<boolean> => {
  try {
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      console.error(`User not found for welcome email: ${userId}`);
      return false;
    }
    
    // Send welcome email
    const result = await sendWelcomeEmail(user);
    
    if (result) {
      // Update user's lastEmailSent timestamp
      user.lastEmailSent = new Date();
      await user.save();
    }
    
    return result;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

/**
 * Send a test email 
 */
export const sendTestEmail = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler('Only administrators can send test emails', 403));
    }
    
    const { email, template, data } = req.body;
    
    if (!email || !template) {
      return next(new ErrorHandler('Email and template are required', 400));
    }
    
    // Send test email
    const result = await sendEmailTemplate(
      email,
      'Projectrix Test Email',
      template,
      data || {}
    );
    
    if (result) {
      res.status(200).json({
        success: true,
        message: `Test email sent successfully to ${email}`,
      });
    } else {
      return next(new ErrorHandler('Failed to send test email', 500));
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

/**
 * Send newsletter to all subscribed users (admin only)
 */
export const sendNewsletterToAllUsers = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new ErrorHandler('Only administrators can send newsletters', 403));
    }
    
    const { subject, template, data } = req.body;
    
    if (!subject || !template) {
      return next(new ErrorHandler('Subject and template are required', 400));
    }
    
    // Send newsletter
    const result = await sendNewsletter(subject, template, data || {});
    
    res.status(200).json({
      success: result.success,
      message: `Newsletter sent to ${result.sentCount} users with ${result.failedCount} failures`,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

/**
 * Allow users to unsubscribe from newsletters
 */
export const unsubscribeFromNewsletter = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token } = req.query;
    
    if (!email) {
      return next(new ErrorHandler('Email is required', 400));
    }
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return next(new ErrorHandler('User not found', 404));
    }
    
    // Update user's newsletter preference
    user.newsletterSubscribed = false;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'You have been successfully unsubscribed from newsletters',
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

/**
 * Allow authenticated users to update their newsletter preferences
 */
export const updateNewsletterPreference = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler('Authentication required', 401));
    }
    
    const { subscribed } = req.body;
    
    if (subscribed === undefined) {
      return next(new ErrorHandler('Subscription preference is required', 400));
    }
    
    // Update user's newsletter preference
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { newsletterSubscribed: !!subscribed },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: subscribed 
        ? 'You have been subscribed to newsletters' 
        : 'You have been unsubscribed from newsletters',
      user
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

/**
 * Get newsletter preferences for the authenticated user
 */
export const getNewsletterPreference = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ErrorHandler('Authentication required', 401));
    }
    
    // Get fresh user data
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return next(new ErrorHandler('User not found', 404));
    }
    
    res.status(200).json({
      success: true,
      subscribed: user.newsletterSubscribed
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});