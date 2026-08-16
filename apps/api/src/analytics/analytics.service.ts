import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { MockAnalyticsQueryDto } from './dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Aggregated metrics over the last N days, per-day series for the chart,
   * and a per-account breakdown. Snapshots are account-level when
   * postPlatformVariantId is null (real providers attach them to variants).
   */
  async summary(opts: { workspaceId: string; days: number }) {
    const days = Math.min(Math.max(opts.days ?? 30, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const where: Prisma.AnalyticsSnapshotWhereInput = {
      socialAccount: { workspaceId: opts.workspaceId },
      metricDate: { gte: since },
    };

    const [rows, perAccount, accountCount] = await Promise.all([
      this.prisma.analyticsSnapshot.findMany({
        where,
        select: {
          metricDate: true,
          impressions: true,
          reach: true,
          likes: true,
          comments: true,
          shares: true,
          videoViews: true,
        },
        orderBy: { metricDate: 'asc' },
      }),
      this.prisma.analyticsSnapshot.groupBy({
        by: ['socialAccountId'],
        where,
        _sum: {
          impressions: true,
          reach: true,
          likes: true,
          comments: true,
          shares: true,
          videoViews: true,
        },
      }),
      this.prisma.socialAccount.count({ where: { workspaceId: opts.workspaceId } }),
    ]);

    const totals = rows.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.reach += r.reach;
        acc.likes += r.likes;
        acc.comments += r.comments;
        acc.shares += r.shares;
        acc.videoViews += r.videoViews;
        return acc;
      },
      { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, videoViews: 0 },
    );

    const byDay = new Map<string, typeof totals>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      byDay.set(d.toISOString().slice(0, 10), {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        videoViews: 0,
      });
    }
    for (const r of rows) {
      const key = r.metricDate.toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.impressions += r.impressions;
        bucket.reach += r.reach;
        bucket.likes += r.likes;
        bucket.comments += r.comments;
        bucket.shares += r.shares;
        bucket.videoViews += r.videoViews;
      }
    }

    return {
      days,
      totals,
      series: [...byDay.entries()].map(([date, m]) => ({ date, ...m })),
      perAccount,
      accountsTracked: accountCount,
      generated: rows.length > 0,
    };
  }

  /** CSV export (client downloads the raw text from the API). */
  async csv(opts: { workspaceId: string; days: number }) {
    const { days, series, totals } = await this.summary(opts);
    const header = 'date,impressions,reach,likes,comments,shares,videoViews';
    const lines = series.map(
      (r) => `${r.date},${r.impressions},${r.reach},${r.likes},${r.comments},${r.shares},${r.videoViews}`,
    );
    const totalsLine = `TOTAL,${totals.impressions},${totals.reach},${totals.likes},${totals.comments},${totals.shares},${totals.videoViews}`;
    return { filename: `pulse-analytics-${days}d.csv`, content: [header, ...lines, totalsLine].join('\n') };
  }

  /**
   * Dry-run demo data: deterministic daily snapshots for connected accounts
   * so the analytics page renders without platform APIs. Idempotent upserts.
   */
  async mock(opts: { workspaceId: string; userId: string; query: MockAnalyticsQueryDto }) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId: opts.workspaceId, status: { not: 'disconnected' } },
      select: { id: true, platform: true },
    });
    if (accounts.length === 0) {
      throw new BadRequestException('Connect a social account first (dry-run meta works)');
    }
    const days = Math.min(Math.max(opts.query.days ?? 30, 7), 90);
    const targets =
      (opts.query.accountId ? accounts.filter((a) => a.id === opts.query.accountId) : accounts) ??
      accounts;

    let created = 0;
    for (const account of targets) {
      const seed = [...account.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const trend = Math.max(0.4, 1 - i / days); // recent days trend up
        const base = 200 + ((seed * 37 + i * 53) % 400);
        const impressions = Math.round(base * trend * 10);
        const reach = Math.round(impressions * (0.55 + ((seed + i) % 10) / 25));
        const likes = Math.round(impressions * (0.03 + ((seed + i * 3) % 8) / 100));
        const comments = Math.round(likes * (0.12 + ((seed + i * 5) % 5) / 50));
        const shares = Math.round(likes * (0.08 + ((seed + i * 7) % 6) / 60));
        const videoViews = Math.round(impressions * (0.4 + ((seed + i * 11) % 20) / 100));
        const existing = await this.prisma.analyticsSnapshot.findFirst({
          where: {
            socialAccountId: account.id,
            postPlatformVariantId: null,
            metricDate: date,
          },
          select: { id: true },
        });
        const data = {
          socialAccountId: account.id,
          metricDate: date,
          impressions,
          reach,
          likes,
          comments,
          shares,
          videoViews,
        };
        if (existing) {
          await this.prisma.analyticsSnapshot.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await this.prisma.analyticsSnapshot.create({ data });
        }
        created += 1;
      }
    }

    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'analytics.mock',
      targetType: 'analytics',
      meta: { days, accounts: targets.length, rows: created },
    });
    return { created, days, accounts: targets.length };
  }
}
