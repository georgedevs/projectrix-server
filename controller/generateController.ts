import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import { redis } from '../utils/redis';
import OpenAI from 'openai';
import GeneratedProject from '../models/generateProject.model';
import { verifyFirebaseToken } from '../utils/fbauth';
import User from '../models/userModel';
import {
  createProjectGeneratedActivity,
  createProjectSavedActivity,
  createProjectPublishedActivity
} from '../utils/activityUtils';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate an optimized prompt for OpenAI based on user preferences
 */
function getOptimizedPrompt(preferences: any) {
  // Extract preferences
  const { technologies, complexity, duration, teamSize, category, projectTheme } = preferences;
  
  // Generate duration text
  const durationText = duration === 'small' ? 'short-term (1-2 weeks)' : 
                      duration === 'medium' ? 'medium-term (1-2 months)' : 
                      'long-term (3+ months)';
  
  // Generate team size text
  const teamSizeText = teamSize === 'solo' ? 'one developer' : 
                      teamSize === 'small' ? '2-3 team members' : 
                      '4-6 team members';
  
  // Format technologies list if provided
  const techList = technologies && technologies.length > 0 
    ? `specifically using these technologies: ${technologies.join(', ')}`
    : 'using appropriate technologies for this type of project';
  
  // Add theme context if provided
  const themeContext = projectTheme 
    ? `The theme of the project should be related to "${projectTheme}".`
    : 'The project should be practical, innovative, and educational.';
  
  // Generate category-specific guidance
  const categoryGuidance = getCategorySpecificGuidance(category, technologies);
  
  // Build the main prompt
  return `Generate a detailed, practical, and innovative ${category} project idea for a ${complexity.level} level (${complexity.percentage}% complexity) team of ${teamSizeText}, estimated to take ${durationText} to complete, ${techList}.

${themeContext}

${categoryGuidance}

Make sure the project is:
1. Practical and realistic to implement within the given timeframe and team size
2. Educational and helps team members grow their skills
3. Appropriately scoped for the complexity level (${complexity.level})
4. Well-structured with clear responsibilities for each team role
5. Detailed enough to start implementation with clear requirements

The response should include:
1. A creative and descriptive project title
2. A concise subtitle that summarizes the project
3. A detailed project description (at least 100 words)
4. Core features (must-have functionality)
5. Additional features (nice-to-have extensions)
6. Team structure with specific roles, required skills for each role, and their responsibilities
7. Learning outcomes for the team members

Format the response in JSON with the following structure EXACTLY:
{
  "title": "Project Title",
  "subtitle": "Brief project summary",
  "description": "Detailed project description...",
  "features": {
    "core": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
    "additional": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"]
  },
  "teamStructure": {
    "roles": [
      {
        "title": "Role Title",
        "skills": ["Skill 1", "Skill 2", "Skill 3"],
        "responsibilities": ["Responsibility 1", "Responsibility 2", "Responsibility 3"]
      }
    ]
  },
  "learningOutcomes": ["Learning Outcome 1", "Learning Outcome 2", "Learning Outcome 3", "Learning Outcome 4", "Learning Outcome 5"]
}

Ensure the JSON is properly formatted and can be parsed.`;
}

/**
 * Provide category-specific guidance based on project type
 */
function getCategorySpecificGuidance(category: string, technologies: string[]) {
  switch (category) {
    case 'web':
      return `For this web application project:
- Consider both frontend and backend components
- Include user authentication and data management features
- Think about UI/UX and responsive design
- Consider deployment and scalability aspects`;

    case 'mobile':
      return `For this mobile app project:
- Consider platform-specific features (iOS/Android)
- Include offline functionality where appropriate
- Consider battery and data usage optimization
- Think about intuitive mobile-friendly UI design`;

    case 'ai':
      return `For this AI/ML project:
- Specify the AI/ML models or techniques to be used
- Include data collection, processing, and validation steps
- Consider model training, evaluation, and deployment processes
- Think about ethical implications and bias mitigation`;

    case 'game':
      return `For this game development project:
- Define game mechanics, characters, and storyline
- Include graphics, sound, and UI elements
- Consider level design and progression
- Think about performance optimization for target platforms`;

    case 'data':
      return `For this data science project:
- Include data collection, cleaning, and preprocessing steps
- Specify analysis methods and visualization techniques
- Consider insights generation and reporting
- Think about deployment of interactive dashboards or reports`;

    default:
      return `For this project:
- Define clear scope and objectives
- Include technical requirements and constraints
- Consider user needs and experience
- Think about deployment and maintenance`;
  }
}

