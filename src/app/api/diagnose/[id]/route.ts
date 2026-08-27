import { requireUser } from '@/lib/auth/session';
import { handle, notFound, ok } from '@/lib/api/respond';
import { loadSession } from '@/lib/diagnose/service';
import { serializeView } from '@/lib/diagnose/serialize';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const loaded = await loadSession(user, id);
  if (!loaded) return notFound('That diagnosis does not exist, or it belongs to another technician.');

  return ok({
    session: {
      id: loaded.session.id,
      title: loaded.session.title,
      complaint: loaded.session.complaint,
      equipmentType: loaded.session.equipmentType,
      refrigerant: loaded.session.refrigerant,
      phase: loaded.session.phase,
      startedAt: loaded.session.startedAt,
      completedAt: loaded.session.completedAt,
      jobId: loaded.session.jobId,
    },
    messages: loaded.session.messages,
    measurements: loaded.session.measurements,
    photos: loaded.session.photos.map((p) => ({
      id: p.id,
      kind: p.kind,
      caption: p.caption,
      analysis: p.analysis,
      createdAt: p.createdAt,
      storageKey: p.storageKey,
    })),
    view: serializeView(loaded.view),
  });
});
