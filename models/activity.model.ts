import mongoose, { Document, Model, Schema } from "mongoose";

export interface IActivity extends Document {
  userId: Schema.Types.ObjectId;
  type: 'project_generated' | 'project_published' | 'project_saved' | 'collaboration_request' | 
        'collaboration_accepted' | 'collaboration_rejected' | 'feedback_response' | 
        'team_joined' | 'profile_updated';
  message: string;
  entityId?: Schema.Types.ObjectId; // ID of related project, request, etc.
  entityType?: string; // Type of entity (project, feedback, etc.)
  entityName?: string; // Name of related entity (project title, etc.)
  read: boolean;
  createdAt: Date;
}

const activitySchema: Schema<IActivity> = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "User ID is required"]
  },
  type: {
    type: String,
    enum: [
      'project_generated', 
      'project_published', 
      'project_saved', 
      'collaboration_request', 
      'collaboration_accepted', 
      'collaboration_rejected', 
      'feedback_response',
      'team_joined',
      'profile_updated'
    ],
    required: [true, "Activity type is required"]
  },
  message: {
    type: String,
    required: [true, "Activity message is required"]
  },
  entityId: {
    type: Schema.Types.ObjectId,
    refPath: 'entityType'
  },
  entityType: {
    type: String,
    enum: ['GeneratedProject', 'CollaborationRequest', 'Feedback', 'User', null]
  },
  entityName: {
    type: String
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster queries
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ read: 1 });
activitySchema.index({ type: 1 });

const Activity: Model<IActivity> = mongoose.model("Activity", activitySchema);

export default Activity;