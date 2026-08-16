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

export interface InboxReplyDTO {
  id: string;
  inboxId: string;
  content: string;
  repliedBy: string;
  createdAt: string;
  repliedByUser?: { id: string; name: string; email: string } | null;
}

export interface InboxMessageDTO {
  id: string;
  socialAccountId: string;
  platform: string;
  externalMessageId: string;
  type: string;
  senderName: string;
  content: string;
  status: string;
  assignedTo: string | null;
  repliedAt: string | null;
  createdAt: string;
  socialAccount?: { id: string; platform: string; displayName: string };
  assignee?: { id: string; name: string; email: string } | null;
  replies: InboxReplyDTO[];
}

export interface InboxListDTO {
  items: InboxMessageDTO[];
  total: number;
  counts: { unassigned: number; assigned: number; resolved: number };
}

export interface InboxSyncResult {
  accounts: number;
  fetched: number;
  created: number;
  errors: Array<{ accountId: string; platform: string; message: string }>;
}

export interface NotificationDTO {
  id: string;
  userId: string;
  workspaceId: string | null;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AnalyticsPointDTO {
  date: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  videoViews: number;
}

export interface AnalyticsSummaryDTO {
  days: number;
  totals: Omit<AnalyticsPointDTO, 'date'>;
  series: AnalyticsPointDTO[];
  perAccount: Array<{
    socialAccountId: string;
    _sum: {
      impressions: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      videoViews: number | null;
    };
  }>;
  accountsTracked: number;
  generated: boolean;
}

export interface CsvExportDTO {
  filename: string;
  content: string;
}
