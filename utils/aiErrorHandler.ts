// utils/aiErrorHandler.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Handle AI-specific errors during project generation
 */
export const handleAIError = (error: any, req: Request, res: Response, next: NextFunction) => {
  // Check if it's an OpenAI API error
  if (error.name === 'OpenAIError' || error.message?.includes('OpenAI')) {
    console.error('OpenAI API Error:', error);
    
    // Check for specific error types
    if (error.status === 429) {
      return res.status(503).json({
        success: false,
        message: "Our AI service is currently experiencing high demand. Please try again in a few minutes."
      });
    }
    
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: "The AI couldn't process this request. Please try different parameters."
      });
    }
    
    if (error.status >= 500) {
      return res.status(503).json({
        success: false,
        message: "Our AI service is temporarily unavailable. Please try again later."
      });
    }
    
    // Generic AI error
    return res.status(500).json({
      success: false,
      message: "There was a problem generating your project. Please try again."
    });
  }
  
  // If it's not an AI-specific error, pass to the next error handler
  next(error);
};