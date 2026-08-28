import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { customerSchema } from '@/lib/api/schemas';
import { findOrCreateCustomer, listCustomers, summarise } from '@/lib/customers/service';
import { handle, ok } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const query = request.nextUrl.searchParams.get('q');
  const customers = await listCustomers(user, query);
  return ok({ customers, summary: summarise(customers) });
});

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  const body = customerSchema.parse(await request.json());
  // Adding a customer who is already on file returns the existing record
  // rather than a second copy of the same house.
  const customer = await findOrCreateCustomer(user, { ...body, email: body.email || null });
  return ok({ customer }, 201);
});
