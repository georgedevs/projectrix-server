// utils/cronJobs.ts
import cron from 'node-cron';
import User from '../models/userModel';
import { redis } from './redis';
import { isPricingEnabled } from './pricingUtils';

// Reset user limits at the beginning of each month
export const setupCronJobs = () => {
  // Run at midnight on the first day of each month (0 0 1 * *)
  cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly limit reset job...');
    
    // Only reset limits if pricing is enabled
    if (!isPricingEnabled()) {
      console.log('Pricing features are disabled. Skipping limit reset.');
      return;
    }
    
    try {
      // Find all free plan users
      const freeUsers = await User.find({ plan: 'free' });
      
      // Reset limits for each user 
      let updatedCount = 0;
      for (const user of freeUsers) {
        // Reset project ideas and collaboration requests
        user.projectIdeasLeft = 3;
        user.collaborationRequestsLeft = 3;
        await user.save();
        
        // Update Redis cache
        await redis.set(user.githubId, JSON.stringify(user), 'EX', 3600);
        
        updatedCount++;
      }
      
      console.log(`Successfully reset limits for ${updatedCount} free users.`);
    } catch (error) {
      console.error('Error resetting monthly limits:', error);
    }
  });
  
  console.log('Cron jobs initialized');
}; 