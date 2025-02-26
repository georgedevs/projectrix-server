import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import { redis } from '../utils/redis';
import OpenAI from 'openai';
import GeneratedProject from '../models/generateProject.model';
import { verifyFirebaseToken } from '../utils/fbauth';
import User from '../models/userModel';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function getPromptFromPreferences(preferences: any) {
  return `Generate a detailed software project idea based on the following preferences:
Technologies: ${preferences.technologies.join(', ')}
Complexity Level: ${preferences.complexity.level} (${preferences.complexity.percentage}%)
Duration: ${preferences.duration}
Team Size: ${preferences.teamSize}
Category: ${preferences.category}

The response should include:
1. A creative project title
2. A brief subtitle
3. A detailed project description
4. Core features and additional features
5. Team structure with specific roles, required skills, and responsibilities
6. Specific learning outcomes for the team

The complexity should be adjusted based on the percentage within the given level.
For ${preferences.complexity.level} level at ${preferences.complexity.percentage}%, customize the features and complexity accordingly.

Format the response in JSON with the following structure:
{
  "title": "",
  "subtitle": "",
  "description": "",
  "features": {
    "core": [],
    "additional": []
  },
  "teamStructure": {
    "roles": [
      {
        "title": "",
        "skills": [],
        "responsibilities": []
      }
    ]
  },
  "learningOutcomes": []
}`;
}




// export const generateProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
//   try {
//     console.log('\n🚀 Starting project generation...');
//     const { technologies, complexity, duration, teamSize, category } = req.body;
//     const user = req.user; // User is already authenticated and loaded by middleware

//     console.log('👤 Checking project limits for user:', user._id);
//     if (user.projectIdeasLeft <= 0) {
//       console.log('❌ No project ideas left');
//       return next(new ErrorHandler("No project ideas left. Please upgrade to Pro plan.", 403));
//     }

//     // Generate project with OpenAI
//     console.log('\n🤖 Generating OpenAI prompt...');
//     const prompt = getPromptFromPreferences({
//       technologies,
//       complexity,
//       duration,
//       teamSize,
//       category
//     });
//     console.log('Prompt:', prompt);

//     console.log('\n📡 Sending request to OpenAI...');
//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{
//         role: "user",
//         content: prompt
//       }],
//       temperature: 0.7,
//       max_tokens: 2000,
//       response_format: { type: "json_object" }
//     });

//     console.log('\n✨ OpenAI Response received');
//     const projectData = JSON.parse(completion.choices[0].message.content || "{}");

//     // Ensure the teamStructure roles have the 'filled' property
//     if (projectData.teamStructure && projectData.teamStructure.roles) {
//       projectData.teamStructure.roles = projectData.teamStructure.roles.map((role: any) => ({
//         ...role,
//         filled: false // Default to not filled
//       }));
//     }

//     // Format according to our schema
//     const fixedComplexity = {
//       level: complexity.level.toLowerCase(),
//       percentage: complexity.percentage
//     };

//     const formattedTeamSize = {
//       type: teamSize,
//       count: teamSize === 'solo' ? '1' : teamSize === 'small' ? '2-3' : '4-6'
//     };

//     const formattedDuration = {
//       type: duration,
//       estimate: duration === 'small' ? '1-2 weeks' : duration === 'medium' ? '1-2 months' : '3+ months'
//     };

//     // Create project in database
//     console.log('\n💾 Saving to database...');
//     const project = await GeneratedProject.create({
//       title: projectData.title,
//       subtitle: projectData.subtitle,
//       description: projectData.description,
//       userId: user._id,
//       technologies,
//       complexity: fixedComplexity,
//       teamSize: formattedTeamSize,
//       duration: formattedDuration,
//       category,
//       features: projectData.features,
//       teamStructure: projectData.teamStructure,
//       learningOutcomes: projectData.learningOutcomes
//     });

//     // Update user's stats
//     await User.findByIdAndUpdate(user._id, {
//       $inc: { 
//         projectIdeasLeft: -1,
//         projectsGenerated: 1  // Increment projectsGenerated
//       }
//     });

//     // Update Redis cache with new user data
//     const updatedUser = await User.findById(user._id);
//     if (updatedUser) {
//       await redis.set(user.githubId, JSON.stringify(updatedUser));
//     }
    
