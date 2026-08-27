import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { AppHeader, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminFaultCodesPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect('/login');
  if (admin.role !== 'PLATFORM_ADMIN') redirect('/');

  const [manufacturers, byVerification, ambiguous] = await Promise.all([
    prisma.manufacturer
      .findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { faultCodes: true, models: true, boards: true, documents: true } } },
      })
      .catch(() => []),
    prisma.faultCode.groupBy({ by: ['verification'], _count: true }).catch(() => []),
    // Codes that resolve to more than one meaning within a manufacturer are
    // the ones the resolver must refuse to answer without a board. Surfacing
    // them here tells an administrator where documentation is most needed.
    prisma.faultCode
      .groupBy({
        by: ['manufacturerId', 'code', 'equipmentType'],
        _count: true,
        having: { code: { _count: { gt: 1 } } },
      })
      .catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <AppHeader title="Fault codes" back="/admin" />

      <div className="space-y-4 px-3 py-4">
        <Card>
          <p className="tr-label">Verification status</p>
          <ul className="text-sm">
            {byVerification.map((v) => (
              <li key={v.verification} className="flex items-center justify-between border-t py-2" style={{ borderColor: 'var(--border)' }}>
                <span
                  className={`tr-chip ${
                    v.verification === 'CONFIRMED'
                      ? 'sev-NORMAL'
                      : v.verification === 'DISPUTED'
                        ? 'sev-CRITICAL'
                        : 'sev-WATCH'
                  }`}
                >
                  {v.verification}
                </span>
                <span className="font-mono tabular-nums">{v._count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Anything not CONFIRMED is shown to technicians with a &ldquo;verify against the
            manufacturer&rsquo;s documentation&rdquo; banner, and the assistant is not permitted to
            state it as fact. Promote a code to CONFIRMED by linking it to a manufacturer document
            in the knowledge base.
          </p>
        </Card>

        <Card>
          <p className="tr-label">Codes with more than one meaning ({ambiguous.length})</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            These resolve to AMBIGUOUS unless the technician supplies the control board. That is
            correct behaviour, not a data problem — but each one is a place where board-scoped
            documentation would let the product give a single answer.
          </p>
          {ambiguous.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {ambiguous.slice(0, 40).map((a, i) => (
                <li key={`${a.code}-${i}`} className="tr-chip sev-WATCH font-mono">
                  {a.code} ({a._count})
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="tr-label">Manufacturers</p>
          <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
            {manufacturers.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{m.name}</span>
                  {m.parent && (
                    <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                      shares engineering with {m.parent}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                  {m._count.faultCodes} codes · {m._count.boards} boards
                  <span className="block">
                    {m._count.models} models · {m._count.documents} docs
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
