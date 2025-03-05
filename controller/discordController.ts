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

    console.log(`Discord channel request for project ${projectId} by user ${userId}`);

    // Check if project exists and user is owner
    const project = await GeneratedProject.findOne({ _id: projectId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    console.log(`Project found: ${project.title}`);

    // Check if user is the project owner or an accepted collaborator
    const isOwner = project.userId.toString() === userId.toString();
    const isCollaborator = project.teamMembers?.some(member => 
      member.userId.toString() === userId.toString() && member.role
    );

    console.log(`User permissions - IsOwner: ${isOwner}, IsCollaborator: ${isCollaborator}`);

    if (!isOwner && !isCollaborator) {
      return next(new ErrorHandler("You don't have permission to create a Discord channel for this project", 403));
    }

    // Check if project already has a Discord channel
    if (project.discordChannelId && project.discordInviteLink) {
      console.log(`Project already has Discord channel: ${project.discordChannelId}`);
      // Always refresh the invite link to ensure it's valid
      const newInvite = await refreshInviteLink(project.discordChannelId, project.title);
      
      if (newInvite) {
        console.log(`Refreshed invite link: ${newInvite}`);
        project.discordInviteLink = newInvite;
        await project.save();
        
        return res.status(200).json({
          success: true,
          message: "Discord channel already exists, invite link refreshed. This link will give you access to a private project channel.",
          inviteLink: newInvite
        });
      } else {
        console.log("Failed to refresh invite, creating a new channel");
        // If refresh failed, continue to create a new channel
      }
    }

    console.log("Creating a new Discord channel");
    // Create a new Discord channel
    const discordChannel = await createProjectChannel(projectId, project.title);
    if (!discordChannel) {
      return next(new ErrorHandler("Failed to create Discord channel", 500));
    }

    console.log(`Channel created successfully: ${discordChannel.channelId} with invite ${discordChannel.inviteLink}`);

    // Update project with Discord channel info
    project.discordChannelId = discordChannel.channelId;
    project.discordInviteLink = discordChannel.inviteLink;
    await project.save();

    res.status(201).json({
      success: true,
      message: "Discord channel created successfully. This link will give you access to a private project channel.",
      inviteLink: discordChannel.inviteLink
    });
  } catch (error: any) {
    console.error('Discord channel error:', error);
    return next(new ErrorHandler(error.message || "Discord integration error", 500));
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

    // Always refresh the invite to ensure it's valid
    const newInvite = await refreshInviteLink(project.discordChannelId, project.title);
    if (newInvite) {
      project.discordInviteLink = newInvite;
      await project.save();
    }

    res.status(200).json({
      success: true,
      message: "Invite link generated. This link will give you access to a private project channel.",
      inviteLink: project.discordInviteLink
    });
  } catch (error: any) {
    console.error('Get Discord invite error:', error);
    return next(new ErrorHandler(error.message || "Discord integration error", 500));
  }
});