// routes/analyticsRoutes.ts
import express from 'express';
import { 
  getDashboardSummary, 
  getUserMetrics, 
  getProjectMetrics, 
  getCollaborationMetrics, 
  getRevenueMetrics,
  getSystemMetrics,
  updateAnalyticsData
} from '../controller/analyticsController';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';

const analyticsRouter = express.Router(); 

// All analytics routes require authentication and admin privileges
analyticsRouter.use(isAuthenticated, isAdmin);

// Dashboard summary for admin dashboard
analyticsRouter.get('/admin/analytics/dashboard', getDashboardSummary);

// Detailed analytics endpoints
analyticsRouter.get('/admin/analytics/users', getUserMetrics);
analyticsRouter.get('/admin/analytics/projects', getProjectMetrics);
analyticsRouter.get('/admin/analytics/collaborations', getCollaborationMetrics);
analyticsRouter.get('/admin/analytics/revenue', getRevenueMetrics);
analyticsRouter.get('/admin/analytics/system', getSystemMetrics);

// Endpoint to trigger analytics data update (for testing or manual updates)
analyticsRouter.post('/admin/analytics/update', updateAnalyticsData);

export default analyticsRouter;