/**
 * Validate if the selected technologies make sense for the chosen category
 */
function validateTechnologyCategoryPair(technologies: string[], category: string): { valid: boolean; message: string } {
  // If no technologies are selected, it's always valid
  if (!technologies || technologies.length === 0) {
    return { valid: true, message: "" };
  }

  // Define category-specific technology groups
  const categoryTechGroups = {
    web: ['react', 'angular', 'vue', 'svelte', 'nextjs', 'html5', 'css3', 'javascript', 'typescript', 
          'nodejs', 'express', 'django', 'flask', 'php', 'laravel', 'ruby', 'rails', 'mongodb', 
          'postgresql', 'mysql', 'firebase', 'graphql', 'tailwindcss', 'bootstrap'],
    
    mobile: ['react', 'reactnative', 'flutter', 'swift', 'kotlin', 'java', 'javascript', 'typescript',
             'firebase', 'redux', 'sqlite', 'mongodb', 'nodejs'],
    
    ai: ['python', 'tensorflow', 'pytorch', 'scikit-learn', 'numpy', 'pandas', 'jupyter',
         'r', 'julia', 'keras', 'opencv', 'nltk', 'spacy', 'huggingface'],
    
    game: ['unity', 'unreal', 'godot', 'threejs', 'webgl', 'c#', 'c++', 'javascript', 'python',
           'playcanvas', 'pixijs', 'phaser'],
    
    data: ['python', 'r', 'julia', 'sql', 'tableau', 'powerbi', 'pandas', 'numpy', 'matplotlib',
           'seaborn', 'plotly', 'scikit-learn', 'jupyter', 'spark', 'hadoop', 'excel', 'postgresql',
           'mysql', 'mongodb', 'bigquery']
  };
  
  // Check if any selected technology is invalid for the chosen category
  const invalidTechs = technologies.filter(tech => {
    // Convert to lowercase for case-insensitive comparison
    const techLower = tech.toLowerCase();
    
    // Check if the technology exists in the category's tech group
    return !categoryTechGroups[category]?.some(validTech => 
      validTech.toLowerCase() === techLower ||
      techLower.includes(validTech.toLowerCase()) || // Check if tech contains valid tech name
      validTech.includes(techLower) // Check if valid tech contains the tech name
    );
  });
  
  if (invalidTechs.length > 0) {
    return { 
      valid: false, 
      message: `The following technologies may not be suitable for ${category} development: ${invalidTechs.join(', ')}. Please reconsider your selection or choose a different category.`
    };
  }
  
  return { valid: true, message: "" };
}

/**
 * Extract technologies from AI response if user didn't specify any
 */
function extractTechnologiesFromResponse(projectData: any, category: string): string[] {
  // Collect all technologies mentioned in the roles
  const mentionedTechs = new Set<string>();
  
  // Check team structure roles for mentioned technologies
  if (projectData.teamStructure && projectData.teamStructure.roles) {
    projectData.teamStructure.roles.forEach((role: any) => {
      if (role.skills && Array.isArray(role.skills)) {
        role.skills.forEach((skill: string) => {
          // Only add if it looks like a technology (not a soft skill)
          if (isTechnologySkill(skill)) {
            mentionedTechs.add(skill);
          }
        });
      }
    });
  }
  
  // If no technologies are found, provide defaults based on category
  if (mentionedTechs.size === 0) {
    switch (category) {
      case 'web':
        return ['React', 'Node.js', 'Express', 'MongoDB'];
      case 'mobile':
        return ['React Native', 'JavaScript', 'Firebase'];
      case 'ai':
        return ['Python', 'TensorFlow', 'Scikit-learn'];
      case 'game':
        return ['Unity', 'C#'];
      case 'data':
        return ['Python', 'Pandas', 'Matplotlib'];
      default:
        return ['JavaScript', 'HTML', 'CSS'];
    }
  }
  
  return Array.from(mentionedTechs);
}

