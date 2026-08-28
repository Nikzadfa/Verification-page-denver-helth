import { getCurrentUser } from '@/lib/auth/session';
import { getEntitlements } from '@/lib/billing/entitlements';
import { handle, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null, entitlements: null });
  const entitlements = await getEntitlements(user.id).catch(() => null);
  return ok({ user, entitlements });
});
