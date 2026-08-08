import type { Role } from '@pulse/shared-types';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export interface MemberDTO {
  workspaceId: string;
  userId: string;
  role: Role;
  user?: { id: string; email: string; name: string };
}

export interface SocialAccountDTO {
  id: string;
  workspaceId: string;
  platform: string;
  externalAccountId: string;
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

export interface PostVariantDTO {
  id: string;
  postId: string;
  socialAccountId: string;
  platform: string;
  contentText: string;
  mediaUrls: string[];
  scheduledAt: string | null;
  publishStatus: string;
  platformPostId: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  socialAccount?: { id: string; platform: string; displayName: string };
}

export interface PostDTO {
  id: string;
  workspaceId: string;
  status: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  variants: PostVariantDTO[];
}

export interface AuditEntryDTO {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user?: { name: string; email: string } | null;
}

export interface ConnectUrlDTO {
  url: string;
}

export interface MemberRoleResultDTO {
  workspaceId: string;
  userId: string;
  role: Role;
}