/**
 * Check if a skill is likely a technology rather than a soft skill
 */
function isTechnologySkill(skill: string): boolean {
  // Common soft skills to exclude
  const softSkills = [
    'communication', 'teamwork', 'leadership', 'problem solving', 
    'time management', 'creativity', 'critical thinking', 'organization',
    'collaboration', 'adaptability', 'project management', 'attention to detail'
  ];
  
  const lowerSkill = skill.toLowerCase();
  
  // Check if it's a soft skill
  if (softSkills.some(softSkill => lowerSkill.includes(softSkill))) {
    return false;
  }
  
  // Common technology indicators
  const techIndicators = [
    '.js', 'sql', 'html', 'css', 'java', 'python', 'react', 'angular', 'vue', 
    'node', 'express', 'django', 'flask', 'spring', 'boot', 'ruby', 'rails',
    'php', 'laravel', 'go', 'rust', 'c#', 'c++', 'typescript', 'mongo', 'postgres',
    'mysql', 'redis', 'firebase', 'aws', 'azure', 'google cloud', 'docker', 
    'kubernetes', 'git', 'ci/cd', 'webpack', 'vite', 'unity', 'unreal', 'threejs'
  ];
  
  // Check if it contains tech indicators
  return techIndicators.some(indicator => lowerSkill.includes(indicator));
}


/**
 * Determine if a user-submitted project needs AI enhancement
 */
function shouldEnhanceProject(projectData: any): boolean {
  // Check if description is too short
  const hasShortDescription = !projectData.description || projectData.description.length < 100;
  
  // Check if features are missing or too few
  const hasFewFeatures = !projectData.features || 
                        !projectData.features.core || projectData.features.core.length < 3 ||
                        !projectData.features.additional || projectData.features.additional.length < 2;
  
  // Check if learning outcomes are missing or too few
  const hasFewOutcomes = !projectData.learningOutcomes || projectData.learningOutcomes.length < 3;
  
  // Check if roles have missing details
  const hasIncompleteRoles = !projectData.teamStructure || !projectData.teamStructure.roles || 
                           projectData.teamStructure.roles.some((role: any) => 
                             !role.title || 
                             !role.skills || role.skills.length === 0 ||
                             !role.responsibilities || role.responsibilities.length === 0);
  
  return hasShortDescription || hasFewFeatures || hasFewOutcomes || hasIncompleteRoles;
}

/**
 * Enhance a user-submitted project with AI-generated content
 */
