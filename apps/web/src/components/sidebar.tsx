'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, useWorkspace } from '@/lib/auth-context';
import { PulseMark } from './icons';

const NAV = [
  { href: '/app', label: 'Dashboard', idx: '01' },
  { href: '/app/composer', label: 'Composer', idx: '02' },
  { href: '/app/accounts', label: 'Accounts', idx: '03' },
  { href: '/app/inbox', label: 'Inbox', idx: '04' },
  { href: '/app/members', label: 'Members', idx: '05' },
  { href: '/app/audit', label: 'Audit log', idx: '06' },
  { href: '/app/analytics', label: 'Analytics', idx: '07' },
  { href: '/app/notifications', label: 'Notifications', idx: '08' },
  { href: '/app/settings', label: 'Settings', idx: '09' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { workspaces, workspace, setWorkspaceId } = useWorkspace();
  const [wsOpen, setWsOpen] = useState(false);

  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="rail">
      <div className="rail__brand">
        <span className="mark">
          <PulseMark />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span className="rail__brand-name">Pulse</span>
          <span className="rail__brand-env">social ops</span>
        </div>
      </div>

      <nav className="rail__nav" aria-label="Workspace">
        <div className="rail__group">Workspace</div>
        {NAV.map((item) => {
          const active =
            item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rail__link${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="idx">{item.idx}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="rail__foot">
        <div className="ws-switch">
          <button
            className="ws-switch__btn"
            onClick={() => setWsOpen((o) => !o)}
            aria-expanded={wsOpen}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workspace?.name ?? 'Select workspace'}
            </span>
            <span className="ws-switch__plan">{workspace?.plan ?? '—'}</span>
          </button>
          {wsOpen && (
            <div className="ws-switch__menu">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  className={`ws-switch__item${w.id === workspace?.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setWorkspaceId(w.id);
                    setWsOpen(false);
                  }}
                >
                  <span>{w.name}</span>
                  <span className="ws-switch__plan">{w.plan}</span>
                </button>
              ))}
              {workspaces.length === 0 && (
                <span className="label-mono" style={{ padding: '6px 10px' }}>
                  No workspaces yet
                </span>
              )}
            </div>
          )}
        </div>

        <div className="rail__user">
          <span className="avatar">{initials}</span>
          <div className="rail__user-meta">
            <div className="rail__user-name">{user?.name}</div>
            <div className="rail__user-mail">{user?.email}</div>
          </div>
          <button
            className="btn btn--ghost btn--sm btn--mono"
            style={{ marginLeft: 'auto' }}
            onClick={() => void logout()}
            title="Sign out"
          >
            exit
          </button>
        </div>
      </div>
    </aside>
  );
}
