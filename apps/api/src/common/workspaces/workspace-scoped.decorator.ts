import { SetMetadata } from '@nestjs/common';

export const WORKSPACE_PARAM_KEY = 'workspace_param';

/**
 * Declares that a route is workspace-scoped and names the route param holding
 * the workspace id. WorkspaceScopeGuard resolves the caller's membership for it.
 */
export const WorkspaceScoped = (paramName = 'workspaceId') =>
  SetMetadata(WORKSPACE_PARAM_KEY, paramName);