async function enhanceProjectWithAI(projectData: any): Promise<any> {
  try {
    // Build a prompt describing what needs to be enhanced
    const enhancementPrompt = `Please enhance the following project submission while preserving its core concept and user intent. Fill in missing details and expand as needed:
    
Project Title: ${projectData.title || "Not provided"}
Project Subtitle: ${projectData.subtitle || "Not provided"}
Project Description: ${projectData.description || "Not provided"}
Technologies: ${projectData.technologies?.join(', ') || "Not specified"}
Project Category: ${projectData.category || "Not specified"}

Core Features: ${projectData.features?.core?.join(', ') || "Not provided"}
Additional Features: ${projectData.features?.additional?.join(', ') || "Not provided"}

Team Structure:
${projectData.teamStructure?.roles?.map((role: any) => 
  `- ${role.title || "Unnamed role"} (Skills: ${role.skills?.join(', ') || "None specified"}, Responsibilities: ${role.responsibilities?.join(', ') || "None specified"})`
).join('\n') || "Not provided"}

Learning Outcomes: ${projectData.learningOutcomes?.join(', ') || "Not provided"}

Enhance this project by:
1. Expanding the description to be detailed and compelling
2. Ensuring at least 5 core features and 5 additional features that make sense for the project
3. Ensuring each role has a clear title, at least 3 relevant skills, and 3 specific responsibilities
4. Providing at least 5 meaningful learning outcomes
5. Maintaining the original concept, technologies, and intent

Return the enhanced project in this exact JSON format:
{
  "title": "Project Title",
  "subtitle": "Brief project summary",
  "description": "Detailed project description...",
  "features": {
    "core": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
    "additional": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"]
  },
  "teamStructure": {
    "roles": [
      {
        "title": "Role Title",
        "skills": ["Skill 1", "Skill 2", "Skill 3"],
        "responsibilities": ["Responsibility 1", "Responsibility 2", "Responsibility 3"]
      }
    ]
  },
  "learningOutcomes": ["Learning Outcome 1", "Learning Outcome 2", "Learning Outcome 3", "Learning Outcome 4", "Learning Outcome 5"]
}`;

    console.log('\n📡 Sending enhancement request to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{
        role: "system",
        content: "You are an expert software architect and creative project planner. Your role is to enhance user-submitted project details while maintaining the original concept and intent."
      }, {
        role: "user",
        content: enhancementPrompt
      }],
      temperature: 0.5, // Lower temperature for more consistent enhancements
      max_tokens: 2500,
      response_format: { type: "json_object" }
    });

    console.log('\n✨ Enhancement response received');
    
    try {
      const enhancedData = JSON.parse(completion.choices[0].message.content || "{}");
      
      // Merge the enhanced data with the original, prioritizing original values where they exist
      const mergedData = {
        title: projectData.title || enhancedData.title,
        subtitle: projectData.subtitle || enhancedData.subtitle,
        description: enhancedData.description || projectData.description, // Prefer enhanced description
        technologies: projectData.technologies || [], // Keep original technologies
        complexity: projectData.complexity,
        teamSize: projectData.teamSize,
        duration: projectData.duration,
        category: projectData.category,
        features: {
          core: enhancedData.features?.core || projectData.features?.core || [],
          additional: enhancedData.features?.additional || projectData.features?.additional || []
        },
        teamStructure: {
          roles: mergeRoles(projectData.teamStructure?.roles || [], enhancedData.teamStructure?.roles || [])
        },
        learningOutcomes: enhancedData.learningOutcomes || projectData.learningOutcomes || []
      };
      
      return mergedData;
    } catch (parseError) {
      console.error('Error parsing enhancement response:', parseError);
      // If enhancement fails, return the original data
      return projectData;
    }
  } catch (error) {
    console.error('Error enhancing project with AI:', error);
    // If any error occurs, return the original data
    return projectData;
  }
}

/**
 * Merge original and enhanced roles, keeping original data where present
 */
