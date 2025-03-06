// models/analytics.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

// Daily Analytics Schema - For tracking daily metrics
export interface IDailyAnalytics extends Document {
  date: Date;
  newUsers: number;
  activeUsers: number;
  projectsGenerated: number;
  projectsPublished: number;
  collaborationRequests: number;
  acceptedCollaborations: number;
  feedbackSubmitted: number;
  proSubscriptions: number;
  revenue: number;
  avgGenerationTime: number;
}

const dailyAnalyticsSchema: Schema<IDailyAnalytics> = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  newUsers: {
    type: Number,
    default: 0
  },
  activeUsers: {
    type: Number,
    default: 0
  },
  projectsGenerated: {
    type: Number,
    default: 0
  },
  projectsPublished: {
    type: Number,
    default: 0
  },
  collaborationRequests: {
    type: Number,
    default: 0
  },
  acceptedCollaborations: {
    type: Number,
    default: 0
  },
  feedbackSubmitted: {
    type: Number,
    default: 0
  },
  proSubscriptions: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  avgGenerationTime: {
    type: Number,
    default: 0
  }
});

// Add index for faster date-based queries
dailyAnalyticsSchema.index({ date: -1 });

// User Metrics Schema - For tracking individual user types and activity
export interface IUserMetrics extends Document {
  timestamp: Date;
  totalUsers: number;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  proUsers: number;
  freeUsers: number;
  usersByTech: Record<string, number>;
  usersByRole: Record<string, number>;
  userRetention: {
    day7: number;
    day30: number;
    day90: number;
  };
}

const userMetricsSchema: Schema<IUserMetrics> = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  totalUsers: {
    type: Number,
    default: 0
  },
  activeUsers: {
    daily: {
      type: Number,
      default: 0
    },
    weekly: {
      type: Number,
      default: 0
    },
    monthly: {
      type: Number,
      default: 0
    }
  },
  proUsers: {
    type: Number,
    default: 0
  },
  freeUsers: {
    type: Number,
    default: 0
  },
  usersByTech: {
    type: Map,
    of: Number,
    default: {}
  },
  usersByRole: {
    type: Map,
    of: Number,
    default: {}
  },
  userRetention: {
    day7: {
      type: Number,
      default: 0
    },
    day30: {
      type: Number,
      default: 0
    },
    day90: {
      type: Number,
      default: 0
    }
  }
});

// Project Metrics Schema - For tracking project-related statistics
export interface IProjectMetrics extends Document {
  timestamp: Date;
  totalProjects: number;
  publishedProjects: number;
  projectsByCategory: Record<string, number>;
  projectsByTech: Record<string, number>;
  avgProjectComplexity: number;
  avgTeamSize: number;
  popularTechnologies: Array<{tech: string, count: number}>;
}

const projectMetricsSchema: Schema<IProjectMetrics> = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  totalProjects: {
    type: Number,
    default: 0
  },
  publishedProjects: {
    type: Number,
    default: 0
  },
  projectsByCategory: {
    type: Map,
    of: Number,
    default: {}
  },
  projectsByTech: {
    type: Map,
    of: Number,
    default: {}
  },
  avgProjectComplexity: {
    type: Number,
    default: 0
  },
  avgTeamSize: {
    type: Number,
    default: 0
  },
  popularTechnologies: [
    {
      tech: String,
      count: Number
    }
  ]
});

// Revenue Metrics Schema - For financial tracking
export interface IRevenueMetrics extends Document {
  timestamp: Date;
  totalRevenue: number;
  monthlyRevenue: number;
  subscriberGrowthRate: number;
  churnRate: number;
  avgRevenuePerUser: number;
  projectedMonthlyRevenue: number;
  revenueByCountry: Record<string, number>;
}

const revenueMetricsSchema: Schema<IRevenueMetrics> = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  monthlyRevenue: {
    type: Number,
    default: 0
  },
  subscriberGrowthRate: {
    type: Number,
    default: 0
  },
  churnRate: {
    type: Number,
    default: 0
  },
  avgRevenuePerUser: {
    type: Number,
    default: 0
  },
  projectedMonthlyRevenue: {
    type: Number,
    default: 0
  },
  revenueByCountry: {
    type: Map,
    of: Number,
    default: {}
  }
});

// System Performance Metrics Schema - For tracking API and system performance
export interface ISystemMetrics extends Document {
  timestamp: Date;
  apiResponseTimes: {
    avg: number;
    p95: number;
    p99: number;
  };
  errorRates: {
    total: number;
    byEndpoint: Record<string, number>;
  };
  serverLoad: {
    cpu: number;
    memory: number;
    diskUsage: number;
  };
  aiGenerationMetrics: {
    avgResponseTime: number;
    successRate: number;
    errorRate: number;
    tokensUsed: number;
  };
}

const systemMetricsSchema: Schema<ISystemMetrics> = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  apiResponseTimes: {
    avg: {
      type: Number,
      default: 0
    },
    p95: {
      type: Number,
      default: 0
    },
    p99: {
      type: Number,
      default: 0
    }
  },
  errorRates: {
    total: {
      type: Number,
      default: 0
    },
    byEndpoint: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  serverLoad: {
    cpu: {
      type: Number,
      default: 0
    },
    memory: {
      type: Number,
      default: 0
    },
    diskUsage: {
      type: Number,
      default: 0
    }
  },
  aiGenerationMetrics: {
    avgResponseTime: {
      type: Number,
      default: 0
    },
    successRate: {
      type: Number,
      default: 0
    },
    errorRate: {
      type: Number,
      default: 0
    },
    tokensUsed: {
      type: Number,
      default: 0
    }
  }
});

// Create models
const DailyAnalytics: Model<IDailyAnalytics> = mongoose.model("DailyAnalytics", dailyAnalyticsSchema);
const UserMetrics: Model<IUserMetrics> = mongoose.model("UserMetrics", userMetricsSchema);
const ProjectMetrics: Model<IProjectMetrics> = mongoose.model("ProjectMetrics", projectMetricsSchema);
const RevenueMetrics: Model<IRevenueMetrics> = mongoose.model("RevenueMetrics", revenueMetricsSchema);
const SystemMetrics: Model<ISystemMetrics> = mongoose.model("SystemMetrics", systemMetricsSchema);

export {
  DailyAnalytics,
  UserMetrics,
  ProjectMetrics,
  RevenueMetrics,
  SystemMetrics
};