// utils/githubService.ts
import { Octokit } from '@octokit/rest';
import axios from 'axios';
import ErrorHandler from './ErrorHandler';
import GeneratedProject from '../models/generateProject.model';
import User from '../models/userModel';
import { generateProjectReadme } from './githubTemplates';
import { generateRoleBreakdowns } from './githubAIService';
import { redis } from './redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * GitHub integration service for Projectrix
 * Handles repository creation, team setup, and project structure
 */
export class GitHubService {
  private octokit: Octokit;
  private token: string;
  private username: string;
  
  /**
   * Initialize GitHub service with a user's access token
   */
  constructor(accessToken: string, username: string) {
    this.token = accessToken;
    this.username = username;
    this.octokit = new Octokit({ auth: accessToken });
  }
  
  /**
   * Create a new repository for a project
   * @param project The project data
   * @param owner The project owner user object
   * @param useOrganization Whether to use Projectrix organization or personal account
   * @param isPrivate Whether the repository should be private
   */
  async createRepository(
    project: any, 
    owner: any, 
    useOrganization: boolean = false,
    isPrivate: boolean = true
  ) {
    try {
      const repoName = this.sanitizeRepoName(project.title);
      const orgName = process.env.GITHUB_ORG_NAME || 'projectrix-org';
      
      // Determine repo owner (organization or user)
      const repoOwner = useOrganization ? orgName : this.username;
      
      // Check if repo already exists
      try {
        const { data: existingRepo } = await this.octokit.repos.get({
          owner: repoOwner,
          repo: repoName,
        });
        
        if (existingRepo) {
          console.log(`Repository ${repoOwner}/${repoName} already exists`);
          return {
            owner: repoOwner,
            name: repoName,
            html_url: existingRepo.html_url,
            exists: true
          };
        }
      } catch (error) {
        // Repo doesn't exist, continue with creation
      }
      
      // Generate repository description
      const description = `${project.subtitle} - A Projectrix generated project`;
      
      // Create the repository
      const createParams: any = {
        name: repoName,
        description: description,
        private: isPrivate,
        auto_init: false, // We'll create files manually
        has_issues: true,
        has_projects: true,
        has_wiki: true,
      };
      
      let repoResponse;
      
      if (useOrganization) {
        repoResponse = await this.octokit.repos.createInOrg({
          org: orgName,
          ...createParams
        });
      } else {
        repoResponse = await this.octokit.repos.createForAuthenticatedUser(createParams);
      }
      
      const { data: repo } = repoResponse;
      
      // Generate README and other base files
      await this.createInitialFiles(repo.owner.login, repo.name, project);
      
      // Create project board
      const projectBoard = await this.createProjectBoard(repo.owner.login, repo.name, project);
      
      // Generate role breakdowns and create issues
      const roleBreakdowns = await generateRoleBreakdowns(project);
      await this.createRoleDocuments(repo.owner.login, repo.name, roleBreakdowns);
      await this.createIssuesFromBreakdowns(repo.owner.login, repo.name, roleBreakdowns, projectBoard.id);
      
      // Setup branch protection
      await this.setupBranchProtection(repo.owner.login, repo.name);
      
      return {
        owner: repo.owner.login,
        name: repo.name,
        html_url: repo.html_url,
        exists: false
      };
    } catch (error) {
      console.error('Error creating GitHub repository:', error);
      throw new ErrorHandler(error.message || 'Failed to create GitHub repository', 500);
    }
  }
  
  /**
   * Add collaborators to the repository based on project team roles
   */
  async addCollaborators(repoOwner: string, repoName: string, collaborators: any[]) {
    try {
      const addedCollaborators = [];
      
      for (const collaborator of collaborators) {
        const permission = this.determinePermissionLevel(collaborator.role);
        
        try {
          // Get GitHub username from user document
          const user = await User.findById(collaborator.userId);
          if (!user || !user.username) {
            console.warn(`GitHub username not found for user ${collaborator.userId}`);
            continue;
          }
          
          // Skip owner if they're also listed as a collaborator
          if (user.username === this.username) {
            console.log(`Skipping repository owner ${user.username} as collaborator`);
            continue;
          }
          
          // Add collaborator to repository
          await this.octokit.repos.addCollaborator({
            owner: repoOwner,
            repo: repoName,
            username: user.username,
            permission: permission
          });
          
          addedCollaborators.push({
            username: user.username,
            permission: permission
          });
        } catch (collabError) {
          console.error(`Error adding collaborator ${collaborator.userId}:`, collabError);
          // Continue with other collaborators even if one fails
        }
      }
      
      return addedCollaborators;
    } catch (error) {
      console.error('Error adding collaborators:', error);
      throw new ErrorHandler(error.message || 'Failed to add collaborators', 500);
    }
  }
  
