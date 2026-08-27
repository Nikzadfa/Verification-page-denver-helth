/**
 * Authentication.
 *
 * Opaque session tokens stored as SHA-256 hashes, carried in an httpOnly,
 * SameSite=Lax cookie. A signed JWT is also issued so middleware can do a
 * cheap edge-side check without a database round trip, but the JWT is only
 * ever a fast path — every server route that reads user identity revalidates
 * against the AuthSession row, so revoking a session takes effect immediately
 * rather than at token expiry.
 *
 * Passwords use bcrypt. The cost factor is deliberately above the library
 * default because a technician logs in once per shift, not once per request.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { User, UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';

const COOKIE_NAME = 'tr_session';
const BCRYPT_ROUNDS = 12;

function ttlSeconds(): number {
  const raw = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  return Number.isFinite(raw) && raw > 0 ? raw : 60 * 60 * 24 * 30;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or shorter than 32 characters. Generate one with `openssl rand -base64 48` and set it in the environment. Refusing to run with a weak session secret.',
    );
  }
  return new TextEncoder().encode(secret);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface SessionPayload {
  sub: string;
  role: UserRole;
  companyId: string | null;
  jti: string;
}

export async function createSession(
  user: Pick<User, 'id' | 'role' | 'companyId'>,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlSeconds() * 1000);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    },
  });

  const jwt = await new SignJWT({
    role: user.role,
    companyId: user.companyId,
    jti: hashToken(raw).slice(0, 16),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  // The cookie carries `<opaque>.<jwt>`: the opaque half is the authority, the
  // JWT half lets middleware reject obviously-invalid requests at the edge.
  return { token: `${raw}.${jwt}`, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string | null;
}

/**
 * Resolve the current user. Always revalidates against the database so a
 * revoked or expired session stops working immediately.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  const [raw] = cookie.split('.');
  if (!raw) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  // Cheap last-seen tracking without writing on every request.
  const lastSeen = session.user.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeen > 5 * 60 * 1000) {
    await prisma.user
      .update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    role: session.user.role,
    companyId: session.user.companyId,
  };
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Not signed in', 401);
  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== 'PLATFORM_ADMIN') throw new AuthError('Administrator access required', 403);
  return user;
}

export async function requireCompanyAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== 'COMPANY_ADMIN' && user.role !== 'PLATFORM_ADMIN') {
    throw new AuthError('Company administrator access required', 403);
  }
  return user;
}

export async function revokeSession(token: string): Promise<void> {
  const [raw] = token.split('.');
  if (!raw) return;
  await prisma.authSession.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (cookie) await revokeSession(cookie);
  await clearSessionCookie();
}

/** Edge-safe check used by middleware. Does not touch the database. */
export async function verifyJwtHalf(cookieValue: string): Promise<SessionPayload | null> {
  const parts = cookieValue.split('.');
  // `<opaque>.<header>.<payload>.<signature>`
  if (parts.length < 4) return null;
  const jwt = parts.slice(1).join('.');
  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    return {
      sub: String(payload.sub),
      role: payload.role as UserRole,
      companyId: (payload.companyId as string | null) ?? null,
      jti: String(payload.jti ?? ''),
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Constant-time compare, for anywhere a secret is checked by equality. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * The first account to register with an email listed in BOOTSTRAP_ADMIN_EMAILS
 * becomes a platform admin. Everything else is a technician until promoted.
 */
export function bootstrapRoleFor(email: string): UserRole {
  const list = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase()) ? 'PLATFORM_ADMIN' : 'TECHNICIAN';
}
