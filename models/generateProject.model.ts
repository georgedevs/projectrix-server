// models/generateProject.model.ts
import mongoose, { Document, Schema } from "mongoose";

interface Role {
  title: string;
  skills: string[];
  responsibilities: string[];
  filled: boolean; // Add this property
}

interface TeamMember {
  userId: Schema.Types.ObjectId;
  role: string;
  joinedAt: Date;
}

interface TeamStructure {
  roles: Role[];
}

export interface IGeneratedProject extends Document {
  title: string;
  subtitle: string;
  description: string;
  userId: Schema.Types.ObjectId;
  technologies: string[];
  complexity: {
    level: string;
    percentage: number;
  };
  duration: {
    type: string;
    estimate: string;
  };
  teamSize: {
    type: string;
    count: string;
  };
  category: string;
  features: {
    core: string[];
    additional: string[];
  };
  teamStructure: TeamStructure;
  teamMembers?: TeamMember[];
  learningOutcomes: string[];
  isSaved: boolean;
  isPublished: boolean;
  createdAt: Date;
}

const generatedProjectSchema = new Schema<IGeneratedProject>({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  technologies: [{
    type: String,
    required: true
  }],
  complexity: {
    level: {
      type: String,
      required: true,
      enum: ['beginner', 'intermediate', 'advanced']
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    }
  },
  duration: {
    type: {
      type: String,
      required: true,
      enum: ['small', 'medium', 'large']
    },
    estimate: {
      type: String,
      required: true
    }
  },
  teamSize: {
    type: {
      type: String,
      required: true,
      enum: ['solo', 'small', 'medium']
    },
    count: {
      type: String,
      required: true
    }
  },
  category: {
    type: String,
    required: true
  },
  features: {
    core: [{
      type: String,
      required: true
    }],
    additional: [{
      type: String,
      required: true
    }]
  },
  teamStructure: {
    roles: [{
      title: {
        type: String,
        required: true
      },
      skills: [{
        type: String,
        required: true
      }],
      responsibilities: [{
        type: String,
        required: true
      }],
      filled: {
        type: Boolean,
        default: false // Default to not filled
      }
    }]
  },
  teamMembers: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  learningOutcomes: [{
    type: String,
    required: true
  }],
  isSaved: {
    type: Boolean,
    default: false
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});


const GeneratedProject = mongoose.model<IGeneratedProject>("GeneratedProject", generatedProjectSchema);

export default GeneratedProject;