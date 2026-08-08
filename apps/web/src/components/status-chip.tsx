'use client';

import type { ReactNode } from 'react';

const TONE: Record<string, string> = {
  draft: 'chip--draft',
  queued: 'chip--queued',
  approved: 'chip--approved',
  scheduled: 'chip--scheduled',
  publishing: 'chip--publishing',
  pending: 'chip--pending',
  published: 'chip--published',
  failed: 'chip--failed',
  cancelled: 'chip--cancelled',
  connected: 'chip--published',
  needs_reconnect: 'chip--failed',
  disconnected: 'chip--neutral',
};

export function StatusChip({ status }: { status: string }) {
  const tone = TONE[status] ?? 'chip--neutral';
  return (
    <span className={`chip ${tone}`}>
      <span className="dot" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="label-mono">{children}</span>;
}
