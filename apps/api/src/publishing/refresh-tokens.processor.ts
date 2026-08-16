import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { OauthService } from '../oauth/oauth.service';

/**
 * Hourly sweep (driven by the `token-refresh-hourly` scheduler in
 * PublishingService): refreshes every account whose token expires within the
 * next hour. Skipped: dry-run accounts, accounts already flagged
 * needs_reconnect (they only recover via a manual reconnect), platforms
 * without refresh tokens. On failure `OauthService.performRefresh` marks the
 * account needs_reconnect and notifies the workspace — this worker only logs.
 */
@Processor('refresh-tokens')
@Injectable()
export class RefreshTokensProcessor extends WorkerHost {
  private readonly logger = new Logger(RefreshTokensProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: OauthService,
  ) {
    super();
  }

  async process(_job: Job): Promise<number> {
    const due = await this.prisma.socialAccount.findMany({
      where: {
        platform: { not: 'whatsapp' },
        status: { not: 'needs_reconnect' },
        refreshTokenEncrypted: { not: null },
        tokenExpiresAt: { lt: new Date(Date.now() + 60 * 60 * 1000) },
      },
      select: {
        id: true,
        workspaceId: true,
        platform: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        metadata: true,
      },
    });
    const accounts = due.filter((a) => !((a.metadata ?? {}) as Record<string, unknown>).dryRun);

    let refreshed = 0;
    for (const account of accounts) {
      try {
        await this.oauth.performRefresh(account);
        refreshed += 1;
        this.logger.log(`Refreshed token for account ${account.id} (${account.platform})`);
      } catch (err) {
        // performRefresh already set status + notified the workspace.
        this.logger.warn(
          `Token refresh failed for account ${account.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (accounts.length > 0) {
      this.logger.log(`Token refresh sweep: ${refreshed}/${accounts.length} refreshed`);
    }
    return refreshed;
  }
}
