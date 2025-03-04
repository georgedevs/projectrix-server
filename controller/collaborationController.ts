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
    const { projectId, role, message = "" } = req.body;
    const userId = req.user._id;

    if (!projectId || !role) {
      return next(new ErrorHandler("Project ID and role are required", 400));
    }

    // Check if the project exists and is published
    const project = await GeneratedProject.findOne({ _id: projectId, isPublished: true });
    if (!project) {
      return next(new ErrorHandler("Project not found or not published", 404));
    }

    // Check if the user is the owner of the project
    if (project.userId.toString() === userId.toString()) {
      return next(new ErrorHandler("You cannot apply to your own project", 400));
    }

    // Check if the role exists in the project
    const roleExists = project.teamStructure.roles.find(r => r.title === role);
    if (!roleExists) {
      return next(new ErrorHandler("Selected role does not exist for this project", 400));
    }

    // Check if the role is already filled
    if (roleExists.filled) {
      return next(new ErrorHandler("This role has already been filled", 400));
    }

    // Check if user already applied for this project
    const existingRequest = await CollaborationRequest.findOne({
      projectId,
      applicantId: userId
    });

    if (existingRequest) {
      return next(new ErrorHandler("You have already applied for this project", 400));
    }

    // Get the publisher's ID from the project
    const publisherId = project.userId;

    // Create a new collaboration request
    const collaborationRequest = await CollaborationRequest.create({
      projectId,
      applicantId: userId,
      publisherId,
      role,
      message,
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

// Get user's collaboration requests
export const getMyCollaborationRequests = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;

    const requests = await CollaborationRequest.find({ applicantId: userId })
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

// Get incoming collaboration requests for projects owned by the user
export const getIncomingCollaborationRequests = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;

    // Find all projects owned by the user
    const projects = await GeneratedProject.find({ userId });
    const projectIds = projects.map(project => project._id);

    // Find all collaboration requests for these projects
    const requests = await CollaborationRequest.find({ 
      projectId: { $in: projectIds } 
    })
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
    const { requestId } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    if (!['accepted', 'rejected'].includes(status)) {
      return next(new ErrorHandler("Invalid status. Status must be 'accepted' or 'rejected'", 400));
    }

    // Find the request
    const request = await CollaborationRequest.findById(requestId);
    if (!request) {
      return next(new ErrorHandler("Collaboration request not found", 404));
    }

    // Get the project
    const project = await GeneratedProject.findById(request.projectId);
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Verify the user is the owner of the project
    if (project.userId.toString() !== userId.toString()) {
      return next(new ErrorHandler("You don't have permission to update this request", 403));
    }

    // Update the request status
    request.status = status;
    await request.save();

    let rejectedRequests = [];

    // If accepting a request, mark the role as filled and reject other pending requests for the same role
    if (status === 'accepted') {
      // Find the role in the project
      const roleIndex = project.teamStructure.roles.findIndex(
        r => r.title === request.role
      );

      if (roleIndex !== -1) {
        // Mark the role as filled
        project.teamStructure.roles[roleIndex].filled = true;
        await project.save();

        // Add user to project team members
        const teamMember = {
          userId: request.applicantId,
          role: request.role,
          joinedAt: new Date()
        };

        // Check if teamMembers array exists
        if (!project.teamMembers) {
          project.teamMembers = [];
        }

        // Add the new team member
        project.teamMembers.push(teamMember);
        await project.save();

        // Update user's collaboration count
        await User.findByIdAndUpdate(
          request.applicantId,
          { $inc: { projectsCollaborated: 1 } }
        );

        // Find all other pending requests for the same role and reject them
        const otherRequests = await CollaborationRequest.find({
          projectId: request.projectId,
          role: request.role,
          status: 'pending',
          _id: { $ne: requestId }
        });

        // Reject all other pending requests for this role
        if (otherRequests.length > 0) {
          rejectedRequests = await Promise.all(
            otherRequests.map(async (req) => {
              req.status = 'rejected';
              await req.save();
              return req;
            })
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Collaboration request ${status}`,
      request,
      rejectedRequests: rejectedRequests.length > 0 ? rejectedRequests : undefined
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get user's active collaborations
export const getMyCollaborations = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;

    // Find accepted collaboration requests where this user is the applicant
    const acceptedRequests = await CollaborationRequest.find({
      applicantId: userId,
      status: 'accepted'
    }).populate({
      path: 'projectId',
      populate: {
        path: 'userId',
        select: 'name username avatar email'
      }
    });

    // Find all projects this user has published that have team members
    const ownedProjects = await GeneratedProject.find({
      userId,
      isPublished: true,
      'teamMembers.0': { $exists: true }
    }).populate({
      path: 'teamMembers.userId',
      select: 'name username avatar email'
    });

    const collaborations = [
      ...acceptedRequests.map(req => ({
        type: 'member',
        project: req.projectId,
        role: req.role,
        joinedAt: req.appliedAt
      })),
      ...ownedProjects.map(project => ({
        type: 'owner',
        project,
        role: project.teamStructure.roles.find(r => r.filled)?.title || 'Owner',
        teamMembers: project.teamMembers
      }))
    ];

    res.status(200).json({
      success: true,
      collaborations
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});