//     console.log('\n✅ Project generation complete!');
//     res.status(201).json({
//       success: true,
//       project,
//     });
//   } catch (error: any) {
//     console.log('\n❌ Error in project generation:', error);
//     return next(new ErrorHandler(error.message, 500));
//   }
// });
// In your generate.controller.ts
export const generateProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('\n🚀 Starting project generation...');
    const { technologies, complexity, duration, teamSize, category } = req.body;
    const user = req.user;

    console.log('👤 Checking project limits for user:', user._id);
    if (user.projectIdeasLeft <= 0) {
      console.log('❌ No project ideas left');
      return next(new ErrorHandler("No project ideas left. Please upgrade to Pro plan.", 403));
    }

    // Instead of calling OpenAI, return a mock response
    const mockProjectData = {
      title: "Task Management System",
      subtitle: "A collaborative task tracking application",
      description: "Build a modern task management system that helps teams organize and track their projects efficiently. Features real-time updates and intuitive UI.",
      teamSize: {
        type: teamSize, // This was getting overwritten
        count: teamSize === 'solo' ? '1' : teamSize === 'small' ? '2-3' : '4-6'
      },
      duration: {
        type: duration, // This was getting overwritten
        estimate: duration === 'small' ? '1-2 weeks' : duration === 'medium' ? '1-2 months' : '3+ months'
      },
      features: {
        core: [
          "User authentication and authorization",
          "Task creation and assignment",
          "Project organization and categorization",
          "Real-time updates",
          "Due date tracking"
        ],
        additional: [
          "File attachments",
          "Task commenting system",
          "Progress tracking",
          "Priority levels",
          "Search and filtering"
        ]
      },
      teamStructure: {
        roles: [
          {
            title: "Frontend Developer",
            skills: technologies.filter(tech => ["react", "nextjs", "typescript"].includes(tech)),
            responsibilities: ["Build responsive UI components", "Implement state management", "Create intuitive user interfaces"]
          },
          {
            title: "Backend Developer",
            skills: technologies.filter(tech => ["nodejs", "express", "mongodb"].includes(tech)),
            responsibilities: ["Design API architecture", "Implement database schema", "Handle authentication"]
          }
        ]
      },
      learningOutcomes: [
        "State management in complex applications",
        "Real-time data synchronization",
        "REST API design principles",
        "Database schema design",
        "Authentication and authorization implementation"
      ]
    };

    const fixedComplexity = {
      level: complexity.level.toLowerCase(), // Convert to lowercase
      percentage: complexity.percentage
    };

    // Log the data before saving
    console.log('\n📝 Project data to be saved:', {
      ...mockProjectData,
      userId: user._id,
      complexity:fixedComplexity,
      category,
      technologies
    });

    // Create project in database without spreading the request body fields
    console.log('\n💾 Saving to database...');
    const project = await GeneratedProject.create({
      title: mockProjectData.title,
      subtitle: mockProjectData.subtitle,
      description: mockProjectData.description,
      userId: user._id,
      technologies,
      complexity:fixedComplexity,
      teamSize: mockProjectData.teamSize, // Keep the nested object intact
      duration: mockProjectData.duration, // Keep the nested object intact
      category,
      features: mockProjectData.features,
      teamStructure: mockProjectData.teamStructure,
      learningOutcomes: mockProjectData.learningOutcomes
    });

  // Update user's stats
    await User.findByIdAndUpdate(user._id, {
      $inc: { 
        projectIdeasLeft: -1,
        projectsGenerated: 1  // Increment projectsGenerated
      }
    });

    // Update Redis cache with new user data
    const updatedUser = await User.findById(user._id);
    await redis.set(user.githubId, JSON.stringify(updatedUser));

    console.log('\n✅ Project generation complete!');
    res.status(201).json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.log('\n❌ Error in project generation:', error);
    return next(new ErrorHandler(error.message, 500));
  }
});
export const getGeneratedProjects = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;
    const projects = await GeneratedProject.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      projects,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});


