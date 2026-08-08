'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import '../../styles/app.css';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, router, pathname]);

  if (!ready) {
    return (
      <div className="shell">
        <div style={{ width: 'var(--sidebar-w)' }} className="skel" />
        <div className="main" style={{ padding: 'var(--space-6)' }}>
          <div className="skel" style={{ height: 120 }} />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
