// utils/activityUtils.ts
import { createActivity } from '../controller/activityController';

// Helper function to create project generation activity
export const createProjectGeneratedActivity = async (
  userId: string,
  projectId: string,
  projectTitle: string
) => {
  return await createActivity(
    userId,
    'project_generated',
    `You generated a new project: ${projectTitle}`,
    projectId,
    'GeneratedProject',
    projectTitle
  );
};

// Helper function to create project saved activity
export const createProjectSavedActivity = async (
  userId: string,
  projectId: string,
  projectTitle: string
) => {
  return await createActivity(
    userId,
    'project_saved',
    `You saved project: ${projectTitle}`,
    projectId,
    'GeneratedProject',
    projectTitle
  );
};

// Helper function to create project published activity
export const createProjectPublishedActivity = async (
  userId: string,
  projectId: string,
  projectTitle: string
) => {
  return await createActivity(
    userId,
    'project_published',
    `You published project: ${projectTitle}`,
    projectId,
    'GeneratedProject',
    projectTitle
  );
};

// Helper function to create collaboration request activity (for the project owner)
export const createCollaborationRequestActivity = async (
  userId: string,
  requestId: string,
  applicantName: string,
  projectTitle: string,
  role: string
) => {
  return await createActivity(
    userId,
    'collaboration_request',
    `${applicantName} applied for the ${role} role on your project: ${projectTitle}`,
    requestId,
    'CollaborationRequest',
    projectTitle
  );
};

// Helper function to create collaboration request response activity (for the applicant)
export const createCollaborationResponseActivity = async (
  userId: string,
  requestId: string,
  publisherName: string,
  projectTitle: string,
  role: string,
  status: 'accepted' | 'rejected'
) => {
  const message = status === 'accepted'
    ? `${publisherName} accepted your application for the ${role} role on: ${projectTitle}`
    : `${publisherName} rejected your application for the ${role} role on: ${projectTitle}`;
    
  return await createActivity(
    userId,
    status === 'accepted' ? 'collaboration_accepted' : 'collaboration_rejected',
    message,
    requestId,
    'CollaborationRequest',
    projectTitle
  );
};

// Helper function to create feedback response activity
export const createFeedbackResponseActivity = async (
  userId: string,
  feedbackId: string,
  feedbackTitle: string,
  status: string
) => {
  return await createActivity(
    userId,
    'feedback_response',
    `Your feedback "${feedbackTitle}" has been marked as ${status}`,
    feedbackId,
    'Feedback',
    feedbackTitle
  );
};

// Helper function to create profile update activity
export const createProfileUpdateActivity = async (
  userId: string
) => {
  return await createActivity(
    userId,
    'profile_updated',
    'You updated your profile information',
    userId,
    'User'
  );
};