export const generateAnother = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?._id;

    // Get the original project
    const originalProject = await GeneratedProject.findOne({ _id: projectId, userId });
    if (!originalProject) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Check user's remaining project ideas
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (user.projectIdeasLeft <= 0) {
      return next(new ErrorHandler("No project ideas left. Please upgrade to Pro plan.", 403));
    }

    // Generate new project with same preferences
    const mockProjectData = {
      title: "Task Management System",
      subtitle: "A collaborative task tracking application",
      description: "Build a modern task management system that helps teams organize and track their projects efficiently. Features real-time updates and intuitive UI.",
      teamSize: {
        type: originalProject.teamSize.type,
        count: originalProject.teamSize.type === 'solo' ? '1' : 
               originalProject.teamSize.type === 'small' ? '2-3' : '4-6'
      },
      duration: {
        type: originalProject.duration.type,
        estimate: originalProject.duration.type === 'small' ? '1-2 weeks' : 
                 originalProject.duration.type === 'medium' ? '1-2 months' : '3+ months'
      },
      features: {
        core: [
          "User authentication and authorization",
          "Task creation and assignment",
          "Project organization and categorization",
          "Real-time updates",
          "Due date tracking"
        ],
        additional: [
          "File attachments",
          "Task commenting system",
          "Progress tracking",
          "Priority levels",
          "Search and filtering"
        ]
      },
      teamStructure: {
        roles: [
          {
            title: "Frontend Developer",
            skills: originalProject.technologies.filter(tech => 
              ["react", "nextjs", "typescript"].includes(tech.toLowerCase())
            ),
            responsibilities: ["Build responsive UI components", "Implement state management", "Create intuitive user interfaces"],
            filled: false
          },
          {
            title: "Backend Developer",
            skills: originalProject.technologies.filter(tech => 
              ["nodejs", "express", "mongodb"].includes(tech.toLowerCase())
            ),
            responsibilities: ["Design API architecture", "Implement database schema", "Handle authentication"],
            filled:false
          }
        ]
      },
      learningOutcomes: [
        "State management in complex applications",
        "Real-time data synchronization",
        "REST API design principles",
        "Database schema design",
        "Authentication and authorization implementation"
      ]
    };

    // Create new project
    const newProject = await GeneratedProject.create({
      title: mockProjectData.title,
      subtitle: mockProjectData.subtitle,
      description: mockProjectData.description,
      userId,
      technologies: originalProject.technologies,
      complexity: originalProject.complexity,
      teamSize: mockProjectData.teamSize,
      duration: mockProjectData.duration,
      category: originalProject.category,
      features: mockProjectData.features,
      teamStructure: mockProjectData.teamStructure,
      learningOutcomes: mockProjectData.learningOutcomes
    });

    // Update user's remaining project ideas
    await User.findByIdAndUpdate(userId, {
      $inc: { 
        projectIdeasLeft: -1,
        projectsGenerated: 1
      }
    });

    // Update Redis cache with new user data
    const updatedUser = await User.findById(userId);
    if (updatedUser) {
      await redis.set(req.user.githubId, JSON.stringify(updatedUser));
    }

    res.status(201).json({
      success: true,
      project: newProject,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const startProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;

    // Check if project exists and belongs to user
    const project = await GeneratedProject.findOne({ _id: projectId, userId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Save the project
    project.isSaved = true;
    await project.save();

    // Update user's saved projects count if needed
    await User.findByIdAndUpdate(userId, {
      $addToSet: { 
        startedProjects: {
          projectId: project._id,
          startedAt: new Date(),
          status: 'in-progress'
        }
      }
    });

    // Update Redis cache
    const updatedUser = await User.findById(userId);
    await redis.set(req.user.githubId, JSON.stringify(updatedUser));

    res.status(200).json({
      success: true,
      message: "Project saved successfully"
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const getUserSavedProjects = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user._id;
    const projects = await GeneratedProject.find({ 
      userId,
      isSaved: true,
      isPublished: false // Only get unpublished saved projects
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      projects,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const publishProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;

    const project = await GeneratedProject.findOne({ _id: projectId, userId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    project.isPublished = true;
    await project.save();

    res.status(200).json({
      success: true,
      message: "Project published successfully"
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const submitUserProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('\n🚀 Starting user project submission...');
    const projectData = req.body;
    const user = req.user;

    // Determine complexity level based on percentage
    const complexityLevel = projectData.complexity <= 33 ? 'beginner' : 
                           projectData.complexity <= 66 ? 'intermediate' : 'advanced';
    
    // Format the teamSize
    const teamSizeType = projectData.teamSize;
    const teamSizeCount = projectData.teamSize === 'solo' ? '1' : 
                         projectData.teamSize === 'small' ? '2-3' : '4-6';
    
    // Format the duration
    const durationType = projectData.duration;
    const durationEstimate = projectData.duration === 'small' ? '1-2 weeks' : 
                            projectData.duration === 'medium' ? '1-2 months' : '3+ months';

    // Format the data to match our schema structure
    const formattedData = {
      title: projectData.title,
      subtitle: projectData.subtitle,
      description: projectData.description,
      userId: user._id,
      technologies: projectData.technologies,
      complexity: {
        level: complexityLevel,
        percentage: Number(projectData.complexity) // Ensure this is a number
      },
      teamSize: {
        type: teamSizeType,
        count: teamSizeCount
      },
      duration: {
        type: durationType,
        estimate: durationEstimate
      },
      category: projectData.category || 'web', // Default to web if not specified
      features: {
        core: projectData.features.core.filter((feature: string) => feature.trim()),
        additional: projectData.features.additional.filter((feature: string) => feature.trim())
      },
      teamStructure: {
        roles: projectData.teamStructure.roles.map((role: any) => ({
          title: role.title,
          skills: role.skills,
          responsibilities: role.responsibilities.filter((r: string) => r.trim()),
          filled: false // Default to not filled
        }))
      },
      learningOutcomes: projectData.learningOutcomes.filter((outcome: string) => outcome.trim()),
      isSaved: true, // Auto-save user submitted projects
      isPublished: false // Not published by default
    };

    // Log the data being saved
    console.log('\n📝 User project data to be saved:', JSON.stringify(formattedData, null, 2));

    // Create project in database
    console.log('\n💾 Saving to database...');
    const project = await GeneratedProject.create(formattedData);

    // Update user's stats
    await User.findByIdAndUpdate(user._id, {
      $inc: { projectsGenerated: 1 },
      $addToSet: { 
        startedProjects: {
          projectId: project._id,
          startedAt: new Date(),
          status: 'in-progress'
        }
      }
    });

    // Update Redis cache with new user data
    const updatedUser = await User.findById(user._id);
    if (updatedUser) {
      await redis.set(user.githubId, JSON.stringify(updatedUser));
    }

    console.log('\n✅ User project submission complete!');
    res.status(201).json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.log('\n❌ Error in user project submission:', error);
    return next(new ErrorHandler(error.message, 500));
  }
});