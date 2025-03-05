import { app } from "./app";
import connectDB from "./utils/db";
import http from 'http';
import { Server } from 'socket.io';
import { verifyFirebaseToken } from './utils/fbauth';
import User from './models/userModel';
require("dotenv").config();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with CORS settings
const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make socket.io available globally
declare global {
  var io: any;
}
global.io = io;

// Socket.io middleware for authentication
io.use(async (socket: any, next: any) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: Token not provided'));
    }
    
    // Verify token
    const decodedToken = await verifyFirebaseToken(token);
    const userId = decodedToken.uid;
    
    // Find user
    const user = await User.findOne({ githubId: userId });
    
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }
    
    // Attach user to socket
    socket.userId = user._id;
    socket.user = user;
    
    next();
  } catch (error: any) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication error: ' + error.message));
  }
});

// Socket.io connection handler
io.on('connection', (socket: any) => {
  console.log(`User connected: ${socket.userId}`);
  
  // Join a room with the user's ID to send them private messages
  socket.join(socket.userId.toString());
  
  // Listen for client events
  socket.on('join_project', (projectId: string) => {
    socket.join(`project:${projectId}`);
    console.log(`User ${socket.userId} joined project room: ${projectId}`);
  });
  
  socket.on('leave_project', (projectId: string) => {
    socket.leave(`project:${projectId}`);
    console.log(`User ${socket.userId} left project room: ${projectId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is connected successfully with port ${PORT}`);
  connectDB();
});