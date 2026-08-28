import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession, setSessionCookie, verifyPassword } from '@/lib/auth/session';
import { loginSchema } from '@/lib/api/schemas';
import { fail, handle, ok } from '@/lib/api/respond';

export const POST = handle(async (request: NextRequest) => {
  const body = loginSchema.parse(await request.json());
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });

  // Same message and roughly the same work either way, so the response does
  // not reveal whether an account exists.
  const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
  if (!user || !valid) {
    return fail('That email and password do not match an account.', 401, 'invalid_credentials');
  }
  if (user.status !== 'ACTIVE') {
    return fail('That account is not active. Contact your company administrator.', 403, 'account_inactive');
  }

  const { token, expiresAt } = await createSession(user, {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for'),
  });
  await setSessionCookie(token, expiresAt);

  return ok({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      companyId: user.companyId,
    },
  });
});
