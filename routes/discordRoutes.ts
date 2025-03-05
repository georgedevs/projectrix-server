// routes/discordRoutes.ts
import express from 'express';
import { 
  createDiscordChannel,
  getDiscordInvite,
  initDiscordOAuth,
  handleDiscordCallback
} from '../controller/discordController';
import { isAuthenticated } from '../middleware/auth';

const discordRouter = express.Router();

// OAuth routes
discordRouter.get('/discord/oauth/:projectId', isAuthenticated, initDiscordOAuth);
discordRouter.get('/discord/callback', handleDiscordCallback);

discordRouter.post('/discord/channel/:projectId', isAuthenticated, createDiscordChannel);
discordRouter.get('/discord/invite/:projectId', isAuthenticated, getDiscordInvite);

export default discordRouter;