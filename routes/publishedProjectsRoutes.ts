// routes/publishedProjectsRoutes.ts
import express from 'express';
import {
  getPublishedProjects,
  getPublishedProject,
  getAvailableTechnologies,
  getAvailableRoles
} from '../controller/publishedProjectsController';

const publishedProjectsRouter = express.Router();

// Routes for published projects - these don't require authentication
publishedProjectsRouter.get('/published-projects', getPublishedProjects);
publishedProjectsRouter.get('/published-projects/technologies', getAvailableTechnologies);
publishedProjectsRouter.get('/published-projects/roles', getAvailableRoles);
publishedProjectsRouter.get('/published-projects/:id', getPublishedProject);

export default publishedProjectsRouter;