import { revokeCurrentSession } from '@/lib/auth/session';
import { handle, ok } from '@/lib/api/respond';

export const POST = handle(async () => {
  await revokeCurrentSession();
  return ok({ ok: true });
});
