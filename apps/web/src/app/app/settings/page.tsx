'use client';

import { useState, type FormEvent } from 'react';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError, API_URL } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

export default function SettingsPage() {
  const { workspace, refreshWorkspaces } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState(workspace?.name ?? '');
  const [busy, setBusy] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setBusy(true);
    try {
      await api(`/workspaces/${workspace.id}`, { method: 'PATCH', body: { name } });
      toast('Workspace renamed', 'ok');
      await refreshWorkspaces();
    } catch (err) {
      toast(err instanceof ApiError ? err.messageOf() : 'Rename failed', 'fail');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Settings · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">Workspace settings.</h1>
        </div>
      </div>

      <form className="panel" onSubmit={saveName} style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <span className="label-mono">Workspace name</span>
        <div className="field">
          <label htmlFor="ws-name">Name</label>
          <input
            id="ws-name"
            className="input"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <button className="btn btn--primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <div className="panel" style={{ marginTop: 'var(--space-6)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span className="label-mono">System</span>
        <div className="graphite__row" style={{ borderBottom: '1px solid var(--color-rule)', padding: 'var(--space-2) 0' }}>
          <span className="k" style={{ color: 'var(--color-ink-3)' }}>plan</span>
          <span className="v mono" style={{ textTransform: 'uppercase' }}>{workspace?.plan ?? '—'}</span>
        </div>
        <div className="graphite__row" style={{ borderBottom: '1px solid var(--color-rule)', padding: 'var(--space-2) 0' }}>
          <span className="k" style={{ color: 'var(--color-ink-3)' }}>workspace id</span>
          <span className="v mono">{workspace?.id ?? '—'}</span>
        </div>
        <div className="graphite__row" style={{ padding: 'var(--space-2) 0' }}>
          <span className="k" style={{ color: 'var(--color-ink-3)' }}>api</span>
          <span className="v mono">{API_URL}</span>
        </div>
      </div>
    </div>
  );
}
