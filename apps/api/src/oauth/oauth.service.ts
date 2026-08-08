import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { Platform } from '@pulse/shared-types';
import { AuditService } from '../common/audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { NotificationService } from '../common/notifications/notification.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProviderRegistry } from './provider-registry.service';
import { SocialAccountRef } from './social-provider.interface';
import { ProviderError } from './http.util';

const STATE_TTL_SECONDS = 600;

export interface OauthActor {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class OauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly registry: ProviderRegistry,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  /** Step 1: build the consent URL (or a dry-run URL when the platform is unconfigured). */
  async startConnect(opts: { platform: Platform; workspaceId: string; user: OauthActor }) {
    const provider = this.registry.get(opts.platform);
    const state = await this.jwt.signAsync(
      { workspaceId: opts.workspaceId, userId: opts.user.id, platform: opts.platform },
      { secret: this.config.get<string>('jwtAccessSecret'), expiresIn: STATE_TTL_SECONDS },
    );
    const appUrl = this.config.get<string>('appUrl')!;
    if (!provider.enabled) {
      // Dry-run: completing this URL creates a fake account so the rest of the
      // product is testable before developer-app credentials exist.
      return { url: `${appUrl}/api/oauth/callback/${opts.platform}?state=${state}&code=dryrun` };
    }
    return { url: provider.getAuthorizationUrl({ state, appUrl }) };
  }

  /** Step 2: provider redirects back here with `code` + our `state`. */
  async handleCallback(opts: { platform: Platform; code: string; state: string }) {
    const payload = await this.jwt
      .verifyAsync<{ workspaceId: string; userId: string; platform: Platform }>(opts.state, {
        secret: this.config.get<string>('jwtAccessSecret'),
      })
      .catch(() => null);
    if (!payload || payload.platform !== opts.platform) {
      throw new NotFoundException('Invalid OAuth state');
    }
    const provider = this.registry.get(payload.platform);
    const appUrl = this.config.get<string>('appUrl')!;

    const result = await provider.exchangeCode({ code: opts.code, appUrl, state: opts.state });

    const workspace = await this.prisma.workspace.findUnique({ where: { id: payload.workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const existing = await this.prisma.socialAccount.findUnique({
      where: { platform_externalAccountId: { platform: opts.platform, externalAccountId: result.externalAccountId } },
    });
    if (existing && existing.workspaceId !== payload.workspaceId) {
      throw new ConflictException('This account is already connected to another workspace');
    }

    const account = await this.prisma.socialAccount.upsert({
      where: { platform_externalAccountId: { platform: opts.platform, externalAccountId: result.externalAccountId } },
      update: {
        workspaceId: payload.workspaceId,
        displayName: result.displayName,
        accessTokenEncrypted: this.encryption.encrypt(result.accessToken),
        refreshTokenEncrypted: result.refreshToken ? this.encryption.encrypt(result.refreshToken) : null,
        tokenExpiresAt: result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null,
        status: 'connected',
        metadata: result.metadata as Prisma.InputJsonObject,
      },
      create: {
        workspaceId: payload.workspaceId,
        platform: opts.platform,
        externalAccountId: result.externalAccountId,
        displayName: result.displayName,
        accessTokenEncrypted: this.encryption.encrypt(result.accessToken),
        refreshTokenEncrypted: result.refreshToken ? this.encryption.encrypt(result.refreshToken) : null,
        tokenExpiresAt: result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null,
        metadata: result.metadata as Prisma.InputJsonObject,
      },
    });

    await this.audit.log({
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      action: 'social_account.connected',
      targetType: 'social_account',
      targetId: account.id,
      meta: { platform: opts.platform, externalAccountId: result.externalAccountId },
    });
    return account;
  }

  listAccounts(workspaceId: string) {
    return this.prisma.socialAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        workspaceId: true,
        platform: true,
        externalAccountId: true,
        displayName: true,
        status: true,
        tokenExpiresAt: true,
        metadata: true,
        connectedAt: true,
      },
    });
  }

  async disconnect(opts: { workspaceId: string; accountId: string; actorId: string }) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: opts.accountId, workspaceId: opts.workspaceId },
    });
    if (!account) {
      throw new NotFoundException('Account not found in this workspace');
    }
    await this.prisma.socialAccount.delete({ where: { id: account.id } });
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.actorId,
      action: 'social_account.disconnected',
      targetType: 'social_account',
      targetId: account.id,
      meta: { platform: account.platform },
    });
  }

  /** Manual token refresh from the UI (the hourly worker also does this). */
  async refreshAccount(opts: { workspaceId: string; accountId: string }) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: opts.accountId, workspaceId: opts.workspaceId },
    });
    if (!account) {
      throw new NotFoundException('Account not found in this workspace');
    }
    return this.performRefresh(account);
  }

  /** Shared by the manual endpoint and the token-refresh worker. */
  async performRefresh(account: {
    id: string;
    workspaceId: string;
    platform: Platform;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    metadata: Prisma.JsonValue;
  }) {
    const provider = this.registry.get(account.platform);
    const ref: SocialAccountRef = {
      id: account.id,
      workspaceId: account.workspaceId,
      platform: account.platform,
      externalAccountId: '',
      displayName: '',
      accessToken: this.encryption.decrypt(account.accessTokenEncrypted),
      refreshToken: account.refreshTokenEncrypted ? this.encryption.decrypt(account.refreshTokenEncrypted) : null,
      tokenExpiresAt: null,
      metadata: (account.metadata ?? {}) as Record<string, unknown>,
    };
    try {
      const refreshed = await provider.refreshToken(ref);
      const updated = await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: this.encryption.encrypt(refreshed.accessToken),
          refreshTokenEncrypted: refreshed.refreshToken ? this.encryption.encrypt(refreshed.refreshToken) : undefined,
          tokenExpiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
          status: 'connected',
        },
      });
      await this.prisma.socialAccountConnection.create({
        data: {
          accountId: account.id,
          provider: account.platform,
          lastRefreshedAt: new Date(),
        },
      });
      return updated;
    } catch (err) {
      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: 'needs_reconnect' },
      });
      const message = err instanceof Error ? err.message : 'Unknown refresh error';
      await this.notifications.notifyWorkspace({
        workspaceId: account.workspaceId,
        type: 'account_needs_reconnect',
        title: `${account.platform} connection expired`,
        body: message,
      });
      throw new ProviderError(`Token refresh failed: ${message}`);
    }
  }
}