  /**
   * Create initial repository files including README
   */
  private async createInitialFiles(repoOwner: string, repoName: string, project: any) {
    try {
      // Generate README content
      const readmeContent = generateProjectReadme(project);
      
      // Create README.md
      await this.octokit.repos.createOrUpdateFileContents({
        owner: repoOwner,
        repo: repoName,
        path: 'README.md',
        message: 'Initial project setup by Projectrix',
        content: Buffer.from(readmeContent).toString('base64'),
        committer: {
          name: 'Projectrix Bot',
          email: process.env.GITHUB_BOT_EMAIL || 'bot@projectrix.com'
        }
      });
      
      // Create .gitignore based on project type
      const gitignoreTemplate = this.determineGitignoreTemplate(project.technologies);
      const { data: gitignoreData } = await axios.get(`https://api.github.com/gitignore/templates/${gitignoreTemplate}`);
      
      await this.octokit.repos.createOrUpdateFileContents({
        owner: repoOwner,
        repo: repoName,
        path: '.gitignore',
        message: 'Add .gitignore',
        content: Buffer.from(gitignoreData.source).toString('base64'),
        committer: {
          name: 'Projectrix Bot',
          email: process.env.GITHUB_BOT_EMAIL || 'bot@projectrix.com'
        }
      });
      
      // Create CONTRIBUTING.md
      const contributingContent = this.generateContributingGuide(project);
      
      await this.octokit.repos.createOrUpdateFileContents({
        owner: repoOwner,
        repo: repoName,
        path: 'CONTRIBUTING.md',
        message: 'Add contributing guidelines',
        content: Buffer.from(contributingContent).toString('base64'),
        committer: {
          name: 'Projectrix Bot',
          email: process.env.GITHUB_BOT_EMAIL || 'bot@projectrix.com'
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error creating initial files:', error);
      throw new ErrorHandler(error.message || 'Failed to create repository files', 500);
    }
  }
  
  /**
   * Create project board with automated columns
   */
  private async createProjectBoard(repoOwner: string, repoName: string, project: any) {
    try {
      // Create project board
      const { data: projectBoard } = await this.octokit.projects.createForRepo({
        owner: repoOwner,
        repo: repoName,
        name: `${project.title} Development`,
        body: 'Project board for tracking development progress'
      });
      
      // Create columns
      const columns = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
      
      for (const column of columns) {
        await this.octokit.projects.createColumn({
          project_id: projectBoard.id,
          name: column
        });
      }
      
      return projectBoard;
    } catch (error) {
      console.error('Error creating project board:', error);
      throw new ErrorHandler(error.message || 'Failed to create project board', 500);
    }
  }
  
  /**
   * Create role breakdown documents in the repository
   */
  private async createRoleDocuments(repoOwner: string, repoName: string, roleBreakdowns: any) {
    try {
      for (const role of Object.keys(roleBreakdowns)) {
        const roleContent = roleBreakdowns[role].document;
        const rolePath = `docs/roles/${this.sanitizeFileName(role)}.md`;
        
        // Create the roles directory if it doesn't exist
        try {
          await this.octokit.repos.createOrUpdateFileContents({
            owner: repoOwner,
            repo: repoName,
            path: 'docs/roles/.gitkeep',
            message: 'Create roles directory',
            content: Buffer.from('').toString('base64'),
            committer: {
              name: 'Projectrix Bot',
              email: process.env.GITHUB_BOT_EMAIL || 'bot@projectrix.com'
            }
          });
        } catch (dirError) {
          // Directory might already exist
        }
        
        // Create role document
        await this.octokit.repos.createOrUpdateFileContents({
          owner: repoOwner,
          repo: repoName,
          path: rolePath,
          message: `Add role breakdown for ${role}`,
          content: Buffer.from(roleContent).toString('base64'),
          committer: {
            name: 'Projectrix Bot',
            email: process.env.GITHUB_BOT_EMAIL || 'bot@projectrix.com'
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error creating role documents:', error);
      throw new ErrorHandler(error.message || 'Failed to create role documents', 500);
    }
  }
  
  /**
   * Create GitHub issues from role breakdowns
   */
  private async createIssuesFromBreakdowns(repoOwner: string, repoName: string, roleBreakdowns: any, projectId: number) {
    try {
      // Create milestone for initial sprint
      const { data: milestone } = await this.octokit.issues.createMilestone({
        owner: repoOwner,
        repo: repoName,
        title: 'Sprint 1',
        description: 'Initial project setup and core functionality',
        due_on: this.calculateMilestoneDueDate(30) // 30 days from now
      });
      
      // Create issues for each role
      for (const role of Object.keys(roleBreakdowns)) {
        const roleTasks = roleBreakdowns[role].tasks;
        
        for (const task of roleTasks) {
          // Create the issue
          const { data: issue } = await this.octokit.issues.create({
            owner: repoOwner,
            repo: repoName,
            title: task.title,
            body: task.description,
            milestone: milestone.number,
            labels: ['enhancement', role.toLowerCase().replace(/\s+/g, '-')]
          });
          
          // Try to add issue to project board
          try {
            const columns = await this.octokit.projects.listColumns({
              project_id: projectId
            });
            
            // Add to Backlog column
            const backlogColumn = columns.data.find(col => col.name === 'Backlog');
            if (backlogColumn) {
              await this.octokit.projects.createCard({
                column_id: backlogColumn.id,
                content_id: issue.id,
                content_type: 'Issue'
              });
            }
          } catch (projectError) {
            console.error('Error adding issue to project board:', projectError);
            // Continue even if project board integration fails
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error creating issues:', error);
      throw new ErrorHandler(error.message || 'Failed to create issues', 500);
    }
  }
  
  /**
   * Setup branch protection for main branch
   */
  private async setupBranchProtection(repoOwner: string, repoName: string) {
    try {
      await this.octokit.repos.updateBranchProtection({
        owner: repoOwner,
        repo: repoName,
        branch: 'main',
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: {
          required_approving_review_count: 1
        },
        restrictions: null
      });
      
      return true;
    } catch (error) {
      console.error('Error setting up branch protection:', error);
      // Don't throw error here as this is not critical
      return false;
    }
  }
  
  // Helper methods
  
  /**
   * Sanitize a project title to create a valid repository name
   */
  private sanitizeRepoName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .substring(0, 100); // Truncate to reasonable length
  }
  
  /**
   * Sanitize a role name to create a valid filename
   */
  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
  
  /**
   * Determine the appropriate permission level for a team role
   */
  private determinePermissionLevel(role: string): 'admin' | 'push' | 'pull' {
    // Default to write access (push)
    // Admin for project leads, read-only for special cases
    const lowerRole = role.toLowerCase();
    
    if (lowerRole.includes('lead') || lowerRole.includes('senior') || lowerRole.includes('architect')) {
      return 'admin';
    } else if (lowerRole.includes('reviewer') || lowerRole.includes('tester')) {
      return 'pull';
    } else {
      return 'push'; // Default write access
    }
  }
  
  /**
   * Determine the appropriate gitignore template based on technologies
   */
  private determineGitignoreTemplate(technologies: string[]): string {
    const techString = technologies.join(' ').toLowerCase();
    
    if (techString.includes('node') || techString.includes('javascript') || techString.includes('typescript')) {
      return 'Node';
    } else if (techString.includes('python') || techString.includes('django') || techString.includes('flask')) {
      return 'Python';
    } else if (techString.includes('java') || techString.includes('spring')) {
      return 'Java';
    } else if (techString.includes('ruby') || techString.includes('rails')) {
      return 'Ruby';
    } else if (techString.includes('go') || techString.includes('golang')) {
      return 'Go';
    } else if (techString.includes('c#') || techString.includes('dotnet') || techString.includes('.net')) {
      return 'VisualStudio';
    } else {
      return 'Node'; // Default to Node as it covers many web projects
    }
  }
  
  /**
   * Generate contributing guidelines for the project
   */
  private generateContributingGuide(project: any): string {
    return `# Contributing to ${project.title}

Thank you for considering contributing to this project! This document outlines the process for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: \`git clone https://github.com/YOUR-USERNAME/${this.sanitizeRepoName(project.title)}.git\`
3. Create a branch for your feature: \`git checkout -b feature/amazing-feature\`

## Development Workflow

1. Make your changes
2. Commit your changes: \`git commit -m 'Add some amazing feature'\`
3. Push to the branch: \`git push origin feature/amazing-feature\`
4. Open a Pull Request

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the documentation with details of changes if needed
3. The PR requires at least one approval from a maintainer
4. Once approved, your PR will be merged

## Code Style

Please follow the coding conventions already established in the codebase.

## Project Structure

Please refer to the README and role documentation for details about the project structure and organization.

## Role Responsibilities

Each team member has specific role responsibilities. See the \`docs/roles/\` directory for detailed breakdowns of each role.

## Communication

- Use GitHub issues for bug reports and feature requests
- Use pull requests for code review discussions
- Use the project Discord channel for real-time communication

## License

By contributing, you agree that your contributions will be licensed under the project's license.

Thank you for your contributions!`;
  }
  
  /**
   * Calculate a milestone due date given a number of days from now
   */
  private calculateMilestoneDueDate(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString();
  }
}

/**
 * Get an authenticated GitHub service instance for a user
 */
export async function getGitHubServiceForUser(userId: string): Promise<GitHubService | null> {
  try {
    // Get GitHub token from Redis or database
    const githubToken = await redis.get(`github:token:${userId}`);
    const user = await User.findById(userId);
    
    if (!githubToken || !user) {
      return null;
    }
    
    return new GitHubService(githubToken, user.username);
  } catch (error) {
    console.error('Error getting GitHub service for user:', error);
    return null;
  }
}