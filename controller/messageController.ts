// controller/messageController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import Message from '../models/message.model';
import User from '../models/userModel';

// Send a message
export const sendMessage = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
        return next(new ErrorHandler("Authentication required", 401));
      }
  
    const { receiverId, content } = req.body;
    const senderId = req.user._id;

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return next(new ErrorHandler("Receiver not found", 404));
    }

    // Limit message length to prevent abuse
    if (content.length > 1000) {
      return next(new ErrorHandler("Message is too long (max 1000 characters)", 400));
    }

    // Create message
    const message = await Message.create({
      senderId,
      receiverId,
      content,
      read: false,
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: message
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get messages with a specific user
export const getConversation = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
        return next(new ErrorHandler("Authentication required", 401));
      }
  
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Get all messages between the two users
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId }
      ]
    }).sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      { senderId: userId, receiverId: currentUserId, read: false },
      { read: true }
    );

    res.status(200).json({
      success: true,
      messages
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all conversations for the current user
export const getConversations = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
        return next(new ErrorHandler("Authentication required", 401));
      }
  
    const userId = req.user._id;

    // Find all unique users the current user has messaged with
    const sentMessages = await Message.find({ senderId: userId })
      .distinct('receiverId');
    
    const receivedMessages = await Message.find({ receiverId: userId })
      .distinct('senderId');

    // Combine and remove duplicates
    const conversationUserIds = [...new Set([...sentMessages.map(id => id.toString()), ...receivedMessages.map(id => id.toString())])];

    // Get user details for each conversation
    const conversations = await Promise.all(
      conversationUserIds.map(async (otherId) => {
        const otherUser = await User.findById(otherId).select('name username avatar');
        
        // Get the most recent message
        const latestMessage = await Message.findOne({
          $or: [
            { senderId: userId, receiverId: otherId },
            { senderId: otherId, receiverId: userId }
          ]
        }).sort({ createdAt: -1 });

        // Count unread messages
        const unreadCount = await Message.countDocuments({
          senderId: otherId,
          receiverId: userId,
          read: false
        });

        return {
          user: otherUser,
          latestMessage,
          unreadCount
        };
      })
    );

    // Sort by most recent message
    conversations.sort((a, b) => {
      const timeA = a.latestMessage ? new Date(a.latestMessage.createdAt).getTime() : 0;
      const timeB = b.latestMessage ? new Date(b.latestMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.status(200).json({
      success: true,
      conversations
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
