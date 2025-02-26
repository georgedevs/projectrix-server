import express from 'express';
import { 
  sendMessage,
  getConversation,
  getConversations
} from '../controller/messageController';
import { isAuthenticated } from '../middleware/auth';

const messageRouter = express.Router();

messageRouter.use(isAuthenticated);  // All routes require authentication

messageRouter.post('/send', sendMessage);
messageRouter.get('/conversation/:userId', getConversation);
messageRouter.get('/conversations', getConversations);

export default messageRouter;