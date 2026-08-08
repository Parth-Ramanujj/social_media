/**
 * Types shared between the API and web apps.
 * Keep this dependency-free: it is consumed as raw TS source via pnpm workspace symlink.
 */

export const PLATFORMS = [
  'meta',
  'x',
  'linkedin',
  'youtube',
  'pinterest',
  'tiktok',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const POST_STATUSES = [
  'draft',
  'queued',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const PUBLISH_STATUSES = [
  'pending',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export const ACCOUNT_STATUSES = ['connected', 'needs_reconnect', 'disconnected'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const INBOX_MESSAGE_TYPES = ['comment', 'dm'] as const;
export type InboxMessageType = (typeof INBOX_MESSAGE_TYPES)[number];

export const INBOX_MESSAGE_STATUSES = ['unassigned', 'assigned', 'resolved'] as const;
export type InboxMessageStatus = (typeof INBOX_MESSAGE_STATUSES)[number];

/** Character limits enforced by each platform, used by the composer. */
export const PLATFORM_LIMITS: Record<Platform, { text: number; maxMedia: number; maxHashtags: number }> = {
  meta: { text: 63206, maxMedia: 10, maxHashtags: 30 },
  x: { text: 280, maxMedia: 4, maxHashtags: 50 },
  linkedin: { text: 3000, maxMedia: 9, maxHashtags: 5 },
  youtube: { text: 5000, maxMedia: 1, maxHashtags: 15 },
  pinterest: { text: 500, maxMedia: 10, maxHashtags: 20 },
  tiktok: { text: 2200, maxMedia: 1, maxHashtags: 5 },
};

export interface WorkspaceDTO {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface MemberDTO {
  workspaceId: string;
  userId: string;
  role: Role;
  user?: { id: string; email: string; name: string };
}

export interface AuthResponseDTO {
  user: UserDTO;
  accessToken: string;
  accessTokenExpiresIn: number;
  /** Refresh token is delivered as an httpOnly cookie, not in the body. */
}

export interface SocialAccountDTO {
  id: string;
  workspaceId: string;
  platform: Platform;
  externalAccountId: string;
  displayName: string;
  status: AccountStatus;
  tokenExpiresAt: string | null;
  connectedAt: string;
}