function mergeRoles(originalRoles: any[], enhancedRoles: any[]): any[] {
  // If original has no roles, use enhanced roles
  if (!originalRoles || originalRoles.length === 0) {
    return enhancedRoles;
  }
  
  // If enhanced has no roles, use original roles
  if (!enhancedRoles || enhancedRoles.length === 0) {
    return originalRoles;
  }
  
  // Start with all original roles
  const mergedRoles = [...originalRoles];
  
  // For each original role, enhance it if possible
  for (let i = 0; i < mergedRoles.length; i++) {
    const originalRole = mergedRoles[i];
    
    // Find a matching enhanced role by title (or the first one if no match)
    const matchingEnhancedRole = enhancedRoles.find(role => 
      role.title.toLowerCase() === originalRole.title.toLowerCase()
    ) || enhancedRoles[0];
    
    // Merge in enhanced data where original is missing
    if (matchingEnhancedRole) {
      mergedRoles[i] = {
        title: originalRole.title || matchingEnhancedRole.title,
        skills: originalRole.skills?.length > 0 ? originalRole.skills : matchingEnhancedRole.skills,
        responsibilities: originalRole.responsibilities?.length > 0 ? originalRole.responsibilities : matchingEnhancedRole.responsibilities
      };
    }
  }
  
  // If original has fewer roles than enhanced, add the additional enhanced roles
  if (originalRoles.length < enhancedRoles.length) {
    // Get titles of original roles
    const originalTitles = originalRoles.map(role => role.title.toLowerCase());
    
    // Add enhanced roles that don't have a title match in original roles
    enhancedRoles.forEach(enhancedRole => {
      if (!originalTitles.includes(enhancedRole.title.toLowerCase())) {
        mergedRoles.push(enhancedRole);
      }
    });
  }
  
  return mergedRoles;
}

