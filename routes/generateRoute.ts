import express from 'express';
import { 
  generateProject,
  getGeneratedProjects,
  generateAnother,
  startProject,
  publishProject,
  getUserSavedProjects,
  submitUserProject,
  editProject
} from '../controller/generateController';
import { isAuthenticated } from '../middleware/auth';

const generateRouter = express.Router();

// All routes require authentication
generateRouter.use(isAuthenticated);

// Generate new project
generateRouter.post('/generate', generateProject);

// Get user's generated projects
generateRouter.get('/projects', getGeneratedProjects);

generateRouter.get('/user/saved-projects', isAuthenticated, getUserSavedProjects);
generateRouter.post('/projects/:projectId/publish', isAuthenticated, publishProject);

generateRouter.post('/projects/:projectId/start', startProject);

// Generate another project with same preferences
generateRouter.post('/projects/:projectId/generate-another', generateAnother);

generateRouter.post('/submit-project', submitUserProject);

// Edit project route
generateRouter.put('/projects/:projectId/edit', editProject);

export default generateRouter;