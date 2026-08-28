import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { loadSession } from '@/lib/diagnose/service';
import { serializeView } from '@/lib/diagnose/serialize';
import { AppHeader } from '@/components/ui';
import { DiagnosisSession, type SessionMessage } from '@/components/DiagnosisSession';

export const dynamic = 'force-dynamic';

export default async function DiagnosePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const loaded = await loadSession(user, id);
  if (!loaded) notFound();

  const messages: SessionMessage[] = loaded.session.messages
    // The opening technician message is the complaint, already shown in its
    // own card at the top.
    .slice(1)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      citations: (m.citations as Array<{ documentTitle: string; page?: number | null }> | null) ?? null,
    }));

  return (
    <div className="mx-auto max-w-2xl">
      <AppHeader title={loaded.session.title} back="/" />
      <DiagnosisSession
        sessionId={loaded.session.id}
        title={loaded.session.title}
        complaint={loaded.session.complaint}
        refrigerant={loaded.session.refrigerant}
        initialMessages={messages}
        initialView={serializeView(loaded.view)}
      />
    </div>
  );
}
