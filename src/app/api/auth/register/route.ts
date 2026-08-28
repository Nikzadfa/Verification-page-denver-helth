import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  bootstrapRoleFor,
  createSession,
  hashPassword,
  setSessionCookie,
} from '@/lib/auth/session';
import { ensurePlansSeeded } from '@/lib/billing/entitlements';
import { registerSchema } from '@/lib/api/schemas';
import { fail, handle, ok } from '@/lib/api/respond';
import { slugify } from '@/lib/rag/retrieve';

export const POST = handle(async (request: NextRequest) => {
  const body = registerSchema.parse(await request.json());
  const email = body.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return fail('An account already exists for that email. Sign in instead.', 409, 'email_taken');
  }

  await ensurePlansSeeded();

  const role = bootstrapRoleFor(email);
  let companyId: string | null = null;
  let effectiveRole = role;

  if (body.companyName?.trim()) {
    const name = body.companyName.trim();
    const base = slugify(name);
    // Slugs are unique; suffix on collision rather than failing the sign-up.
    let slug = base;
    for (let i = 2; await prisma.company.findUnique({ where: { slug }, select: { id: true } }); i += 1) {
      slug = `${base}-${i}`;
    }
    const company = await prisma.company.create({ data: { name, slug } });
    companyId = company.id;
    if (role !== 'PLATFORM_ADMIN') effectiveRole = 'COMPANY_ADMIN';
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(body.password),
      fullName: body.fullName.trim(),
      phone: body.phone?.trim() || null,
      licenseNumber: body.licenseNumber?.trim() || null,
      epaCert: body.epaCert?.trim() || null,
      role: effectiveRole,
      companyId,
    },
  });

  const freePlan = await prisma.plan.findUnique({ where: { tier: 'FREE' } });
  if (freePlan) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await prisma.subscription.create({
      data: { userId: user.id, planId: freePlan.id, currentPeriodEnd: periodEnd },
    });
  }

  const { token, expiresAt } = await createSession(user, {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for'),
  });
  await setSessionCookie(token, expiresAt);

  return ok({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId },
  }, 201);
});
