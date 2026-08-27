'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/* ---------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={`tr-card p-4 ${className}`}>{children}</Tag>;
}

export function Severity({ level }: { level: string }) {
  const label =
    level === 'CRITICAL'
      ? 'Critical'
      : level === 'ABNORMAL'
        ? 'Out of range'
        : level === 'WATCH'
          ? 'Marginal'
          : level === 'NORMAL'
            ? 'In range'
            : level;
  return <span className={`tr-chip sev-${level}`}>{label}</span>;
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
      <span
        aria-hidden
        className="tr-pulse inline-block h-2 w-2 rounded-full"
        style={{ background: 'var(--accent)' }}
      />
      {label}…
    </span>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-alert-500) 50%, transparent)',
        background: 'color-mix(in srgb, var(--color-alert-500) 12%, transparent)',
        color: 'var(--color-alert-400)',
      }}
    >
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * Safety banner
 *
 * Rendered ABOVE the instruction it applies to, never below and never
 * collapsed. A LETHAL hazard cannot be dismissed.
 * ------------------------------------------------------------------------- */

export interface HazardView {
  id: string;
  level: string;
  title: string;
  warning: string;
  precautions: string[];
}

export function HazardBanner({ hazards }: { hazards: HazardView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!hazards.length) return null;

  const order = { LETHAL: 0, SERIOUS: 1, CAUTION: 2 } as Record<string, number>;
  const sorted = [...hazards].sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));

  return (
    <div className="space-y-2">
      {sorted.map((h) => {
        const open = expanded === h.id;
        return (
          <div key={h.id} className={`hazard-${h.level} rounded-lg p-3`}>
            <div className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-base leading-none">
                {h.level === 'LETHAL' ? '⛔' : h.level === 'SERIOUS' ? '⚠️' : 'ℹ️'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  <span className={`tr-chip sev-${h.level} mr-2`}>{h.level}</span>
                  {h.title}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {h.warning}
                </p>
                {h.precautions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : h.id)}
                      className="mt-2 text-xs font-semibold underline"
                      style={{ color: 'var(--text-muted)', minHeight: '2rem' }}
                      aria-expanded={open}
                    >
                      {open ? 'Hide precautions' : `Precautions (${h.precautions.length})`}
                    </button>
                    {open && (
                      <ul className="mt-2 space-y-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {h.precautions.map((p) => (
                          <li key={p} className="flex gap-2">
                            <span aria-hidden>•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Confidence bar
 *
 * Shows the ranking without implying more precision than the engine has. The
 * numbers are rounded and the bar is the primary signal.
 * ------------------------------------------------------------------------- */

export function ConfidenceRow({
  label,
  statement,
  posterior,
  support,
}: {
  label: string;
  statement?: string;
  posterior: number;
  support?: Array<{ label: string; weight: string }>;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(posterior * 100);
  const tone = pct >= 60 ? 'var(--color-good-400)' : pct >= 30 ? 'var(--color-warn-400)' : 'var(--text-dim)';

  return (
    <div className="py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left"
        style={{ minHeight: '2.75rem' }}
        aria-expanded={open}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{label}</span>
          <span className="font-mono text-sm tabular-nums" style={{ color: tone }}>
            {pct}%
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--bg-inset)' }}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${Math.max(2, pct)}%`, background: tone }}
          />
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {statement && <p>{statement}</p>}
          {support?.length ? (
            <ul className="space-y-1">
              {support.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className={`tr-chip ${weightClass(s.weight)}`}>{weightLabel(s.weight)}</span>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

function weightLabel(w: string): string {
  switch (w) {
    case 'PATHOGNOMONIC':
      return 'Decisive';
    case 'STRONG_FOR':
      return 'Strong for';
    case 'FOR':
      return 'For';
    case 'WEAK_FOR':
      return 'Slight for';
    case 'WEAK_AGAINST':
      return 'Slight against';
    case 'AGAINST':
      return 'Against';
    case 'STRONG_AGAINST':
      return 'Strong against';
    case 'RULES_OUT':
      return 'Rules out';
    default:
      return w;
  }
}

function weightClass(w: string): string {
  if (w === 'RULES_OUT' || w === 'STRONG_AGAINST' || w === 'AGAINST' || w === 'WEAK_AGAINST') {
    return 'sev-INFO';
  }
  if (w === 'PATHOGNOMONIC' || w === 'STRONG_FOR') return 'sev-NORMAL';
  return 'sev-WATCH';
}

/* ---------------------------------------------------------------------------
 * App chrome
 * ------------------------------------------------------------------------- */

export function AppHeader({
  title,
  back,
  right,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-2 border-b px-3 py-2"
      style={{ background: 'var(--bg)', paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      {back ? (
        <Link
          href={back}
          className="tr-btn tr-btn-ghost px-2"
          aria-label="Back"
          style={{ minWidth: '2.75rem' }}
        >
          <span aria-hidden>←</span>
        </Link>
      ) : (
        <span className="px-2 text-lg" aria-hidden>
          🔧
        </span>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-bold">{title}</h1>
      {right}
      <ThemeToggle />
    </header>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('tr-theme') as 'light' | 'dark' | null;
    setTheme(stored ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  }, []);

  const toggle = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('tr-theme', next);
    } catch {
      // Private browsing blocks storage; the toggle still works for this
      // session, it just will not be remembered.
    }
  }, [theme]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="tr-btn tr-btn-ghost px-2"
      style={{ minWidth: '2.75rem' }}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span aria-hidden>{theme === 'light' ? '🌙' : '☀️'}</span>
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="tr-btn tr-btn-ghost text-sm"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Fetch helper
 * ------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public fields?: Record<string, string[]>,
    public upgradeTo?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: { error?: string; code?: string; fields?: Record<string, string[]>; upgradeTo?: string } = {};
    try {
      body = await response.json();
    } catch {
      // A non-JSON error body (a proxy timeout page, say) still needs to
      // surface something a technician can act on.
    }
    throw new ApiError(
      body.error ?? `Request failed (${response.status}).`,
      body.code ?? 'unknown',
      response.status,
      body.fields,
      body.upgradeTo,
    );
  }

  return response.json() as Promise<T>;
}
