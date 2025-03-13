// controller/collaborationController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import CollaborationRequest from '../models/collaborationRequest.model';
import GeneratedProject from '../models/generateProject.model';
import User from '../models/userModel';
import {
  createCollaborationRequestActivity,
  createCollaborationResponseActivity
} from '../utils/activityUtils';
import {
  checkCollaborationRequestLimit,
  checkActiveCollaborationLimit,
  decrementCollaborationRequests,
  isPricingEnabled
} from '../utils/pricingUtils';
import { redis } from '../utils/redis';
import { getGitHubServiceForUser } from '../utils/githubService';

// Submit a collaboration request
export const submitCollaborationRequest = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, role, message } = req.body;
    const applicantId = req.user._id;

    // Log the received data
    console.log('Received application request:', { projectId, role, message, applicantId });

    // Validate project exists
    const project = await GeneratedProject.findById(projectId);
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    const projectTitle = project.title;
    // Get project owner id
    const publisherId = project.userId;

    // Check if user is the project owner
    if (applicantId.toString() === publisherId.toString()) {
      return next(new ErrorHandler("You cannot apply to your own project", 400));
    }

    // Check if role exists and is available
    const roleExists = project.teamStructure?.roles?.find(r => r.title === role);
    if (!roleExists) {
      return next(new ErrorHandler("Role not found in project", 404));
    }

    if (roleExists.filled) {
      return next(new ErrorHandler("This role is already filled", 400));
    }

    // Check if user already applied for this role
    const existingRequest = await CollaborationRequest.findOne({
      projectId,
      applicantId,
      role
    });

    if (existingRequest) {
      return next(new ErrorHandler("You have already applied for this role", 400));
    }


    const hasRequestsLeft = await checkCollaborationRequestLimit(applicantId.toString());
    if (!hasRequestsLeft) {
      return next(new ErrorHandler("You have reached your collaboration request limit for this month. Upgrade to Pro for unlimited requests.", 403));
    }

    // Check if user has reached active collaboration limit
    const canHaveMoreCollaborations = await checkActiveCollaborationLimit(applicantId.toString());
    if (!canHaveMoreCollaborations) {
      return next(new ErrorHandler("You have reached your active collaboration limit (1). Upgrade to Pro for unlimited collaborations.", 403));
    }

    // Create collaboration request
    const collaborationRequest = await CollaborationRequest.create({
      projectId,
      applicantId,
      publisherId,
      role,
      message: message || "",
      status: 'pending',
      appliedAt: new Date()
    });

    await decrementCollaborationRequests(applicantId.toString());

    // Populate response with user data
    const populatedRequest = await CollaborationRequest.findById(collaborationRequest._id)
      .populate('projectId', 'title subtitle technologies teamStructure')
      .populate('applicantId', 'name username avatar email')
      .populate('publisherId', 'name username avatar email');

      const applicant = await User.findById(applicantId);
      const applicantName = applicant.name;

      await createCollaborationRequestActivity(
        publisherId.toString(),
        collaborationRequest._id.toString(),
        applicantName,
        projectTitle,
        role
      );

    res.status(201).json({
      success: true,
      message: "Collaboration request submitted successfully",
      collaborationRequest: populatedRequest
    });
  } catch (error: any) {
    console.error('Error submitting collaboration request:', error);
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

    const applicant = await User.findById(request.applicantId);
    if (!applicant) {
      return next(new ErrorHandler("Applicant not found", 404));
    }

    if (status === 'accepted' && isPricingEnabled() && applicant.plan === 'free') {
      const activeCollabs = applicant.projectsCollaborated || 0;
      
      if (activeCollabs >= 1) {
        // Auto-reject since free user already has an active collaboration
        request.status = 'rejected';
        await request.save();
        
        await createCollaborationResponseActivity(
          request.applicantId.toString(),
          request._id.toString(),
          req.user.name,
          project.title,
          request.role,
          'rejected'
        );
        
        return res.status(403).json({
          success: false,
          message: "This user has reached their active collaboration limit (1). They need to upgrade to Pro for more collaborations.",
          request
        });
      }
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

        // If the project has a GitHub repository, add the new team member
        if (project.githubInfo && project.githubInfo.repoOwner && project.githubInfo.repoName) {
          try {
            // Get the GitHub service for the project owner
            const githubService = await getGitHubServiceForUser(userId.toString());
            
            if (githubService) {
              // Get the GitHub username from the user document
              const collaborator = await User.findById(request.applicantId);
              
              if (collaborator && collaborator.username) {
                // Add as collaborator with appropriate permissions
                const role = request.role;
                const permission = determinePermissionLevel(role);
                
                await githubService.addCollaborator(
                  project.githubInfo.repoOwner, 
                  project.githubInfo.repoName, 
                  collaborator.username, 
                  permission
                );
                
                console.log(`Added ${collaborator.username} as collaborator to repository`);
              }
            }
          } catch (githubError) {
            console.error('Error adding collaborator to GitHub repository:', githubError);
            // Continue with the rest of the process even if GitHub integration fails
          }
        }

        if (isPricingEnabled() && applicant.plan === 'free') {
          const otherPendingRequests = await CollaborationRequest.find({
            applicantId: request.applicantId,
            status: 'pending',
            _id: { $ne: requestId }
          }).populate('projectId', 'title');
          
          // Reject all other pending requests for this free user
          if (otherPendingRequests.length > 0) {
            rejectedRequests = await Promise.all(
              otherPendingRequests.map(async (req) => {
                req.status = 'rejected';
                await req.save();
                
                // Create activity for auto-rejection
                await createCollaborationResponseActivity(
                  req.applicantId.toString(),
                  req._id.toString(),
                  "System",
                  req.projectId.title || "Project",
                  req.role,
                  'rejected'
                );
                
                return req;
              })
            );
          }
        }

        // Find all other pending requests for the same role and reject them
        const otherRequests = await CollaborationRequest.find({
          projectId: request.projectId,
          role: request.role,
          status: 'pending',
          _id: { $ne: requestId }
        });

        // Reject all other pending requests for this role
        if (otherRequests.length > 0) {
          const rejectedRoleRequests = await Promise.all(
            otherRequests.map(async (req) => {
              req.status = 'rejected';
              await req.save();
              return req;
            })
          );
          
          // Add to rejected requests list
          rejectedRequests = [...rejectedRequests, ...rejectedRoleRequests];
        }
      }
    }
    const publisher = await User.findById(userId);

    await createCollaborationResponseActivity(
      request.applicantId.toString(),
      request._id.toString(),
      publisher.name,
      project.title,
      request.role,
      status
    );

    const updatedApplicant = await User.findById(request.applicantId);
    await redis.set(applicant.githubId, JSON.stringify(updatedApplicant), 'EX', 3600);
    
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

