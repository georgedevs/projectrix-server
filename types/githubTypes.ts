/**
 * Task breakdown for project roles
 */
export interface TaskBreakdown {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    estimated_hours: number;
    dependencies: string[];
  }
  
  /**
   * Comprehensive role breakdown including documentation and tasks
   */
  export interface ProjectRoleBreakdown {
    document: string;  // Markdown document for the role
    tasks: TaskBreakdown[];  // List of actionable tasks
  }
  
  /**
   * GitHub repository information
   */
  export interface GitHubRepository {
    owner: string;
    name: string;
    html_url: string;
    exists: boolean;
  }
  
  /**
   * GitHub repository preferences
   */
  export interface GitHubRepoPreferences {
    useOrganization: boolean;
    isPrivate: boolean;
  }
  
  /**
   * GitHub collaborator information
   */
  export interface GitHubCollaborator {
    username: string;
    permission: 'admin' | 'push' | 'pull';
  }
  
  /**
   * GitHub API error response
   */
  export interface GitHubApiError {
    status: number;
    message: string;
    documentation_url?: string;
  }