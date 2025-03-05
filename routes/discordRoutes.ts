// routes/discordRoutes.ts
import express from 'express';
import { 
  createDiscordChannel,
  getDiscordInvite
} from '../controller/discordController';
import { isAuthenticated } from '../middleware/auth';

const discordRouter = express.Router();

// All routes require authentication
discordRouter.use(isAuthenticated);

// Create a Discord channel for a project
discordRouter.post('/discord/channel/:projectId', createDiscordChannel);

// Get Discord invite link for a project
discordRouter.get('/discord/invite/:projectId', getDiscordInvite);

export default discordRouter;