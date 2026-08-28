import Link from 'next/link';

/**
 * Legal and support pages.
 *
 * Deliberately outside the signed-in shell: App Store Connect wants public
 * URLs for the privacy policy and for support, and a reviewer follows them
 * before they have an account.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ThermoRivet
      </Link>
      <article className="tr-prose mt-4">{children}</article>
      <nav className="mt-10 flex flex-wrap gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/support">Support</Link>
      </nav>
    </div>
  );
}
