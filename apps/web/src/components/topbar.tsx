'use client';

import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/lib/auth-context';
import { NotificationsBell } from './notifications-bell';

const TITLES: Record<string, { index: string; title: string }> = {
  '/app': { index: '01', title: 'Dashboard' },
  '/app/composer': { index: '02', title: 'Composer' },
  '/app/accounts': { index: '03', title: 'Accounts' },
  '/app/inbox': { index: '04', title: 'Inbox' },
  '/app/members': { index: '05', title: 'Members' },
  '/app/audit': { index: '06', title: 'Audit log' },
  '/app/analytics': { index: '07', title: 'Analytics' },
  '/app/settings': { index: '08', title: 'Settings' },
};

export function Topbar() {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  const meta = TITLES[pathname] ?? { index: '·', title: 'Workspace' };

  return (
    <header className="topbar">
      <div className="topbar__crumb">
        <span className="label-mono">{meta.index}</span>
        <span className="topbar__crumb-current">{meta.title}</span>
      </div>
      <div className="topbar__right">
        <span className="topbar__meta">
          {workspace ? `${workspace.name} · ${workspace.plan}` : 'no workspace'}
        </span>
        <span className="chip chip--platform">api :4000</span>
        <NotificationsBell />
      </div>
    </header>
  );
}
