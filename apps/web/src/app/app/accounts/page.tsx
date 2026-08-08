'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PLATFORMS, type Platform } from '@pulse/shared-types';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { fmtDate } from '@/lib/format';
import type { ConnectUrlDTO, SocialAccountDTO } from '@/lib/types';
import { StatusChip } from '@/components/status-chip';
import { PlatformMark } from '@/components/icons';

function AccountsInner() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const params = useSearchParams();

  const [accounts, setAccounts] = useState<SocialAccountDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      setAccounts(await api<SocialAccountDTO[]>(`/workspaces/${workspace.id}/accounts`));
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Failed to load accounts', 'fail');
    }
  }, [workspace, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // OAuth callback landed: ?connected=meta or ?error=connect_failed
  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) {
      toast(`Connected ${connected}`, 'ok');
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url);
      void load();
    } else if (error) {
      toast('Connection failed', 'fail');
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url);
    }
  }, [params, toast, load]);

  async function connect(platform: Platform) {
    if (!workspace) return;
    setBusy(`connect:${platform}`);
    try {
      const { url } = await api<ConnectUrlDTO>(
        `/workspaces/${workspace.id}/oauth/connect/${platform}`,
      );
      window.location.href = url;
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Could not start connect', 'fail');
      setBusy(null);
    }
  }

  async function refreshAccount(accountId: string) {
    if (!workspace) return;
    setBusy(`refresh:${accountId}`);
    try {
      await api(`/workspaces/${workspace.id}/accounts/${accountId}/refresh`, { method: 'POST' });
      toast('Token refreshed', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Refresh failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(accountId: string) {
    if (!workspace) return;
    if (!window.confirm('Disconnect this account?')) return;
    setBusy(`del:${accountId}`);
    try {
      await api(`/workspaces/${workspace.id}/accounts/${accountId}`, { method: 'DELETE' });
      toast('Account disconnected', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Disconnect failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  const connectedPlatforms = new Set((accounts ?? []).map((a) => a.platform));

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Connected channels · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">The channels you own.</h1>
        </div>
      </div>

      <span className="label-mono" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
        Connected
      </span>
      {accounts === null ? (
        <div className="skel" style={{ height: 120 }} />
      ) : accounts.length === 0 ? (
        <div className="empty" style={{ marginBottom: 'var(--space-8)' }}>
          <span className="label-mono">No channels connected yet</span>
          <span className="lede" style={{ maxWidth: '40ch' }}>
            Pick a platform below. Without developer credentials Pulse runs in dry-run mode, so the
            full publish flow works end to end anyway.
          </span>
        </div>
      ) : (
        <div className="acc-grid" style={{ marginBottom: 'var(--space-10)' }}>
          {accounts.map((acc) => (
            <div key={acc.id} className="acc-card">
              <div className="acc-card__head">
                <span className="acc-card__name">{acc.displayName}</span>
                <PlatformMark platform={acc.platform} size={16} />
              </div>
              <div>
                <StatusChip status={acc.status} />
              </div>
              <div className="acc-card__meta">
                <div>platform · {acc.platform}</div>
                <div>external id · {acc.externalAccountId.slice(0, 18)}</div>
                <div>expires · {fmtDate(acc.tokenExpiresAt)}</div>
              </div>
              <div className="acc-card__actions">
                <button
                  className="btn btn--sm"
                  disabled={busy === `refresh:${acc.id}`}
                  onClick={() => void refreshAccount(acc.id)}
                >
                  refresh
                </button>
                <button
                  className="btn btn--sm btn--danger"
                  disabled={busy === `del:${acc.id}`}
                  onClick={() => void disconnect(acc.id)}
                >
                  disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <span className="label-mono" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
        Connect a platform
      </span>
      <div className="acc-grid">
        {PLATFORMS.map((platform) => {
          const connected = connectedPlatforms.has(platform);
          return (
            <div key={platform} className="acc-card">
              <div className="acc-card__head">
                <span className="acc-card__name" style={{ textTransform: 'capitalize' }}>
                  {platform}
                </span>
                <PlatformMark platform={platform} size={16} />
              </div>
              <div className="acc-card__meta">
                {connected
                  ? 'connected — reconnect replaces the token'
                  : 'not connected'}
              </div>
              <div className="acc-card__actions">
                <button
                  className={`btn btn--sm${connected ? '' : ' btn--primary'}`}
                  disabled={busy === `connect:${platform}`}
                  onClick={() => void connect(platform)}
                >
                  {connected ? 'reconnect' : 'connect'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="lede" style={{ marginTop: 'var(--space-8)', fontSize: '0.8rem' }}>
        Dry-run mode: with no developer app credentials in <span className="mono">.env</span>, the
        callback fabricates a connected account and publishes return synthetic ids — the pipeline is
        identical to production. Registration guide:{' '}
        <span className="mono">{'apps/api/src/oauth/PROVIDERS-GUIDE.md'}</span>.
      </p>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ height: 200 }} />}>
      <AccountsInner />
    </Suspense>
  );
}
