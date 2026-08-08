'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_LIMITS, type Platform } from '@pulse/shared-types';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { SocialAccountDTO } from '@/lib/types';
import { PlatformMark } from '@/components/icons';

interface DraftVariant {
  accountId: string;
  contentText: string;
  mediaUrls: string;
  scheduledAt: string;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ComposerPage() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();

  const [accounts, setAccounts] = useState<SocialAccountDTO[] | null>(null);
  const [selected, setSelected] = useState<Record<string, DraftVariant>>({});
  const [needsApproval, setNeedsApproval] = useState(false);
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'queued'>('scheduled');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    api<SocialAccountDTO[]>(`/workspaces/${workspace.id}/accounts`)
      .then((a) => setAccounts(a.filter((x) => x.status === 'connected')))
      .catch((e) => toast(e instanceof ApiError ? e.messageOf() : 'Failed to load accounts', 'fail'));
  }, [workspace, toast]);

  const connected = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) => a.status === 'connected' || a.status === 'needs_reconnect',
      ),
    [accounts],
  );

  const toggleAccount = useCallback((acc: SocialAccountDTO) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[acc.id]) {
        delete next[acc.id];
      } else {
        next[acc.id] = {
          accountId: acc.id,
          contentText: '',
          mediaUrls: '',
          scheduledAt: toLocalInput(new Date(Date.now() + 3600_000).toISOString()),
        };
      }
      return next;
    });
  }, []);

  const setField = useCallback((accountId: string, field: keyof DraftVariant, value: string) => {
    setSelected((prev) => ({
      ...prev,
      [accountId]: { ...prev[accountId], [field]: value },
    }));
  }, []);

  const totalChars = useMemo(
    () => Object.values(selected).reduce((s, v) => s + v.contentText.length, 0),
    [selected],
  );

  const variantCount = Object.keys(selected).length;

  const invalid = useMemo(() => {
    const errors: string[] = [];
    if (status === 'scheduled') {
      for (const v of Object.values(selected)) {
        if (!v.scheduledAt) {
          errors.push('every variant needs a schedule time');
          break;
        }
        const when = new Date(v.scheduledAt).getTime();
        if (!Number.isFinite(when) || when <= Date.now()) {
          errors.push('schedule time must be in the future');
          break;
        }
      }
    }
    if (status === 'queued' && !needsApproval) {
      errors.push('queued posts require approval');
    }
    return errors;
  }, [status, selected, needsApproval]);

  async function submit() {
    if (!workspace) return;
    setBusy(true);
    try {
      await api(`/workspaces/${workspace.id}/posts`, {
        method: 'POST',
        body: {
          title: undefined,
          status,
          needsApproval: status === 'queued',
          variants: Object.values(selected).map((v) => ({
            socialAccountId: v.accountId,
            contentText: v.contentText,
            mediaUrls: v.mediaUrls
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            scheduledAt: v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined,
          })),
        },
      });
      toast(status === 'draft' ? 'Saved as draft' : 'Post scheduled', 'ok');
      router.push('/app');
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Could not create post', 'fail');
    } finally {
      setBusy(false);
    }
  }

  const scheduledTargets = Object.values(selected)
    .filter((v) => v.scheduledAt)
    .map((v) => new Date(v.scheduledAt).toISOString());

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Composer · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">One post, every channel.</h1>
        </div>
      </div>

      <div className="composer">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minWidth: 0 }}>
          {/* account picker */}
          <div>
            <span className="label-mono" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
              Target accounts
            </span>
            {accounts === null ? (
              <div className="skel" style={{ height: 40 }} />
            ) : connected.length === 0 ? (
              <div className="empty">
                <span className="label-mono">No connected accounts</span>
                <button className="btn" onClick={() => router.push('/app/accounts')}>
                  Connect a platform
                </button>
              </div>
            ) : (
              <div className="filter-row">
                {connected.map((a) => {
                  const on = !!selected[a.id];
                  return (
                    <button
                      key={a.id}
                      className={`filter-chip${on ? ' is-active' : ''}`}
                      onClick={() => toggleAccount(a)}
                      aria-pressed={on}
                    >
                      <PlatformMark platform={a.platform} size={11} />
                      {a.platform}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* variant cards */}
          {Object.values(selected).map((v) => {
            const acc = connected.find((a) => a.id === v.accountId);
            if (!acc) return null;
            const platform = acc.platform as Platform;
            const limit = PLATFORM_LIMITS[platform]?.text ?? 5000;
            const over = v.contentText.length > limit;
            return (
              <section key={v.accountId} className="variant-card">
                <div className="variant-card__head">
                  <span className="chip chip--platform">
                    <PlatformMark platform={platform} size={11} />
                    {platform}
                  </span>
                  <span className="label-mono">{acc.displayName}</span>
                </div>

                <div className="field">
                  <label htmlFor={`text-${v.accountId}`}>Copy · limit {limit}</label>
                  <textarea
                    id={`text-${v.accountId}`}
                    className="input"
                    rows={4}
                    value={v.contentText}
                    onChange={(e) => setField(v.accountId, 'contentText', e.target.value)}
                    placeholder="Write the post…"
                  />
                  <span className={`char-count${over ? ' is-over' : ''}`}>
                    {v.contentText.length} / {limit}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor={`media-${v.accountId}`}>Media URLs · comma-separated</label>
                  <input
                    id={`media-${v.accountId}`}
                    className="input"
                    type="text"
                    value={v.mediaUrls}
                    onChange={(e) => setField(v.accountId, 'mediaUrls', e.target.value)}
                    placeholder="https://…/image-1.jpg, https://…/image-2.jpg"
                  />
                </div>

                <div className="field">
                  <label htmlFor={`at-${v.accountId}`}>Scheduled at</label>
                  <input
                    id={`at-${v.accountId}`}
                    className="input"
                    type="datetime-local"
                    value={v.scheduledAt}
                    onChange={(e) => setField(v.accountId, 'scheduledAt', e.target.value)}
                  />
                </div>
              </section>
            );
          })}

          {variantCount > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="switch" style={{ gap: 'var(--space-3)' }}>
                <input
                  type="checkbox"
                  checked={needsApproval}
                  onChange={(e) => setNeedsApproval(e.target.checked)}
                />
                <span className="switch__track" />
                <span className="label-mono" style={{ fontSize: '0.7rem' }}>
                  needs approval
                </span>
              </label>

              <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)' }}>
                <label htmlFor="status" className="label-mono" style={{ fontSize: '0.7rem' }}>
                  Status
                </label>
                <select
                  id="status"
                  className="input"
                  style={{ width: 'auto' }}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="scheduled">scheduled</option>
                  <option value="draft">draft</option>
                  <option value="queued">queued (approval)</option>
                </select>
              </div>
            </div>
          )}

          {invalid.length > 0 && (
            <p className="auth-err" style={{ maxWidth: '100%' }}>
              {invalid.join(' · ')}
            </p>
          )}
        </div>

        {/* graphite band — the one dark beat */}
        <aside className="graphite">
          <div className="graphite__label">Publish preview</div>
          <div className="graphite__row">
            <span className="k">variants</span>
            <span className="v">{variantCount}</span>
          </div>
          <div className="graphite__row">
            <span className="k">platforms</span>
            <span className="v">
              {[...new Set(Object.values(selected).map((v) => v.accountId).map((id) => connected.find((a) => a.id === id)?.platform).filter(Boolean))]
                .join(' · ') || '—'}
            </span>
          </div>
          <div className="graphite__row">
            <span className="k">chars</span>
            <span className="v">{totalChars}</span>
          </div>
          <div className="graphite__row">
            <span className="k">mode</span>
            <span className="v">
              {status === 'queued' ? 'approval queue' : status === 'draft' ? 'draft' : 'scheduled'}
            </span>
          </div>
          <div className="graphite__row">
            <span className="k">fires</span>
            <span className="v">
              {scheduledTargets.length
                ? new Date(Math.min(...scheduledTargets.map((s) => new Date(s).getTime())))
                    .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'on demand'}
            </span>
          </div>
          <button
            className="btn btn--primary"
            disabled={busy || variantCount === 0 || invalid.length > 0}
            onClick={() => void submit()}
          >
            {busy ? 'Sending…' : status === 'draft' ? 'Save draft' : 'Queue for publish'}
          </button>
        </aside>
      </div>
    </div>
  );
}
