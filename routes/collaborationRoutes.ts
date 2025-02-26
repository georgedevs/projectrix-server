import express from 'express';
import { 
  submitCollaborationRequest,
  getMyCollaborationRequests,
  getIncomingCollaborationRequests,
  updateCollaborationRequestStatus,
  getMyCollaborations
} from '../controller/collaborationController';
import { isAuthenticated } from '../middleware/auth';

const collaborationRouter = express.Router();

collaborationRouter.use(isAuthenticated);  // All routes require authentication

collaborationRouter.post('/collaboration/request', submitCollaborationRequest);
collaborationRouter.get('/my-requests', getMyCollaborationRequests);
collaborationRouter.get('/incoming-requests', getIncomingCollaborationRequests);
collaborationRouter.patch('/request/:requestId', updateCollaborationRequestStatus);
collaborationRouter.get('/my-collaborations', getMyCollaborations);

export default collaborationRouter;