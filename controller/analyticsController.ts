// controller/analyticsController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import { 
  DailyAnalytics, 
  UserMetrics, 
  ProjectMetrics, 
  RevenueMetrics, 
  SystemMetrics 
} from '../models/analytics.model';
import User from '../models/userModel';
import GeneratedProject from '../models/generateProject.model';
import CollaborationRequest from '../models/collaborationRequest.model';
import Feedback from '../models/feedback.model';
import mongoose from 'mongoose';

// Get dashboard summary - for main admin dashboard
export const getDashboardSummary = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    const lastMonthStart = new Date(today);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    
    // Get user counts
    const totalUsers = await User.countDocuments();
    const newUsersToday = await User.countDocuments({ 
      createdAt: { $gte: today } 
    });
    const proUsers = await User.countDocuments({ plan: 'pro' });
    const freeUsers = await User.countDocuments({ plan: 'free' });
    
    // Get project counts
    const totalProjects = await GeneratedProject.countDocuments();
    const publishedProjects = await GeneratedProject.countDocuments({ isPublished: true });
    const projectsGeneratedToday = await GeneratedProject.countDocuments({ 
      createdAt: { $gte: today } 
    });
    
    // Get collaboration counts
    const totalCollabRequests = await CollaborationRequest.countDocuments();
    const pendingCollabRequests = await CollaborationRequest.countDocuments({ status: 'pending' });
    const acceptedCollabRequests = await CollaborationRequest.countDocuments({ status: 'accepted' });
    
    // Get feedback counts
    const totalFeedback = await Feedback.countDocuments();
    const unprocessedFeedback = await Feedback.countDocuments({ status: 'pending' });
    
    // Get latest daily analytics for trend data
    const latestDailyAnalytics = await DailyAnalytics.find()
      .sort({ date: -1 })
      .limit(30);
    
    // Calculate % changes
    // For user growth
    const userGrowth = await calculateGrowthRate(User, 'createdAt');
    
    // For project generation
    const projectGrowth = await calculateGrowthRate(GeneratedProject, 'createdAt');
    
    // For pro user conversion
    const proUserGrowth = await calculatePlanConversionRate('pro');
    
    // Dashboard summary data
    const dashboardData = {
      userStats: {
        totalUsers,
        newUsersToday,
        proUsers,
        freeUsers,
        userGrowth,
        proUserPercentage: (proUsers / totalUsers) * 100,
        proUserGrowth
      },
      projectStats: {
        totalProjects,
        publishedProjects,
        projectsGeneratedToday,
        projectGrowth,
        publishRate: (publishedProjects / totalProjects) * 100
      },
      collaborationStats: {
        totalRequests: totalCollabRequests,
        pendingRequests: pendingCollabRequests,
        acceptedRequests: acceptedCollabRequests,
        acceptanceRate: (acceptedCollabRequests / totalCollabRequests) * 100
      },
      feedbackStats: {
        totalFeedback,
        unprocessedFeedback,
        processingRate: ((totalFeedback - unprocessedFeedback) / totalFeedback) * 100
      },
      trends: {
        userTrend: latestDailyAnalytics.map(day => ({
          date: day.date,
          newUsers: day.newUsers,
          activeUsers: day.activeUsers
        })),
        projectTrend: latestDailyAnalytics.map(day => ({
          date: day.date,
          generated: day.projectsGenerated,
          published: day.projectsPublished
        })),
        revenueTrend: latestDailyAnalytics.map(day => ({
          date: day.date,
          revenue: day.revenue,
          proSubscriptions: day.proSubscriptions
        }))
      }
    };
    
    res.status(200).json({
      success: true,
      dashboardData
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Helper to calculate growth rates
async function calculateGrowthRate(
  model: mongoose.Model<any>, 
  dateField: string = 'createdAt'
): Promise<{ daily: number; weekly: number; monthly: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const twoDaysAgo = new Date(yesterday);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
  
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const twoWeeksAgo = new Date(oneWeekAgo);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);
  
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  const twoMonthsAgo = new Date(oneMonthAgo);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);
  
  // Get counts for each time period
  const todayCount = await model.countDocuments({
    [dateField]: { $gte: today }
  });
  
  const yesterdayCount = await model.countDocuments({
    [dateField]: { $gte: yesterday, $lt: today }
  });
  
  const twoDaysAgoCount = await model.countDocuments({
    [dateField]: { $gte: twoDaysAgo, $lt: yesterday }
  });
  
  const thisWeekCount = await model.countDocuments({
    [dateField]: { $gte: oneWeekAgo }
  });
  
  const lastWeekCount = await model.countDocuments({
    [dateField]: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
  });
  
  const thisMonthCount = await model.countDocuments({
    [dateField]: { $gte: oneMonthAgo }
  });
  
  const lastMonthCount = await model.countDocuments({
    [dateField]: { $gte: twoMonthsAgo, $lt: oneMonthAgo }
  });
  
  // Calculate growth rates
  const dailyGrowth = yesterdayCount > 0 
    ? ((todayCount - yesterdayCount) / yesterdayCount) * 100 
    : 0;
  
  const weeklyGrowth = lastWeekCount > 0 
    ? ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100 
    : 0;
  
  const monthlyGrowth = lastMonthCount > 0 
    ? ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100 
    : 0;
  
  return {
    daily: dailyGrowth,
    weekly: weeklyGrowth,
    monthly: monthlyGrowth
  };
}

