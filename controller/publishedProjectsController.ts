// controller/publishedProjectsController.ts
import { Request, Response, NextFunction } from 'express';
import { CatchAsyncError } from '../middleware/catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import GeneratedProject from '../models/generateProject.model';
import User from '../models/userModel';

// Get all published projects with optional filtering
export const getPublishedProjects = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { technology, complexity, role } = req.query;
    
    // Base query
    const query: any = { isPublished: true };
    
    // Apply filters if provided
    if (technology) {
      query.technologies = { $in: [technology] };
    }
    
    if (complexity) {
      query['complexity.level'] = complexity;
    }
    
    if (role) {
      // Find projects that have the specified role that is not filled
      query['teamStructure.roles'] = {
        $elemMatch: { title: role, filled: false }
      };
    }
    
    // Fetch projects with populated publisher info
    const projects = await GeneratedProject.find(query)
      .populate({
        path: 'userId',
        select: 'name username avatar email',
        model: User
      })
      .sort({ createdAt: -1 });
    
    // Format response to include publisher info
    const formattedProjects = projects.map(project => {
      const { userId, ...projectData } = project.toObject();
      return {
        ...projectData,
        publisher: userId
      };
    });
    
    res.status(200).json({
      success: true,
      count: formattedProjects.length,
      projects: formattedProjects
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get a single published project by ID
export const getPublishedProject = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const project = await GeneratedProject.findOne({ _id: id, isPublished: true })
      .populate({
        path: 'userId',
        select: 'name username avatar email',
        model: User
      });
    
    if (!project) {
      return next(new ErrorHandler("Project not found or not published", 404));
    }
    
    // Format response to include publisher info
    const { userId, ...projectData } = project.toObject();
    const formattedProject = {
      ...projectData,
      publisher: userId
    };
    
    res.status(200).json({
      success: true,
      project: formattedProject
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all available technologies from published projects
export const getAvailableTechnologies = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await GeneratedProject.find({ isPublished: true });
    const technologies = new Set<string>();
    
    projects.forEach(project => {
      project.technologies.forEach(tech => technologies.add(tech));
    });
    
    res.status(200).json({
      success: true,
      technologies: Array.from(technologies)
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get all available roles from published projects
export const getAvailableRoles = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await GeneratedProject.find({ isPublished: true });
    const roles = new Set<string>();
    
    projects.forEach(project => {
      project.teamStructure.roles.forEach(role => {
        if (!role.filled) {
          roles.add(role.title);
        }
      });
    });
    
    res.status(200).json({
      success: true,
      roles: Array.from(roles)
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});