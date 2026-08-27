'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, ErrorNote, Spinner, ThemeToggle, api } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4">
      <div className="flex justify-end pt-2">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col justify-center pb-16">
        <div className="mb-8 text-center">
          <span aria-hidden className="text-4xl">
            🔧
          </span>
          <h1 className="mt-3 text-2xl font-bold">ThermoRivet</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Diagnostic assistant for HVAC technicians
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="tr-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className="tr-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="tr-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="tr-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <ErrorNote>{error}</ErrorNote>

          <button type="submit" className="tr-btn tr-btn-primary w-full" disabled={busy}>
            {busy ? <Spinner label="Signing in" /> : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          New here?{' '}
          <Link href="/register" className="font-semibold underline" style={{ color: 'var(--accent)' }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