// Helper to calculate plan conversion rates
async function calculatePlanConversionRate(planType: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  const twoMonthsAgo = new Date(oneMonthAgo);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 1);
  
  // Count users who upgraded to the specified plan in the current month
  const currentMonthUpgrades = await User.countDocuments({
    plan: planType,
    // This field would need to be added to track when a user's plan was changed
    // For now, we're just using createdAt which isn't accurate for upgrades
    createdAt: { $gte: oneMonthAgo }
  });
  
  // Count users who upgraded in the previous month
  const previousMonthUpgrades = await User.countDocuments({
    plan: planType,
    createdAt: { $gte: twoMonthsAgo, $lt: oneMonthAgo }
  });
  
  // Calculate growth rate
  const growthRate = previousMonthUpgrades > 0 
    ? ((currentMonthUpgrades - previousMonthUpgrades) / previousMonthUpgrades) * 100 
    : 0;
  
  return growthRate;
}

// Get user metrics details for analytics dashboard
export const getUserMetrics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // User registration trends (last 30 days)
    const userRegistrationData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: oneMonthAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // User plan distribution
    const planDistribution = await User.aggregate([
      {
        $group: {
          _id: "$plan",
          count: { $sum: 1 }
        }
      }
    ]);
    
    // User skill/technology distribution
    const techDistribution = await User.aggregate([
      { $unwind: "$skills" },
      {
        $group: {
          _id: "$skills",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // User preferred roles distribution (from profiles)
    const roleDistribution = await UserMetrics.findOne()
      .sort({ timestamp: -1 })
      .select('usersByRole');
    
    // Active users over time
    const activeUserTrends = await UserMetrics.find()
      .sort({ timestamp: -1 })
      .limit(30)
      .select('timestamp activeUsers');
    
    // User retention data
    const retentionData = await UserMetrics.find()
      .sort({ timestamp: -1 })
      .limit(12)
      .select('timestamp userRetention');
    
    res.status(200).json({
      success: true,
      metrics: {
        registrationTrend: userRegistrationData,
        planDistribution,
        techDistribution,
        roleDistribution: roleDistribution?.usersByRole || {},
        activeUserTrends,
        retentionData
      }
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get project metrics for analytics dashboard
export const getProjectMetrics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // Project generation trends (last 30 days)
    const projectGenerationTrend = await GeneratedProject.aggregate([
      {
        $match: {
          createdAt: { $gte: oneMonthAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Project publish rate trends
    const publishRateTrend = await GeneratedProject.aggregate([
      {
        $match: {
          createdAt: { $gte: oneMonthAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
          published: { 
            $sum: { 
              $cond: [{ $eq: ["$isPublished", true] }, 1, 0] 
            } 
          }
        }
      },
      { 
        $project: { 
          _id: 1,
          total: 1,
          published: 1,
          publishRate: { 
            $cond: [
              { $eq: ["$total", 0] },
              0,
              { $multiply: [{ $divide: ["$published", "$total"] }, 100] }
            ]
          }
        } 
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Project category distribution
    const categoryDistribution = await GeneratedProject.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Technology popularity in projects
    const techPopularity = await GeneratedProject.aggregate([
      { $unwind: "$technologies" },
      {
        $group: {
          _id: "$technologies",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]);
    
    // Average complexity by category
    const complexityByCategory = await GeneratedProject.aggregate([
      {
        $group: {
          _id: "$category",
          avgComplexity: { $avg: "$complexity.percentage" }
        }
      }
    ]);
    
    // Team size distribution
    const teamSizeDistribution = await GeneratedProject.aggregate([
      {
        $group: {
          _id: "$teamSize.type",
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Duration distribution
    const durationDistribution = await GeneratedProject.aggregate([
      {
        $group: {
          _id: "$duration.type",
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      metrics: {
        projectGenerationTrend,
        publishRateTrend,
        categoryDistribution,
        techPopularity,
        complexityByCategory,
        teamSizeDistribution,
        durationDistribution
      }
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get collaboration metrics for analytics dashboard
export const getCollaborationMetrics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // Collaboration request trends
    const collaborationTrend = await CollaborationRequest.aggregate([
      {
        $match: {
          appliedAt: { $gte: oneMonthAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$appliedAt" } },
          total: { $sum: 1 },
          accepted: { 
            $sum: { 
              $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] 
            } 
          },
          rejected: { 
            $sum: { 
              $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] 
            } 
          },
          pending: { 
            $sum: { 
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0] 
            } 
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Acceptance rate by project category
    const acceptanceByCategory = await CollaborationRequest.aggregate([
      {
        $lookup: {
          from: 'generatedprojects',
          localField: 'projectId',
          foreignField: '_id',
          as: 'project'
        }
      },
      { $unwind: "$project" },
      {
        $group: {
          _id: "$project.category",
          total: { $sum: 1 },
          accepted: { 
            $sum: { 
              $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] 
            } 
          }
        }
      },
      { 
        $project: { 
          category: "$_id",
          total: 1,
          accepted: 1,
          acceptanceRate: { 
            $cond: [
              { $eq: ["$total", 0] },
              0,
              { $multiply: [{ $divide: ["$accepted", "$total"] }, 100] }
            ]
          }
        } 
      }
    ]);
    
    // Most requested roles
    const popularRoles = await CollaborationRequest.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
          acceptedCount: { 
            $sum: { 
              $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] 
            } 
          }
        }
      },
      { 
        $project: { 
          role: "$_id",
          count: 1,
          acceptedCount: 1,
          acceptanceRate: { 
            $cond: [
              { $eq: ["$count", 0] },
              0,
              { $multiply: [{ $divide: ["$acceptedCount", "$count"] }, 100] }
            ]
          }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Average response time (time between request and acceptance/rejection)
    // Note: This would require an additional field for when status was updated
    // For now, just returning placeholder data
    
    res.status(200).json({
      success: true,
      metrics: {
        collaborationTrend,
        acceptanceByCategory,
        popularRoles,
        // avgResponseTime: placeholder
      }
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get revenue metrics for analytics dashboard
export const getRevenueMetrics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the most recent revenue metrics
    const revenueMetrics = await RevenueMetrics.findOne().sort({ timestamp: -1 });
    
    // Get revenue trends (last 12 months)
    const revenueTrends = await RevenueMetrics.find()
      .sort({ timestamp: -1 })
      .limit(12)
      .select('timestamp monthlyRevenue')
      .lean();
    
    // Reverse for chronological order
    revenueTrends.reverse();
    
    // Get pro user subscription trends (last 12 months)
    const today = new Date();
    
          // Generate revenue forecast for next 3 months based on growth rate
    const forecastedRevenue = [];
    if (revenueMetrics && revenueTrends.length > 0) {
      const latestMonthRevenue = revenueMetrics.monthlyRevenue;
      const growthRate = revenueMetrics.subscriberGrowthRate / 100; // Convert % to decimal
      
      for (let i = 1; i <= 3; i++) {
        const forecastMonth = new Date(today);
        forecastMonth.setMonth(forecastMonth.getMonth() + i);
        
        // Simple forecasting formula: current * (1 + growth)^months
        const forecastedValue = latestMonthRevenue * Math.pow(1 + growthRate, i);
        
        forecastedRevenue.push({
          month: forecastMonth.toISOString().substring(0, 7), // Format as YYYY-MM
          revenue: forecastedValue
        });
      }
    }
    
    // Calculate key financial metrics
    const arpu = revenueMetrics?.avgRevenuePerUser || 0; // Average Revenue Per User
    const estimatedLtv = arpu * 12; // Estimated Lifetime Value (simple calculation)
    
    res.status(200).json({
      success: true,
      metrics: {
        currentRevenue: {
          monthly: revenueMetrics?.monthlyRevenue || 0,
          total: revenueMetrics?.totalRevenue || 0,
          arpu,
          estimatedLtv,
          churnRate: revenueMetrics?.churnRate || 0,
          growthRate: revenueMetrics?.subscriberGrowthRate || 0
        },
        revenueTrends,
        forecastedRevenue,
        revenueByCountry: revenueMetrics?.revenueByCountry || {}
      }
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get system performance metrics
export const getSystemMetrics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the most recent system metrics
    const latestMetrics = await SystemMetrics.findOne().sort({ timestamp: -1 });
    
    // Get historical system metrics for trends
    const historicalMetrics = await SystemMetrics.find()
      .sort({ timestamp: -1 })
      .limit(24) // Last 24 hours or data points
      .select('timestamp apiResponseTimes errorRates.total serverLoad aiGenerationMetrics')
      .lean();
    
    res.status(200).json({
      success: true,
      metrics: {
        current: latestMetrics || {},
        trends: historicalMetrics.reverse() // Chronological order
      }
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update analytics data - this would typically be called by a cron job
export const updateAnalyticsData = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // This would be an admin-only endpoint to trigger analytics calculations
    // For production, this would be moved to a separate service or cron job
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate daily analytics
    await calculateDailyAnalytics(today);
    
    // Calculate user metrics
    await calculateUserMetrics();
    
    // Calculate project metrics
    await calculateProjectMetrics();
    
    // Calculate revenue metrics
    await calculateRevenueMetrics();
    
    // Calculate system metrics
    await calculateSystemMetrics();
    
    res.status(200).json({
      success: true,
      message: 'Analytics data updated successfully'
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Helper function to calculate daily analytics
async function calculateDailyAnalytics(date: Date) {
  // Set time to midnight for the given date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Count new users for the day
  const newUsers = await User.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Count active users for the day (this would require login tracking)
  // For now, using a placeholder
  const activeUsers = 0;
  
  // Count projects generated for the day
  const projectsGenerated = await GeneratedProject.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Count projects published for the day
  const projectsPublished = await GeneratedProject.countDocuments({
    isPublished: true,
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Count collaboration requests for the day
  const collaborationRequests = await CollaborationRequest.countDocuments({
    appliedAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Count accepted collaborations for the day
  const acceptedCollaborations = await CollaborationRequest.countDocuments({
    status: 'accepted',
    appliedAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Count feedback submitted for the day
  const feedbackSubmitted = await Feedback.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Count pro subscriptions for the day (placeholder)
  const proSubscriptions = 0;
  
  // Calculate revenue for the day (placeholder)
  const revenue = proSubscriptions * 5; // $5 per pro subscription
  
  // Calculate average generation time (placeholder)
  const avgGenerationTime = 0;
  
  // Create or update daily analytics record
  await DailyAnalytics.findOneAndUpdate(
    { date: startOfDay },
    {
      date: startOfDay,
      newUsers,
      activeUsers,
      projectsGenerated,
      projectsPublished,
      collaborationRequests,
      acceptedCollaborations,
      feedbackSubmitted,
      proSubscriptions,
      revenue,
      avgGenerationTime
    },
    { upsert: true, new: true }
  );
}

// Helper function to calculate user metrics
async function calculateUserMetrics() {
  const timestamp = new Date();
  
  // Calculate total users
  const totalUsers = await User.countDocuments();
  
  // Calculate active users (placeholder)
  const activeUsers = {
    daily: 0,
    weekly: 0,
    monthly: 0
  };
  
  // Calculate pro and free users
  const proUsers = await User.countDocuments({ plan: 'pro' });
  const freeUsers = await User.countDocuments({ plan: 'free' });
  
  // Calculate users by technology
  const usersByTech = await User.aggregate([
    { $unwind: "$skills" },
    {
      $group: {
        _id: "$skills",
        count: { $sum: 1 }
      }
    }
  ]);
  
  const usersByTechMap = {};
  usersByTech.forEach(item => {
    usersByTechMap[item._id] = item.count;
  });
  
  // Calculate users by role (placeholder)
  const usersByRole = {};
  
  // Calculate user retention (placeholder)
  const userRetention = {
    day7: 0,
    day30: 0,
    day90: 0
  };
  
  // Create user metrics record
  await UserMetrics.create({
    timestamp,
    totalUsers,
    activeUsers,
    proUsers,
    freeUsers,
    usersByTech: usersByTechMap,
    usersByRole,
    userRetention
  });
}

// Helper function to calculate project metrics
async function calculateProjectMetrics() {
  const timestamp = new Date();
  
  // Calculate total projects
  const totalProjects = await GeneratedProject.countDocuments();
  
  // Calculate published projects
  const publishedProjects = await GeneratedProject.countDocuments({ isPublished: true });
  
  // Calculate projects by category
  const projectsByCategory = await GeneratedProject.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 }
      }
    }
  ]);
  
  const projectsByCategoryMap = {};
  projectsByCategory.forEach(item => {
    projectsByCategoryMap[item._id] = item.count;
  });
  
  // Calculate projects by technology
  const projectsByTech = await GeneratedProject.aggregate([
    { $unwind: "$technologies" },
    {
      $group: {
        _id: "$technologies",
        count: { $sum: 1 }
      }
    }
  ]);
  
  const projectsByTechMap = {};
  projectsByTech.forEach(item => {
    projectsByTechMap[item._id] = item.count;
  });
  
  // Calculate average project complexity
  const complexityResult = await GeneratedProject.aggregate([
    {
      $group: {
        _id: null,
        avgComplexity: { $avg: "$complexity.percentage" }
      }
    }
  ]);
  
  const avgProjectComplexity = complexityResult.length > 0 ? complexityResult[0].avgComplexity : 0;
  
  // Calculate average team size
  const teamSizeResult = await GeneratedProject.aggregate([
    {
      $group: {
        _id: null,
        avgTeamSize: { $avg: { $cond: [
          { $eq: ["$teamSize.type", "solo"] },
          1,
          { $cond: [
            { $eq: ["$teamSize.type", "small"] },
            2.5, // average of 2-3
            5 // average of 4-6
          ]}
        ]}}
      }
    }
  ]);
  
  const avgTeamSize = teamSizeResult.length > 0 ? teamSizeResult[0].avgTeamSize : 0;
  
  // Calculate popular technologies
  const popularTechnologies = await GeneratedProject.aggregate([
    { $unwind: "$technologies" },
    {
      $group: {
        _id: "$technologies",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 0,
        tech: "$_id",
        count: 1
      }
    }
  ]);
  
  // Create project metrics record
  await ProjectMetrics.create({
    timestamp,
    totalProjects,
    publishedProjects,
    projectsByCategory: projectsByCategoryMap,
    projectsByTech: projectsByTechMap,
    avgProjectComplexity,
    avgTeamSize,
    popularTechnologies
  });
}

// Helper function to calculate revenue metrics
async function calculateRevenueMetrics() {
  // This would typically connect to a payment service to get real data
  // Using placeholder values for now
  
  const timestamp = new Date();
  
  // Count pro users for revenue calculation
  const proUsers = await User.countDocuments({ plan: 'pro' });
  
  // Calculate monthly revenue ($5 per pro user)
  const monthlyRevenue = proUsers * 5;
  
  // Calculate total revenue (cumulative - would come from payment service)
  // Placeholder: Just multiply monthly by 3 for demo
  const totalRevenue = monthlyRevenue * 3;
  
  // Calculate subscriber growth rate (placeholder)
  const subscriberGrowthRate = 5; // 5% growth
  
  // Calculate churn rate (placeholder)
  const churnRate = 2; // 2% churn
  
  // Calculate average revenue per user
  const totalUsers = await User.countDocuments();
  const avgRevenuePerUser = totalUsers > 0 ? (monthlyRevenue / totalUsers) : 0;
  
  // Calculate projected monthly revenue
  const projectedMonthlyRevenue = monthlyRevenue * (1 + (subscriberGrowthRate - churnRate) / 100);
  
  // Revenue by country (placeholder)
  const revenueByCountry = {
    'US': monthlyRevenue * 0.4,
    'UK': monthlyRevenue * 0.2,
    'EU': monthlyRevenue * 0.2,
    'Other': monthlyRevenue * 0.2
  };
  
  // Create revenue metrics record
  await RevenueMetrics.create({
    timestamp,
    totalRevenue,
    monthlyRevenue,
    subscriberGrowthRate,
    churnRate,
    avgRevenuePerUser,
    projectedMonthlyRevenue,
    revenueByCountry
  });
}

// Helper function to calculate system metrics
async function calculateSystemMetrics() {
  // This would typically come from monitoring services like Prometheus, CloudWatch, etc.
  // Using placeholder values for now
  
  const timestamp = new Date();
  
  // API response times (placeholders)
  const apiResponseTimes = {
    avg: 250, // ms
    p95: 500, // ms
    p99: 750  // ms
  };
  
  // Error rates (placeholders)
  const errorRates = {
    total: 0.5, // 0.5%
    byEndpoint: {
      '/api/v1/generate': 0.8,
      '/api/v1/user/auth': 0.2,
      '/api/v1/projects': 0.3
    }
  };
  
  // Server load (placeholders)
  const serverLoad = {
    cpu: 45, // 45%
    memory: 60, // 60%
    diskUsage: 35 // 35%
  };
  
  // AI generation metrics (placeholders)
  const aiGenerationMetrics = {
    avgResponseTime: 3200, // ms
    successRate: 98, // 98%
    errorRate: 2, // 2%
    tokensUsed: 1500000 // 1.5M tokens
  };
  
  // Create system metrics record
  await SystemMetrics.create({
    timestamp,
    apiResponseTimes,
    errorRates,
    serverLoad,
    aiGenerationMetrics
  });
}