// Helper function to determine permission level
function determinePermissionLevel(role: string): 'admin' | 'push' | 'pull' {
  // Default to write access (push)
  const lowerRole = role.toLowerCase();
  
  if (lowerRole.includes('lead') || lowerRole.includes('senior') || lowerRole.includes('architect')) {
    return 'admin';
  } else if (lowerRole.includes('reviewer') || lowerRole.includes('tester')) {
    return 'pull';
  } else {
    return 'push'; // Default write access
  }
}

// Get user's active collaborations
export const getMyCollaborations = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;
    console.log(`Getting collaborations for user ${userId}`);

    // Find accepted collaboration requests where this user is the applicant
    const acceptedRequests = await CollaborationRequest.find({
      applicantId: userId,
      status: 'accepted'
    }).populate({
      path: 'projectId',
      select: 'title subtitle technologies teamStructure teamMembers userId isPublished',
      populate: [
        {
          path: 'userId',
          select: 'name username avatar email'
        },
        {
          path: 'teamMembers.userId',
          select: 'name username avatar email'
        }
      ]
    });

    console.log(`Found ${acceptedRequests.length} accepted collaboration requests`);

    // Find all projects this user has published that have team members
    const ownedProjects = await GeneratedProject.find({
      userId,
      isPublished: true
    }).populate({
      path: 'teamMembers.userId',
      select: 'name username avatar email'
    });

    console.log(`Found ${ownedProjects.length} owned projects`);

    // Ensure proper formatting for consistent data structure
    const collaborations = [
      ...acceptedRequests.map(req => {
        console.log(`Processing collaboration for project: ${req.projectId.title}`);
        return {
          type: 'member',
          project: {
            ...req.projectId.toObject(),
            // Ensure team members are properly formatted
            teamMembers: (req.projectId.teamMembers || []).map(member => ({
              userId: member.userId,
              role: member.role,
              joinedAt: member.joinedAt
            }))
          },
          role: req.role,
          joinedAt: req.appliedAt
        };
      }),
      ...ownedProjects.map(project => {
        console.log(`Processing owned project: ${project.title}`);
        // Log team members data for debugging
        if (project.teamMembers && project.teamMembers.length > 0) {
          console.log('Team members found:', 
            project.teamMembers.map(m => ({
              userId: m.userId ? (m.userId._id || m.userId) : 'missing',
              name: m.userId?.name || 'unknown',
              role: m.role
            }))
          );
        }
        
        return {
          type: 'owner',
          project: project.toObject(),
          role: 'Project Owner',
          teamMembers: project.teamMembers || []
        };
      })
    ];

    res.status(200).json({
      success: true,
      collaborations
    });
  } catch (error: any) {
    console.error('Error fetching collaborations:', error);
    return next(new ErrorHandler(error.message || 'Failed to fetch collaborations', 500));
  }
});