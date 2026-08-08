import type { User } from '@prisma/client';
import type { Role } from '@pulse/shared-types';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User {
      id: string;
      email: string;
      name: string;
      createdAt: Date;
    }

    interface Request {
      /** Authenticated actor (set by JwtAuthGuard via passport strategy). */
      user: Express.User;
      /** Resolved by WorkspaceScopeGuard for workspace-scoped routes. */
      membership: { workspaceId: string; role: Role };
      /** Workspace row attached by WorkspaceScopeGuard. */
      workspace: { id: string; name: string; plan: string; createdAt: Date };
    }
  }
}

export type { User };
