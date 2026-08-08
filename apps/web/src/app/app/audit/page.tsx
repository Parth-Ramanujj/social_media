'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { timeAgo } from '@/lib/format';
import type { AuditEntryDTO } from '@/lib/types';

export default function AuditPage() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntryDTO[] | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      setEntries(await api<AuditEntryDTO[]>(`/workspaces/${workspace.id}/audit`));
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Failed to load audit log', 'fail');
    }
  }, [workspace, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Audit · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">Every action, recorded.</h1>
        </div>
      </div>

      <div className="panel">
        {entries === null ? (
          <div style={{ padding: 'var(--space-4)' }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skel" style={{ height: 36, margin: 'var(--space-2) 0' }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="empty">
            <span className="label-mono">Nothing recorded yet</span>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Target</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: '0.72rem', color: 'var(--color-ink-3)', whiteSpace: 'nowrap' }}>
                    {timeAgo(e.createdAt)}
                  </td>
                  <td>
                    <span className="chip chip--platform">{e.action}</span>
                  </td>
                  <td className="mono" style={{ fontSize: '0.72rem', color: 'var(--color-ink-3)' }}>
                    {e.targetType ? `${e.targetType} · ${e.targetId?.slice(0, 10) ?? ''}` : '—'}
                  </td>
                  <td className="mono" style={{ fontSize: '0.72rem', color: 'var(--color-ink-3)' }}>
                    {e.user?.email ?? e.userId.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
