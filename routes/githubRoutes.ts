// routes/githubRoutes.ts
import express from 'express';
import { 
  initiateGitHubAuth,
  handleGitHubCallback,
  createGitHubRepository,
  getGitHubRepositoryStatus,
  checkGitHubAuthStatus,
  revokeGitHubAuth,
  getInvitationStatus
} from '../controller/githubController';
import { isAuthenticated } from '../middleware/auth';

const githubRouter = express.Router();

// GitHub OAuth routes
githubRouter.get('/github/auth', isAuthenticated, initiateGitHubAuth);
githubRouter.get('/github/callback', handleGitHubCallback);

// GitHub Repository routes
githubRouter.post('/github/repository/:projectId', isAuthenticated, createGitHubRepository);
githubRouter.get('/github/repository/:projectId', isAuthenticated, getGitHubRepositoryStatus);

// GitHub Auth status routes
githubRouter.get('/github/auth-status', isAuthenticated, checkGitHubAuthStatus);
githubRouter.post('/github/revoke-auth', isAuthenticated, revokeGitHubAuth);
githubRouter.get('/github/invitation-status/:projectId', isAuthenticated, getInvitationStatus);

export default githubRouter;