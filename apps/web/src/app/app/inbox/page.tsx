'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { fmtDate, timeAgo } from '@/lib/format';
import type { InboxListDTO, InboxMessageDTO, InboxSyncResult } from '@/lib/types';
import { PlatformMark } from '@/components/icons';

const STATUS_LABELS: Record<string, string> = {
  unassigned: 'unassigned',
  assigned: 'assigned',
  resolved: 'resolved',
};

export default function InboxPage() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const [data, setData] = useState<InboxListDTO | null>(null);
  const [type, setType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<InboxMessageDTO | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const autoSynced = useRef(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      const res = await api<InboxListDTO>(`/workspaces/${workspace.id}/inbox?${params}`);
      setData(res);
      if (selectedId && !res.items.some((m) => m.id === selectedId)) {
        setSelectedId(null);
        setSelected(null);
      }
      return res;
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Failed to load inbox', 'fail');
      return null;
    }
  }, [workspace, type, status, selectedId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-sync connected accounts once when the inbox is empty, so real
  // comments/DMs show up without a manual step.
  useEffect(() => {
    if (!workspace || autoSynced.current || data === null || data.total !== 0) return;
    autoSynced.current = true;
    void syncNow(true);
  }, [workspace, data]);

  const select = useCallback(async (id: string) => {
    if (!workspace) return;
    setSelectedId(id);
    try {
      setSelected(await api<InboxMessageDTO>(`/workspaces/${workspace.id}/inbox/${id}`));
    } catch {
      setSelected(null);
    }
  }, [workspace]);

  async function mutate(id: string, body: Record<string, unknown>, action: string) {
    if (!workspace) return;
    setBusy(action);
    try {
      await api(`/workspaces/${workspace.id}/inbox/${id}`, { method: 'PATCH', body });
      toast('Inbox updated', 'ok');
      await select(id);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Update failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  async function sendReply() {
    if (!workspace || !selected || !draft.trim()) return;
    setBusy('reply');
    try {
      await api(`/workspaces/${workspace.id}/inbox/${selected.id}/reply`, {
        method: 'POST',
        body: { content: draft.trim() },
      });
      setDraft('');
      toast('Reply sent', 'ok');
      await select(selected.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Reply failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  async function syncNow(auto = false) {
    if (!workspace || syncing) return;
    setSyncing(true);
    try {
      const res = await api<InboxSyncResult>(`/workspaces/${workspace.id}/inbox/sync`, {
        method: 'POST',
      });
      await load();
      if (res.errors.length > 0) {
        const first = res.errors[0];
        toast(`Sync failed for ${first.platform}: ${first.message.slice(0, 120)}`, 'fail');
      } else if (res.created > 0) {
        toast(`${res.created} new message${res.created === 1 ? '' : 's'} from ${res.fetched} fetched`, 'ok');
      } else if (!auto) {
        toast('No new activity on your accounts', 'ok');
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Sync failed', 'fail');
    } finally {
      setSyncing(false);
    }
  }

  async function generateMock() {
    if (!workspace) return;
    setGenerating(true);
    try {
      await api(`/workspaces/${workspace.id}/inbox/mock`, { method: 'POST' });
      toast('Demo messages generated', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Could not generate', 'fail');
    } finally {
      setGenerating(false);
    }
  }

  const counts = data?.counts ?? { unassigned: 0, assigned: 0, resolved: 0 };

  return (
    <div className="inbox">
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Inbox · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">Every comment, one desk.</h1>
        </div>
        <button className="btn btn--sm" disabled={syncing} onClick={() => void syncNow()}>
          {syncing ? 'syncing…' : 'sync now'}
        </button>
      </div>

      {data !== null && data.total === 0 && (
        <div className="empty" style={{ margin: 'var(--space-6) 0' }}>
          <span className="label-mono">No messages yet</span>
          <span className="lede" style={{ maxWidth: '46ch' }}>
            Pull real comments and DMs from your connected accounts, or generate demo messages to
            see the full assign → reply → resolve flow.
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn--primary" disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? 'syncing…' : 'sync connected accounts'}
            </button>
            <button className="btn" disabled={generating} onClick={() => void generateMock()}>
              {generating ? 'generating…' : 'generate demo messages'}
            </button>
          </div>
        </div>
      )}

      {data !== null && data.total > 0 && (
        <div className="inbox__grid">
          <div className="inbox__list">
            <div className="inbox__filters">
              {['', 'comment', 'dm'].map((t) => (
                <button
                  key={t || 'all'}
                  className={`chip${type === t ? ' is-active' : ''}`}
                  onClick={() => setType(t)}
                >
                  {t || 'all'}
                </button>
              ))}
              <span className="label-mono" style={{ marginLeft: 'auto' }}>
                {counts.unassigned} unassigned
              </span>
            </div>

            <div className="inbox__rows">
              {data.items.length === 0 && (
                <div className="empty" style={{ padding: 'var(--space-6)' }}>
                  <span className="lede">No messages for this filter.</span>
                </div>
              )}
              {data.items.map((m) => (
                <button
                  key={m.id}
                  className={`inbox-row${selectedId === m.id ? ' is-active' : ''}`}
                  onClick={() => void select(m.id)}
                >
                  <span className="inbox-row__head">
                    <span className="inbox-row__sender">{m.senderName}</span>
                    <span className={`chip chip--type chip--${m.type}`}>{m.type}</span>
                  </span>
                  <span className="inbox-row__text">{m.content}</span>
                  <span className="inbox-row__meta">
                    <span className="label-mono">{STATUS_LABELS[m.status] ?? m.status}</span>
                    <span className="label-mono">{timeAgo(m.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="inbox__thread">
            {!selected && (
              <div className="empty" style={{ height: '100%', minHeight: 280 }}>
                <span className="lede">Select a message to open the thread.</span>
              </div>
            )}

            {selected && (
              <>
                <div className="inbox__thread-head">
                  <div>
                    <div className="inbox__thread-sender">{selected.senderName}</div>
                    <div className="label-mono">
                      {selected.socialAccount?.displayName ?? selected.platform} ·{' '}
                      {fmtDate(selected.createdAt)}
                    </div>
                  </div>
                  <PlatformMark platform={selected.platform} size={16} />
                </div>

                <div className="inbox__bubble">{selected.content}</div>

                <div className="inbox__replies">
                  {selected.replies.map((r) => (
                    <div key={r.id} className="inbox__reply">
                      <span className="label-mono">{r.repliedByUser?.name ?? 'you'}</span>
                      <div className="inbox__reply-content">{r.content}</div>
                    </div>
                  ))}
                </div>

                <div className="inbox__actions">
                  {selected.status === 'resolved' ? (
                    <button
                      className="btn btn--sm"
                      disabled={busy === 'reopen'}
                      onClick={() =>
                        void mutate(selected.id, { status: 'unassigned' }, 'reopen')
                      }
                    >
                      reopen
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn--sm"
                        disabled={busy === 'assign'}
                        onClick={() =>
                          void mutate(selected.id, { status: 'assigned' }, 'assign')
                        }
                      >
                        {selected.status === 'assigned' ? 'reassign' : 'assign to me'}
                      </button>
                      <button
                        className="btn btn--sm btn--primary"
                        disabled={busy === 'resolve'}
                        onClick={() =>
                          void mutate(selected.id, { status: 'resolved' }, 'resolve')
                        }
                      >
                        resolve
                      </button>
                    </>
                  )}
                </div>

                {selected.status !== 'resolved' && (
                  <div className="inbox__compose">
                    <textarea
                      className="input input--area"
                      placeholder="Write a reply…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                    />
                    <button
                      className="btn btn--primary"
                      disabled={busy === 'reply' || !draft.trim()}
                      onClick={() => void sendReply()}
                    >
                      {busy === 'reply' ? 'sending…' : 'send reply'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {data === null && <div className="skel" style={{ height: 320 }} />}
    </div>
  );
}
