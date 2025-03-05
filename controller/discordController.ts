// controller/discordController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import GeneratedProject from '../models/generateProject.model';
import { createProjectChannel, refreshInviteLink } from '../utils/discordBot';

// Create a Discord channel for a project
export const createDiscordChannel = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;

    // Check if project exists and user is owner
    const project = await GeneratedProject.findOne({ _id: projectId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Check if user is the project owner or an accepted collaborator
    const isOwner = project.userId.toString() === userId.toString();
    const isCollaborator = project.teamMembers?.some(member => 
      member.userId.toString() === userId.toString() && member.role
    );

    if (!isOwner && !isCollaborator) {
      return next(new ErrorHandler("You don't have permission to create a Discord channel for this project", 403));
    }

    // Check if project already has a Discord channel
    if (project.discordChannelId && project.discordInviteLink) {
      // If it exists but invite link is broken, refresh it
      const newInvite = await refreshInviteLink(project.discordChannelId, project.title);
      if (newInvite) {
        project.discordInviteLink = newInvite;
        await project.save();
      }

      return res.status(200).json({
        success: true,
        message: "Discord channel already exists, invite link refreshed",
        inviteLink: project.discordInviteLink
      });
    }

    // Create a new Discord channel
    const discordChannel = await createProjectChannel(projectId, project.title);
    if (!discordChannel) {
      return next(new ErrorHandler("Failed to create Discord channel", 500));
    }

    // Update project with Discord channel info
    project.discordChannelId = discordChannel.channelId;
    project.discordInviteLink = discordChannel.inviteLink;
    await project.save();

    res.status(201).json({
      success: true,
      message: "Discord channel created successfully",
      inviteLink: discordChannel.inviteLink
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get Discord invite link for a project
export const getDiscordInvite = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;

    // Check if project exists
    const project = await GeneratedProject.findOne({ _id: projectId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Check if user is the project owner or an accepted collaborator
    const isOwner = project.userId.toString() === userId.toString();
    const isCollaborator = project.teamMembers?.some(member => 
      member.userId.toString() === userId.toString() && member.role
    );

    if (!isOwner && !isCollaborator) {
      return next(new ErrorHandler("You don't have permission to access this project's Discord channel", 403));
    }

    // Check if project has a Discord channel
    if (!project.discordChannelId || !project.discordInviteLink) {
      return next(new ErrorHandler("This project doesn't have a Discord channel yet", 404));
    }

    res.status(200).json({
      success: true,
      inviteLink: project.discordInviteLink
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});