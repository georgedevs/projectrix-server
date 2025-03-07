// routes/adminUsersRoutes.ts
import express from 'express';
import { 
  getUsers,
  getUserById,
  updateUserRole,
  updateUserPlan,
  deleteUser,
  refreshUserLimits
} from '../controller/adminUsersController';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';

const adminUsersRouter = express.Router();

// All routes require authentication and admin privileges
adminUsersRouter.use(isAuthenticated, isAdmin);

// Get all users with filtering, sorting, and pagination
adminUsersRouter.get('/admin/users', getUsers);

// Get user by ID
adminUsersRouter.get('/admin/users/:id', getUserById);

// Update user role
adminUsersRouter.patch('/admin/users/:id/role', updateUserRole);

// Update user plan
adminUsersRouter.patch('/admin/users/:id/plan', updateUserPlan);

// Delete user
adminUsersRouter.delete('/admin/users/:id', deleteUser);

// Reset user limits (for testing or manual adjustments)
adminUsersRouter.post('/admin/users/:id/refresh-limits', refreshUserLimits);

export default adminUsersRouter;
