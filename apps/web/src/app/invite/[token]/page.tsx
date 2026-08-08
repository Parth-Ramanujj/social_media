'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<'working' | 'ok' | 'fail'>('working');
  const [message, setMessage] = useState('Accepting invitation…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api('/invitations/accept', { method: 'POST', body: { token: params.token } });
        if (cancelled) return;
        setState('ok');
        setMessage('Invitation accepted.');
        window.setTimeout(() => router.replace(user ? '/app' : '/login'), 1200);
      } catch (e) {
        if (cancelled) return;
        setState('fail');
        setMessage(e instanceof ApiError ? e.messageOf() : 'Could not accept invitation');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token, router, user]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)' }}>
      <div className="panel" style={{ padding: 'var(--space-8)', textAlign: 'center', maxWidth: 360 }}>
        <span className="label-mono">{state === 'working' ? 'Pulse · invite' : state === 'ok' ? 'Pulse · done' : 'Pulse · error'}</span>
        <p style={{ margin: 'var(--space-4) 0 0' }} className="display-2">
          {message}
        </p>
        {state === 'fail' && (
          <button className="btn" style={{ marginTop: 'var(--space-4)' }} onClick={() => router.push('/login')}>
            Go to sign in
          </button>
        )}
      </div>
    </div>
  );
}
