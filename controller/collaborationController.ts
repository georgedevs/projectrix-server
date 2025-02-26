// controller/collaborationController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import CollaborationRequest from '../models/collaborationRequest.model';
import GeneratedProject from '../models/generateProject.model';
import User from '../models/userModel';

// Submit a collaboration request
export const submitCollaborationRequest = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const { projectId, role, message } = req.body;
    const applicantId = req.user._id;

    // Check if project exists
    const project = await GeneratedProject.findById(projectId);
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Verify the role exists in the project
    const roleExists = project.teamStructure.roles.some(r => r.title === role && !r.filled);
    if (!roleExists) {
      return next(new ErrorHandler("This role is not available for the project", 400));
    }

    // Check if user already applied for this project
    const existingRequest = await CollaborationRequest.findOne({ projectId, applicantId });
    if (existingRequest) {
      return next(new ErrorHandler("You have already applied for this project", 400));
    }

    // Create collaboration request
    const collaborationRequest = await CollaborationRequest.create({
      projectId,
      applicantId,
      publisherId: project.userId,
      role,
      message: message || "",
      status: 'pending',
      appliedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: "Collaboration request submitted successfully",
      collaborationRequest
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get my collaboration requests (as an applicant)
export const getMyCollaborationRequests = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const applicantId = req.user._id;

    const requests = await CollaborationRequest.find({ applicantId })
      .populate({
        path: 'projectId',
        select: 'title subtitle technologies teamStructure'
      })
      .populate({
        path: 'publisherId',
        select: 'name username avatar email'
      })
      .sort({ appliedAt: -1 });

    res.status(200).json({
      success: true,
      requests
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get incoming collaboration requests (as a publisher)
export const getIncomingCollaborationRequests = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const publisherId = req.user._id;

    const requests = await CollaborationRequest.find({ publisherId })
      .populate({
        path: 'projectId',
        select: 'title subtitle technologies teamStructure'
      })
      .populate({
        path: 'applicantId',
        select: 'name username avatar email'
      })
      .sort({ appliedAt: -1 });

    res.status(200).json({
      success: true,
      requests
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update collaboration request status (accept/reject)
export const updateCollaborationRequestStatus = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }

    const { requestId } = req.params;
    const { status } = req.body;
    const publisherId = req.user._id;

    if (!['accepted', 'rejected'].includes(status)) {
      return next(new ErrorHandler("Invalid status value", 400));
    }

    // Find request and check if the user is the publisher
    const request = await CollaborationRequest.findById(requestId);
    
    if (!request) {
      return next(new ErrorHandler("Collaboration request not found", 404));
    }

    if (request.publisherId.toString() !== publisherId.toString()) {
      return next(new ErrorHandler("You are not authorized to update this request", 403));
    }

    // Update request status
    request.status = status;
    await request.save();

    // If accepted, add user to project team members and update the role as filled
    if (status === 'accepted') {
      // Update project
      const project = await GeneratedProject.findById(request.projectId);
      if (!project) {
        return next(new ErrorHandler("Project not found", 404));
      }

      // Find the role in the project
      const roleIndex = project.teamStructure.roles.findIndex(r => r.title === request.role);
      if (roleIndex !== -1) {
        project.teamStructure.roles[roleIndex].filled = true;
      }

      // Add to team members
      if (!project.teamMembers) {
        project.teamMembers = [];
      }
      
      project.teamMembers.push({
        userId: request.applicantId,
        role: request.role,
        joinedAt: new Date()
      });

      await project.save();

      // Update applicant's collaborations
      await User.findByIdAndUpdate(request.applicantId, {
        $push: {
          collaborations: {
            projectId: request.projectId,
            role: request.role,
            joinedAt: new Date()
          }
        },
        $inc: { projectsCollaborated: 1 }
      });

      // Reject all other pending requests for the same role
      await CollaborationRequest.updateMany({
        projectId: request.projectId,
        role: request.role,
        status: 'pending',
        _id: { $ne: requestId }
      }, {
        status: 'rejected'
      });
    }

    res.status(200).json({
      success: true,
      message: `Collaboration request ${status}`,
      request
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get projects I'm collaborating on
export const getMyCollaborations = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return next(new ErrorHandler("Authentication required", 401));
    }
    
    const userId = req.user._id;
    
    // Get user with populated collaborations
    const user = await User.findById(userId)
      .populate({
        path: 'collaborations.projectId',
        select: 'title subtitle description technologies complexity teamStructure isPublished userId teamMembers'
      });

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Get the populated collaborations
    const userCollaborations = user.collaborations || [];
    
    // For each collaboration, we need to get the owner's info
    const enhancedCollaborations = await Promise.all(
      userCollaborations.filter(collab => collab.projectId).map(async (collab) => {
        const project = collab.projectId;
        
        // Get the owner info
        const owner = await User.findById(project.userId).select('name username avatar');
        
        // Get team members info
        const teamMembers = await Promise.all(
          (project.teamMembers || []).map(async (member) => {
            const memberUser = await User.findById(member.userId).select('name username avatar');
            return {
              ...member.toObject(),
              userDetails: memberUser
            };
          })
        );
        
        // Format the project with owner info
        return {
          ...collab.toObject(),
          projectId: {
            ...project.toObject(),
            owner,
            teamMembers
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      collaborations: enhancedCollaborations
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});