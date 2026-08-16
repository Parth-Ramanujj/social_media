'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { NotificationDTO } from '@/lib/types';

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setItems(await api<NotificationDTO[]>('/notifications'));
    } catch {
      setItems([]);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = useMemo(() => (items ?? []).filter((n) => !n.readAt).length, [items]);
  const visible = useMemo(
    () => (filter === 'unread' ? (items ?? []).filter((n) => !n.readAt) : items ?? []),
    [items, filter],
  );

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
      setItems((cur) => (cur ?? []).map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch {
      /* noop */
    }
  }

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setItems((cur) => (cur ?? []).map((n) => ({ ...n, readAt: n.readAt ?? now })));
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Activity</span>
          <h1 className="display-1">Notifications.</h1>
        </div>
        <div className="page-head__actions">
          <div className="seg" role="tablist" aria-label="Notification filter">
            <button
              role="tab"
              aria-selected={filter === 'all'}
              className={`seg__btn${filter === 'all' ? ' is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              all
            </button>
            <button
              role="tab"
              aria-selected={filter === 'unread'}
              className={`seg__btn${filter === 'unread' ? ' is-active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              unread{unread > 0 ? ` (${unread})` : ''}
            </button>
          </div>
          {unread > 0 && (
            <button className="btn btn--ghost btn--sm btn--mono" disabled={busy} onClick={() => void markAllRead()}>
              mark all read
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        {visible.length === 0 ? (
          <div className="empty" style={{ padding: 'var(--space-8)' }}>
            <span className="lede">
              {filter === 'unread'
                ? 'You are all caught up.'
                : 'Nothing yet — publishes, failures and team activity will land here.'}
            </span>
          </div>
        ) : (
          visible.map((n) => (
            <div key={n.id} className={`notif-item${n.readAt ? '' : ' is-unread'}`}>
              <div className="notif-item__main">
                <div className="notif-item__meta">
                  <span className="notif-item__type">{n.type}</span>
                  <span className="notif-item__time label-mono">{timeAgo(n.createdAt)}</span>
                </div>
                <div className="notif-item__title">{n.title}</div>
                {n.body && <div className="notif-item__body">{n.body}</div>}
              </div>
              {!n.readAt && (
                <button className="btn btn--sm btn--ghost btn--mono" onClick={() => void markRead(n.id)}>
                  mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
