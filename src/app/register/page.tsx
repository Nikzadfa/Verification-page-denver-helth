'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, ErrorNote, Spinner, ThemeToggle, api } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    companyName: '',
    licenseNumber: '',
    epaCert: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          companyName: form.companyName.trim() || undefined,
          licenseNumber: form.licenseNumber.trim() || undefined,
          epaCert: form.epaCert.trim() || undefined,
        }),
      });
      router.push('/');
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldErrors(e.fields ?? {});
      } else {
        setError('Could not create the account. Check your connection.');
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) => fieldErrors[key]?.[0];

  return (
    <div className="mx-auto max-w-md px-4 pb-16">
      <div className="flex justify-end pt-2">
        <ThemeToggle />
      </div>

      <h1 className="mt-4 text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        Your license and EPA certification appear on the service reports you generate. Both are
        optional now and editable later.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="tr-label" htmlFor="fullName">
            Full name
          </label>
          <input id="fullName" required className="tr-input" value={form.fullName} onChange={set('fullName')} autoComplete="name" />
          {fieldError('fullName') && <p className="mt-1 text-xs" style={{ color: 'var(--color-alert-400)' }}>{fieldError('fullName')}</p>}
        </div>

        <div>
          <label className="tr-label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" inputMode="email" required className="tr-input" value={form.email} onChange={set('email')} autoComplete="email" />
          {fieldError('email') && <p className="mt-1 text-xs" style={{ color: 'var(--color-alert-400)' }}>{fieldError('email')}</p>}
        </div>

        <div>
          <label className="tr-label" htmlFor="password">
            Password
          </label>
          <input id="password" type="password" required className="tr-input" value={form.password} onChange={set('password')} autoComplete="new-password" />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
            At least 10 characters. This account holds customer job records.
          </p>
          {fieldError('password') && <p className="mt-1 text-xs" style={{ color: 'var(--color-alert-400)' }}>{fieldError('password')}</p>}
        </div>

        <div>
          <label className="tr-label" htmlFor="companyName">
            Company name <span style={{ color: 'var(--text-dim)' }}>(optional)</span>
          </label>
          <input id="companyName" className="tr-input" value={form.companyName} onChange={set('companyName')} autoComplete="organization" />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
            Enter one to create a company and become its administrator. Leave it blank to work solo.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="tr-label" htmlFor="licenseNumber">
              License #
            </label>
            <input id="licenseNumber" className="tr-input" value={form.licenseNumber} onChange={set('licenseNumber')} />
          </div>
          <div>
            <label className="tr-label" htmlFor="epaCert">
              EPA cert
            </label>
            <select id="epaCert" className="tr-input" value={form.epaCert} onChange={set('epaCert')}>
              <option value="">—</option>
              <option value="Type I">Type I</option>
              <option value="Type II">Type II</option>
              <option value="Type III">Type III</option>
              <option value="Universal">Universal</option>
            </select>
          </div>
        </div>

        <ErrorNote>{error}</ErrorNote>

        <button type="submit" className="tr-btn tr-btn-primary w-full" disabled={busy}>
          {busy ? <Spinner label="Creating account" /> : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link href="/login" className="font-semibold underline" style={{ color: 'var(--accent)' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
