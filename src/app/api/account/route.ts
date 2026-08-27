import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { clearSessionCookie, requireUser, verifyPassword } from '@/lib/auth/session';
import { AccountDeletionError, deleteAccount } from '@/lib/account/delete';
import { getEntitlements } from '@/lib/billing/entitlements';
import { fail, handle, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await requireUser();
  const [profile, entitlements] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        licenseNumber: true,
        epaCert: true,
        createdAt: true,
        company: { select: { name: true } },
      },
    }),
    getEntitlements(user.id).catch(() => null),
  ]);
  return ok({ profile, entitlements });
});

const deleteSchema = z.object({
  /** The account password. A borrowed unlocked phone should not be enough. */
  password: z.string().min(1, 'Enter your password to confirm.').max(200),
  confirm: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE to confirm.' }),
  }),
});

export const DELETE = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const body = deleteSchema.parse(await request.json());

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !(await verifyPassword(body.password, record.passwordHash))) {
    return fail('That password is not right.', 401, 'bad_credentials');
  }

  try {
    const summary = await deleteAccount(user.id);
    await clearSessionCookie();
    return ok({ deleted: true, ...summary });
  } catch (error) {
    if (error instanceof AccountDeletionError) return fail(error.message, 409, 'deletion_blocked');
    throw error;
  }
});
