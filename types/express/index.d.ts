// types/express/index.d.ts
import { IUser } from '../../models/userModel';

declare global {
  namespace Express {
    // Correctly extend the existing Request interface
    interface Request {
      user?: IUser; // Use optional chaining to indicate it might not always be defined
    }
  }
}

// Export empty to treat this as a module
export {};