'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { API_URL, getAccessToken, api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { NotificationDTO } from '@/lib/types';

export function NotificationsBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [list, count] = await Promise.all([
        api<NotificationDTO[]>('/notifications'),
        api<{ count: number }>('/notifications/unread-count'),
      ]);
      setItems(list.slice(0, 12));
      setUnread(count.count);
    } catch {
      /* bell stays quiet on failure */
    }
  }, [user]);

  // Live updates: the API pushes notification.created / notifications.updated
  // events over SSE (EventSource reconnects automatically). Falls back to a
  // slow poll only if the stream cannot be established.
  useEffect(() => {
    void refresh();
    if (!user) return;
    const token = getAccessToken();
    let es: EventSource | null = null;
    if (token) {
      es = new EventSource(`${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('notification.created', () => void refresh());
      es.addEventListener('notifications.updated', () => void refresh());
    }
    const timer = window.setInterval(() => void refresh(), 120_000);
    return () => {
      es?.close();
      window.clearInterval(timer);
    };
  }, [user, refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setUnread(0);
      setItems((cur) => cur.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
      setUnread((u) => Math.max(0, u - 1));
      setItems((cur) => cur.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch {
      /* noop */
    }
  }

  return (
    <div className="bell" ref={boxRef}>
      <button
        className="btn btn--ghost btn--sm btn--mono bell__btn"
        onClick={() => void (open ? setOpen(false) : refresh().then(() => setOpen(true)))}
        aria-expanded={open}
        title="Notifications"
      >
        bell
        {unread > 0 && <span className="bell__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell__panel">
          <div className="bell__head">
            <span className="label-mono">Notifications</span>
            {unread > 0 && (
              <button className="btn btn--ghost btn--sm btn--mono" onClick={() => void markAllRead()}>
                mark all read
              </button>
            )}
          </div>
          <div className="bell__list">
            {items.length === 0 && (
              <div className="empty" style={{ padding: 'var(--space-6)' }}>
                <span className="lede">Nothing yet — publishes and failures will land here.</span>
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                className={`bell__item${n.readAt ? '' : ' is-unread'}`}
                onClick={() => void (n.readAt ? undefined : markRead(n.id))}
              >
                <span className="bell__item-title">{n.title}</span>
                {n.body && <span className="bell__item-body">{n.body}</span>}
                <span className="bell__item-time label-mono">{timeAgo(n.createdAt)}</span>
              </button>
            ))}
            {items.length > 0 && (
              <Link
                href="/app/notifications"
                className="bell__all"
                onClick={() => setOpen(false)}
              >
                view all →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
