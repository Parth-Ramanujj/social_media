'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { AnalyticsSummaryDTO, CsvExportDTO } from '@/lib/types';

const METRICS = [
  { key: 'impressions', label: 'impressions' },
  { key: 'reach', label: 'reach' },
  { key: 'likes', label: 'likes' },
  { key: 'comments', label: 'comments' },
  { key: 'shares', label: 'shares' },
  { key: 'videoViews', label: 'video views' },
] as const;

const MAX_BAR = 500_000;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function AnalyticsPage() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const [data, setData] = useState<AnalyticsSummaryDTO | null>(null);
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('impressions');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      setData(await api<AnalyticsSummaryDTO>(`/workspaces/${workspace.id}/analytics/summary?days=${days}`));
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Failed to load analytics', 'fail');
    }
  }, [workspace, days, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateMock() {
    if (!workspace) return;
    setBusy(true);
    try {
      await api(`/workspaces/${workspace.id}/analytics/mock?days=${days}`, { method: 'POST' });
      toast('Demo analytics generated', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Could not generate', 'fail');
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    if (!workspace) return;
    try {
      const { filename, content } = await api<CsvExportDTO>(
        `/workspaces/${workspace.id}/analytics/export?days=${days}`,
      );
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Export failed', 'fail');
    }
  }

  const totals = data?.totals;
  const series = data?.series ?? [];
  const activeTotal = totals ? totals[metric] : 0;
  const peak = Math.max(...series.map((p) => p[metric]), 1);

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Analytics · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">What performed, when.</h1>
        </div>
        <div className="page-head__actions">
          <select
            className="input input--select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Date range"
          >
            <option value={7}>last 7 days</option>
            <option value={30}>last 30 days</option>
            <option value={90}>last 90 days</option>
          </select>
          <button className="btn" disabled={busy} onClick={() => void generateMock()}>
            {busy ? 'generating…' : 'generate demo data'}
          </button>
          <button className="btn btn--primary" onClick={() => void exportCsv()}>
            export csv
          </button>
        </div>
      </div>

      {data === null && <div className="skel" style={{ height: 320 }} />}

      {data !== null && !data.generated && (
        <div className="empty" style={{ margin: 'var(--space-6) 0' }}>
          <span className="label-mono">No analytics snapshots</span>
          <span className="lede" style={{ maxWidth: '46ch' }}>
            Provider APIs are not connected yet, so the pipeline is dry-run: generate deterministic
            demo data for your connected accounts, or export a CSV once real snapshots arrive.
          </span>
          <button className="btn btn--primary" disabled={busy} onClick={() => void generateMock()}>
            generate demo data
          </button>
        </div>
      )}

      {data !== null && data.generated && totals && (
        <>
          <div className="stat-grid" style={{ marginBottom: 'var(--space-8)' }}>
            {METRICS.map((m) => (
              <div key={m.key} className="stat-card">
                <div className="stat-card__label label-mono">{m.label}</div>
                <div className="stat-card__value">{fmt(totals[m.key])}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="label-mono">Daily · {metric}</span>
              <div className="metric-tabs">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    className={`chip${metric === m.key ? ' is-active' : ''}`}
                    onClick={() => setMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bars" style={{ height: 240 }}>
              {series.map((p) => {
                const h = Math.max(2, Math.round((p[metric] / Math.max(peak, 1)) * 200));
                return (
                  <div key={p.date} className="bar-col" title={`${p.date}: ${fmt(p[metric])}`}>
                    <div className="bar" style={{ height: h }} />
                  </div>
                );
              })}
            </div>
            <div className="bars-axis label-mono">
              <span>{series[0]?.date.slice(5) ?? ''}</span>
              <span>{series[Math.floor(series.length / 2)]?.date.slice(5) ?? ''}</span>
              <span>{series[series.length - 1]?.date.slice(5) ?? ''}</span>
            </div>
          </div>

          <p className="lede" style={{ marginTop: 'var(--space-6)', fontSize: '0.8rem' }}>
            {data.accountsTracked} tracked account{data.accountsTracked === 1 ? '' : 's'} ·{' '}
            {data.days}-day window · peak {metric} {fmt(peak)}
            {peak >= MAX_BAR ? ' (chart scaled)' : ''}
          </p>
        </>
      )}
    </div>
  );
}
