import { Request, Response, NextFunction } from 'express';
import ErrorHandler from '../utils/ErrorHandler';

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Check if user exists and has admin role
  if (!req.user || req.user.role !== 'admin') {
    return next(new ErrorHandler('Access denied. Admin privileges required.', 403));
  }
  
  next();
};
