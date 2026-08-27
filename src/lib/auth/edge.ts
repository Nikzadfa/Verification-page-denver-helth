/**
 * Edge-safe half of the auth module.
 *
 * Middleware runs on the edge runtime, where bcrypt and Prisma are not
 * available. This file therefore imports nothing but `jose`, so it can verify
 * the signed half of the session cookie without dragging the database client
 * into the edge bundle.
 *
 * IMPORTANT: this check is a fast path, never an authorization decision. It
 * can only reject; it never grants. A request that passes here is still
 * revalidated against the AuthSession row by the page or route handler, so a
 * revoked session stops working immediately rather than at token expiry.
 */

import { jwtVerify } from 'jose';

export const SESSION_COOKIE = 'tr_session';

export interface EdgeSessionClaims {
  sub: string;
  role: string;
  companyId: string | null;
}

function secretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

/**
 * The cookie is `<opaque>.<jwt>`. The opaque half is the authority and is
 * checked server-side; the JWT half is what middleware can verify cheaply.
 */
export async function readEdgeSession(cookieValue: string | undefined): Promise<EdgeSessionClaims | null> {
  if (!cookieValue) return null;

  const parts = cookieValue.split('.');
  // opaque + header + payload + signature
  if (parts.length < 4) return null;

  const key = secretKey();
  // With no usable secret the fast path is simply unavailable. Fail open here
  // and let the server-side check decide, rather than locking everyone out of
  // a deployment whose AUTH_SECRET is misconfigured.
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(parts.slice(1).join('.'), key);
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      role: String(payload.role ?? 'TECHNICIAN'),
      companyId: (payload.companyId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