export const generateProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('\n🚀 Starting project generation with AI...');
    const { technologies, complexity, duration, teamSize, category, projectTheme } = req.body;
    const user = req.user;

    console.log('👤 Checking project limits for user:', user._id);
    if (user.projectIdeasLeft <= 0 && user.plan !== "pro") {
      console.log('❌ No project ideas left');
      return next(new ErrorHandler("No project ideas left. Please upgrade to Pro plan.", 403));
    }

    // Validate technology and category combinations
    const validationResult = validateTechnologyCategoryPair(technologies, category);
    if (!validationResult.valid) {
      return next(new ErrorHandler(validationResult.message, 400));
    }

    // Generate project with OpenAI
    console.log('\n🤖 Generating OpenAI prompt...');
    const prompt = getOptimizedPrompt({
      technologies,
      complexity,
      duration,
      teamSize,
      category,
      projectTheme
    });
    
    console.log('📝 Prompt created for OpenAI');

    console.log('\n📡 Sending request to OpenAI...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Using the latest model for best results
      messages: [{
        role: "system",
        content: "You are an expert software architect and creative project planner. Your role is to generate detailed, innovative, and practical software project ideas based on user requirements."
      }, {
        role: "user",
        content: prompt
      }],
      temperature: 0.7,
      max_tokens: 2500,
      response_format: { type: "json_object" }
    });

    console.log('\n✨ OpenAI Response received');
    let projectData;
    
    try {
      projectData = JSON.parse(completion.choices[0].message.content || "{}");
      
      // Validate that the response has all required fields
      const requiredFields = ["title", "subtitle", "description", "features", "teamStructure", "learningOutcomes"];
      for (const field of requiredFields) {
        if (!projectData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      // Validate nested structures
      if (!projectData.features.core || !projectData.features.additional) {
        throw new Error("Invalid features structure");
      }
      
      if (!projectData.teamStructure.roles || !Array.isArray(projectData.teamStructure.roles)) {
        throw new Error("Invalid team structure");
      }
    } catch (parseError) {
      console.error('Error parsing or validating OpenAI response:', parseError);
      return next(new ErrorHandler("Failed to generate a valid project. Please try again.", 500));
    }

    // Ensure the teamStructure roles have the 'filled' property
    if (projectData.teamStructure && projectData.teamStructure.roles) {
      projectData.teamStructure.roles = projectData.teamStructure.roles.map((role: any) => ({
        ...role,
        filled: false // Default to not filled
      }));
    }

    // Format according to our schema
    const fixedComplexity = {
      level: complexity.level.toLowerCase(),
      percentage: complexity.percentage
    };

    const formattedTeamSize = {
      type: teamSize,
      count: teamSize === 'solo' ? '1' : teamSize === 'small' ? '2-3' : '4-6'
    };

    const formattedDuration = {
      type: duration,
      estimate: duration === 'small' ? '1-2 weeks' : duration === 'medium' ? '1-2 months' : '3+ months'
    };

    // Ensure technologies are included in the project
    const projectTechnologies = technologies.length > 0 ? technologies : 
      extractTechnologiesFromResponse(projectData, category);

    // Create project in database
    console.log('\n💾 Saving to database...');
    const project = await GeneratedProject.create({
      title: projectData.title,
      subtitle: projectData.subtitle,
      description: projectData.description,
      userId: user._id,
      technologies: projectTechnologies,
      complexity: fixedComplexity,
      teamSize: formattedTeamSize,
      duration: formattedDuration,
      category,
      features: projectData.features,
      teamStructure: projectData.teamStructure,
      learningOutcomes: projectData.learningOutcomes
    });

    // Create activity for project generation
    await createProjectGeneratedActivity(
      user._id.toString(),
      project._id.toString(),
      project.title
    );

    // Update user's stats - only decrement for free users
    if (user.plan !== "pro") {
      await User.findByIdAndUpdate(user._id, {
        $inc: { 
          projectIdeasLeft: -1,
          projectsGenerated: 1
        }
      });
    } else {
      // For pro users, just increment the generated count
      await User.findByIdAndUpdate(user._id, {
        $inc: { projectsGenerated: 1 }
      });
    }

    // Update Redis cache with new user data
    const updatedUser = await User.findById(user._id);
    if (updatedUser) {
      await redis.set(user.githubId, JSON.stringify(updatedUser));
    }
    
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

    if (user.projectIdeasLeft <= 0 && user.plan !== "pro") {
      return next(new ErrorHandler("No project ideas left. Please upgrade to Pro plan.", 403));
    }

    // Create preferences object from original project
    const preferences = {
      technologies: originalProject.technologies,
      complexity: originalProject.complexity,
      duration: originalProject.duration.type,
      teamSize: originalProject.teamSize.type,
      category: originalProject.category,
      // Add a note requesting a different project
      projectTheme: "Please generate a different project than before, with a fresh concept and approach."
    };

    // Generate new project with OpenAI
    console.log('\n🤖 Generating OpenAI prompt for new project variation...');
    const prompt = getOptimizedPrompt(preferences);
    
    console.log('\n📡 Sending request to OpenAI...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{
        role: "system",
        content: "You are an expert software architect and creative project planner. Your role is to generate detailed, innovative, and practical software project ideas based on user requirements. Create a different project than what might have been generated before."
      }, {
        role: "user",
        content: prompt
      }],
      temperature: 0.8, // Slightly higher temperature for more variation
      max_tokens: 2500,
      response_format: { type: "json_object" }
    });

    console.log('\n✨ OpenAI Response received');
    let projectData;
    
    try {
      projectData = JSON.parse(completion.choices[0].message.content || "{}");
      
      // Validate that the response has all required fields
      const requiredFields = ["title", "subtitle", "description", "features", "teamStructure", "learningOutcomes"];
      for (const field of requiredFields) {
        if (!projectData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      // Validate nested structures
      if (!projectData.features.core || !projectData.features.additional) {
        throw new Error("Invalid features structure");
      }
      
      if (!projectData.teamStructure.roles || !Array.isArray(projectData.teamStructure.roles)) {
        throw new Error("Invalid team structure");
      }
    } catch (parseError) {
      console.error('Error parsing or validating OpenAI response:', parseError);
      return next(new ErrorHandler("Failed to generate a valid project. Please try again.", 500));
    }

    // Ensure the teamStructure roles have the 'filled' property
    if (projectData.teamStructure && projectData.teamStructure.roles) {
      projectData.teamStructure.roles = projectData.teamStructure.roles.map((role: any) => ({
        ...role,
        filled: false // Default to not filled
      }));
    }

    // Create new project
    const newProject = await GeneratedProject.create({
      title: projectData.title,
      subtitle: projectData.subtitle,
      description: projectData.description,
      userId,
      technologies: originalProject.technologies,
      complexity: originalProject.complexity,
      teamSize: originalProject.teamSize,
      duration: originalProject.duration,
      category: originalProject.category,
      features: projectData.features,
      teamStructure: projectData.teamStructure,
      learningOutcomes: projectData.learningOutcomes
    });

    // Create activity for project generation
    await createProjectGeneratedActivity(
      userId.toString(),
      newProject._id.toString(),
      newProject.title
    );

    // Update user's stats - only decrement for free users
    if (user.plan !== "pro") {
      await User.findByIdAndUpdate(userId, {
        $inc: { 
          projectIdeasLeft: -1,
          projectsGenerated: 1
        }
      });
    } else {
      // For pro users, just increment the generated count
      await User.findByIdAndUpdate(userId, {
        $inc: { projectsGenerated: 1 }
      });
    }

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
    console.error('Error generating another project:', error);
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

    await createProjectSavedActivity(
      req.user._id.toString(),
      projectId,
      project.title
    );

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
    const { selectedRole } = req.body; // Make sure this is being received correctly
    const userId = req.user._id;

    console.log('Publishing project with selected role:', selectedRole); // Add logging

    // Find the project
    const project = await GeneratedProject.findOne({ _id: projectId, userId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // If the project is already published, return error
    if (project.isPublished) {
      return next(new ErrorHandler("Project is already published", 400));
    }

    // Set the project as published
    project.isPublished = true;

    // Handle role selection properly
    if (selectedRole && project.teamStructure && project.teamStructure.roles) {
      const roleIndex = project.teamStructure.roles.findIndex(role => role.title === selectedRole);
      
      if (roleIndex !== -1) {
        // Mark the selected role as filled
        project.teamStructure.roles[roleIndex].filled = true;
        
        // Add the user as a team member with the selected role
        if (!project.teamMembers) {
          project.teamMembers = [];
        }
        
        project.teamMembers.push({
          userId,
          role: selectedRole,
          joinedAt: new Date()
        });
      }
    }

    // Save the project
    await project.save();

    await createProjectPublishedActivity(
      req.user._id.toString(),
      projectId,
      project.title
    );

    res.status(200).json({
      success: true,
      message: "Project published successfully",
      project
    });
  } catch (error: any) {
    console.error('Error publishing project:', error); // Add error logging
    return next(new ErrorHandler(error.message, 500));
  }
});

export const submitUserProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('\n🚀 Starting user project submission with AI enhancement...');
    const projectData = req.body;
    const user = req.user;

    // Check if the project needs AI enhancement
    const needsEnhancement = shouldEnhanceProject(projectData);
    let enhancedData = { ...projectData };

    if (needsEnhancement) {
      console.log('📝 Project needs enhancement, calling AI...');
      enhancedData = await enhanceProjectWithAI(projectData);
    }

    // Determine complexity level based on percentage
    const complexityLevel = enhancedData.complexity <= 33 ? 'beginner' : 
                           enhancedData.complexity <= 66 ? 'intermediate' : 'advanced';
    
    // Format the teamSize
    const teamSizeType = enhancedData.teamSize;
    const teamSizeCount = enhancedData.teamSize === 'solo' ? '1' : 
                         enhancedData.teamSize === 'small' ? '2-3' : '4-6';
    
    // Format the duration
    const durationType = enhancedData.duration;
    const durationEstimate = enhancedData.duration === 'small' ? '1-2 weeks' : 
                            enhancedData.duration === 'medium' ? '1-2 months' : '3+ months';

    // Format the data to match our schema structure
    const formattedData = {
      title: enhancedData.title,
      subtitle: enhancedData.subtitle || "", // Ensure subtitle has a default value
      description: enhancedData.description,
      userId: user._id,
      technologies: enhancedData.technologies || [],
      complexity: {
        level: complexityLevel,
        percentage: Number(enhancedData.complexity) // Ensure this is a number
      },
      teamSize: {
        type: teamSizeType,
        count: teamSizeCount
      },
      duration: {
        type: durationType,
        estimate: durationEstimate
      },
      category: enhancedData.category || 'web', // Default to web if not specified
      features: {
        core: enhancedData.features?.core?.filter((feature: string) => feature.trim()) || [],
        additional: enhancedData.features?.additional?.filter((feature: string) => feature.trim()) || []
      },
      teamStructure: {
        roles: enhancedData.teamStructure?.roles?.map((role: any) => ({
          title: role.title || "",
          skills: role.skills || [],
          responsibilities: role.responsibilities?.filter((r: string) => r.trim()) || [],
          filled: false // Default to not filled
        })) || []
      },
      learningOutcomes: enhancedData.learningOutcomes?.filter((outcome: string) => outcome.trim()) || [],
      isSaved: true, // Auto-save user submitted projects
      isPublished: false // Not published by default
    };

    // Log the data being saved
    console.log('\n📝 User project data to be saved:', JSON.stringify(formattedData, null, 2));

    // Create project in database
    console.log('\n💾 Saving to database...');
    const project = await GeneratedProject.create(formattedData);

    // Create activity for project saving
    await createProjectSavedActivity(
      user._id.toString(),
      project._id.toString(),
      project.title
    );

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

export const editProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('\n🔄 Starting project update...');
    const { projectId } = req.params;
    const userId = req.user._id;
    
    const projectData = req.body;

    // Check if project exists and belongs to user
    const project = await GeneratedProject.findOne({ _id: projectId, userId });
    if (!project) {
      return next(new ErrorHandler("Project not found", 404));
    }

    // Check if project is published - don't allow editing published projects
    if (project.isPublished) {
      return next(new ErrorHandler("Published projects cannot be edited", 403));
    }

    // Process the updates
    const updatedProject = {
      title: projectData.title || project.title,
      subtitle: projectData.subtitle || project.subtitle,
      description: projectData.description || project.description,
      technologies: projectData.technologies || project.technologies,
      complexity: projectData.complexity ? {
        level: projectData.complexity.level || project.complexity.level,
        percentage: projectData.complexity.percentage || project.complexity.percentage
      } : project.complexity,
      teamSize: projectData.teamSize ? {
        type: projectData.teamSize.type || project.teamSize.type,
        count: projectData.teamSize.count || project.teamSize.count
      } : project.teamSize,
      duration: projectData.duration ? {
        type: projectData.duration.type || project.duration.type,
        estimate: projectData.duration.estimate || project.duration.estimate
      } : project.duration,
      category: projectData.category || project.category,
      features: projectData.features ? {
        core: projectData.features.core || project.features.core,
        additional: projectData.features.additional || project.features.additional
      } : project.features,
      teamStructure: projectData.teamStructure ? {
        roles: projectData.teamStructure.roles.map((role: any, index: number) => ({
          title: role.title || (project.teamStructure.roles[index] ? project.teamStructure.roles[index].title : ""),
          skills: role.skills || (project.teamStructure.roles[index] ? project.teamStructure.roles[index].skills : []),
          responsibilities: role.responsibilities || (project.teamStructure.roles[index] ? project.teamStructure.roles[index].responsibilities : []),
          filled: role.filled !== undefined ? role.filled : 
                 (project.teamStructure.roles[index] ? project.teamStructure.roles[index].filled : false)
        }))
      } : project.teamStructure,
      learningOutcomes: projectData.learningOutcomes || project.learningOutcomes
    };

    // Update the project
    console.log('\n📝 Updating project data in database...');
    const result = await GeneratedProject.findByIdAndUpdate(
      projectId,
      updatedProject,
      { new: true, runValidators: true }
    );

    console.log('\n✅ Project update complete!');
    res.status(200).json({
      success: true,
      project: result,
      message: "Project updated successfully"
    });
  } catch (error: any) {
    console.log('\n❌ Error in project update:', error);
    return next(new ErrorHandler(error.message, 500));
  }
});