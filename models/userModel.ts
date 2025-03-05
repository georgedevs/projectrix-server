import mongoose, { Document, Model, Schema } from "mongoose";

interface IStartedProject {
  projectId: Schema.Types.ObjectId;
  startedAt: Date;
  status: 'in-progress' | 'completed' | 'abandoned';
}

interface ICollaboration {
  projectId: Schema.Types.ObjectId;
  role: string;
  joinedAt: Date;
}

export interface IUser extends Document {
  name: string;
  email: string;
  avatar: string;
  githubId: string;
  role: string;
  username: string;
  bio?: string;
  skills: string[];
  projectsGenerated: number;
  projectsCollaborated: number;
  isAvailable: boolean;
  createdAt: Date;
  plan: string;
  projectIdeasLeft: number;
  planExpiryDate?: Date;
  startedProjects: IStartedProject[];
  collaborations: ICollaboration[];
  discordId?: string;
  discordUsername?: string;
  comparePassword(password: string): Promise<boolean>;
  SignAccessToken(): string;
  SignRefreshToken(): string;
}

const userSchema: Schema<IUser> = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please enter your name"],
  },
  email: {
    type: String,
    required: [true, "Please enter your email"],
    unique: true,
    validate: {
      validator: function(email: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: "Please enter a valid email",
    },
  },
  avatar: {
    type: String,
    required: [true, "Please add an avatar"],
  },
  githubId: {
    type: String,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    default: "user",  
    enum: ["user", "admin"]  // Restrict possible values
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  bio: {
    type: String,
  },
  skills: [{
    type: String,
  }],
  projectsGenerated: {
    type: Number,
    default: 0,
  },
  projectsCollaborated: {
    type: Number,
    default: 0,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  plan: {
    type: String,
    enum: ["free", "pro"],
    default: "free"
  },
  discordId: { 
    type: String, 
    sparse: true 
  },
  discordUsername: { 
    type: String 
  },
  projectIdeasLeft: {
    type: Number,
    default: 3  // Free plan starts with 3 project ideas
  },
  planExpiryDate: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  startedProjects: [{
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'GeneratedProject'
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['in-progress', 'completed', 'abandoned'],
      default: 'in-progress'
    }
  }],
  collaborations: [{
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'GeneratedProject'
    },
    role: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }]
});

const User: Model<IUser> = mongoose.model("User", userSchema);

export default User;