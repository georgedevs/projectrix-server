import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUserProfile extends Document {
  userId: Schema.Types.ObjectId;
  bio: string;
  skills: string[];
  website: string;
  githubProfile: string;
  twitterProfile: string;
  linkedinProfile: string;
  availability: string;
  hoursPerWeek: string;
  preferredTechnologies: string[];
  preferredRoles: string[];
  publicEmail: boolean;
}

const userProfileSchema: Schema<IUserProfile> = new mongoose.Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "User ID is required"],
    unique: true
  },
  bio: {
    type: String,
    default: ""
  },
  skills: [{
    type: String
  }],
  website: {
    type: String,
    default: ""
  },
  githubProfile: {
    type: String,
    default: ""
  },
  twitterProfile: {
    type: String,
    default: ""
  },
  linkedinProfile: {
    type: String,
    default: ""
  },
  availability: {
    type: String,
    enum: ['available', 'limited', 'unavailable'],
    default: 'available'
  },
  hoursPerWeek: {
    type: String,
    default: "10-20 hours"
  },
  preferredTechnologies: [{
    type: String
  }],
  preferredRoles: [{
    type: String
  }],
  publicEmail: {
    type: Boolean,
    default: false
  }
});

const UserProfile: Model<IUserProfile> = mongoose.model("UserProfile", userProfileSchema);

export default UserProfile;