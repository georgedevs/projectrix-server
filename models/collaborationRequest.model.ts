// models/collaborationRequest.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface ICollaborationRequest extends Document {
  projectId: Schema.Types.ObjectId;
  applicantId: Schema.Types.ObjectId;
  publisherId: Schema.Types.ObjectId;
  role: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  appliedAt: Date;
}

const collaborationRequestSchema: Schema<ICollaborationRequest> = new mongoose.Schema({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'GeneratedProject',
    required: [true, "Project ID is required"]
  },
  applicantId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "Applicant ID is required"]
  },
  publisherId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "Publisher ID is required"]
  },
  role: {
    type: String,
    required: [true, "Role is required"]
  },
  message: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
});

// Add index to improve query performance
collaborationRequestSchema.index({ projectId: 1, applicantId: 1 }, { unique: true });

const CollaborationRequest: Model<ICollaborationRequest> = mongoose.model("CollaborationRequest", collaborationRequestSchema);

export default CollaborationRequest;