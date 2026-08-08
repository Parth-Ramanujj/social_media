'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { AuthAside } from '@/components/auth-aside';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push(params.get('next') ?? '/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.messageOf() : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <AuthAside />
      <div className="auth-main">
        <form className="auth-card" onSubmit={onSubmit}>
          <div>
            <span className="label-mono">Sign in</span>
            <h1>Back to the desk.</h1>
          </div>

          {error && <div className="auth-err">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="auth-switch">
            No account? <Link href="/signup">Create one</Link>
          </p>

          <p className="label-mono" style={{ lineHeight: 1.8 }}>
            dev seed: pulse@example.com / pulse1234
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ height: '100vh' }} />}>
      <LoginForm />
    </Suspense>
  );
}
