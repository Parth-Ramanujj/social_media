'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { AuthAside } from '@/components/auth-aside';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signup(name, email, password);
      router.push('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.messageOf() : 'Could not create account');
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
            <span className="label-mono">Create account</span>
            <h1>Set up your desk.</h1>
          </div>

          {error && <div className="auth-err">{error}</div>}

          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              className="input"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
            />
          </div>

          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>

          <p className="auth-switch">
            Already have one? <Link href="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
