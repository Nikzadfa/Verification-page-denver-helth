/**
 * API response helpers.
 *
 * Errors are returned in one shape so the client never has to guess, and
 * unexpected exceptions never leak a stack trace or a database message to the
 * browser — they are logged server-side and returned as a generic failure.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth/session';
import { QuotaExceededError } from '@/lib/billing/entitlements';
import { AiUnavailableError } from '@/lib/ai/provider';

export interface ApiErrorBody {
  error: string;
  code: string;
  /** Field-level validation problems, when applicable. */
  fields?: Record<string, string[]>;
  /** For quota errors: what to upgrade to. */
  upgradeTo?: string;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, code = 'bad_request'): NextResponse {
  return NextResponse.json<ApiErrorBody>({ error: message, code }, { status });
}

/**
 * Wraps a route handler. Anything thrown is turned into a clean response with
 * the right status.
 */
export function handle<T extends unknown[], R extends Response = NextResponse>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R | NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AuthError) {
        return fail(error.message, error.status, error.status === 403 ? 'forbidden' : 'unauthenticated');
      }
      if (error instanceof QuotaExceededError) {
        return NextResponse.json<ApiErrorBody>(
          { error: error.message, code: 'quota_exceeded', upgradeTo: error.upgradeTo },
          { status: 402 },
        );
      }
      if (error instanceof AiUnavailableError) {
        return fail(error.message, 503, 'ai_unavailable');
      }
      if (error instanceof ZodError) {
        const fields: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const key = issue.path.join('.') || '_';
          (fields[key] ??= []).push(issue.message);
        }
        return NextResponse.json<ApiErrorBody>(
          { error: 'Some fields need attention.', code: 'validation_failed', fields },
          { status: 422 },
        );
      }
      if (error instanceof PrismaMissingError) {
        return fail(error.message, 503, 'database_unavailable');
      }

      // Anything else: log the detail, return something safe.
      console.error('[api] unhandled error', error);
      const message =
        error instanceof Error && /P1001|ECONNREFUSED|Can't reach database/.test(error.message)
          ? 'The database is not reachable. Check DATABASE_URL and that PostgreSQL is running.'
          : 'Something went wrong on our side. The failure has been logged.';
      return fail(message, 500, 'internal_error');
    }
  };
}

export class PrismaMissingError extends Error {}

export function notFound(what = 'That does not exist, or you do not have access to it.'): NextResponse {
  return fail(what, 404, 'not_found');
}
