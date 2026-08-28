/**
 * Customer records.
 *
 * Two things matter here and neither is negotiable.
 *
 * SCOPE. A customer belongs to a company when the technician has one, and to
 * the technician personally when they do not. `customerScope` is the only
 * place that decision is made; every read and every write goes through it, so
 * there is no path that returns a row the caller should not see. Scoping on
 * `companyId` alone would have put every unaffiliated technician's customers
 * into one shared NULL bucket.
 *
 * IDENTITY. A service address is typed by hand, from a van, often twice for
 * the same house. `findOrCreateCustomer` matches on a normalised name plus
 * whichever of phone or address is present, so a second visit attaches to the
 * existing record instead of forking the history the technician came here to
 * read.
 */

import { Prisma } from '@prisma/client';
import type { Customer } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { AuthenticatedUser } from '@/lib/auth/session';

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal?: string | null;
  notes?: string | null;
}

/**
 * The `where` fragment that limits customers to what this user may see.
 *
 * A company technician sees the company's book — that is the point of a shared
 * customer list. A solo technician sees only rows they own.
 */
export function customerScope(user: Pick<AuthenticatedUser, 'id' | 'companyId'>): Prisma.CustomerWhereInput {
  return user.companyId ? { companyId: user.companyId } : { companyId: null, ownerUserId: user.id };
}

/** Trim, collapse runs of whitespace, and return null for anything empty. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Comparison key for duplicate detection: case and punctuation insensitive. */
function fold(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Last 10 digits, so (555) 010-2277 and 555-010-2277 and +1 555 010 2277 match. */
function foldPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/** Every field present and normalised, so callers never handle `undefined`. */
export interface CustomerFields {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  notes: string | null;
}

export function customerData(input: CustomerInput): CustomerFields {
  return {
    name: clean(input.name) ?? '',
    phone: clean(input.phone),
    email: clean(input.email)?.toLowerCase() ?? null,
    address: clean(input.address),
    city: clean(input.city),
    state: clean(input.state),
    postal: clean(input.postal),
    notes: clean(input.notes),
  };
}

/**
 * Find the customer this input already refers to, or create it.
 *
 * A name on its own is not enough to merge on — two households called "Smith"
 * are two customers — so a match needs the name plus a phone number or a
 * street address in common.
 */
export async function findOrCreateCustomer(
  user: Pick<AuthenticatedUser, 'id' | 'companyId'>,
  input: CustomerInput,
): Promise<Customer> {
  const data = customerData(input);
  if (!data.name) throw new Error('A customer needs a name.');

  const candidates = await prisma.customer.findMany({
    where: { ...customerScope(user), name: { equals: data.name, mode: 'insensitive' } },
    take: 25,
  });

  const wantPhone = foldPhone(data.phone);
  const wantAddress = fold(data.address);

  const match = candidates.find((c) => {
    const samePhone = wantPhone !== null && foldPhone(c.phone) === wantPhone;
    const sameAddress = wantAddress !== null && fold(c.address) === wantAddress;
    // With neither a phone nor an address to compare, a lone name match is
    // still the best evidence available — but only when the existing record
    // has nothing to contradict it.
    const nothingToCompare =
      wantPhone === null && wantAddress === null && c.phone === null && c.address === null;
    return samePhone || sameAddress || nothingToCompare;
  });

  if (match) {
    // Fill in blanks the technician has now supplied, without overwriting
    // anything already recorded.
    const fill: Prisma.CustomerUpdateInput = {};
    if (!match.phone && data.phone) fill.phone = data.phone;
    if (!match.email && data.email) fill.email = data.email;
    if (!match.address && data.address) fill.address = data.address;
    if (!match.city && data.city) fill.city = data.city;
    if (!match.state && data.state) fill.state = data.state;
    if (!match.postal && data.postal) fill.postal = data.postal;
    if (Object.keys(fill).length === 0) return match;
    return prisma.customer.update({ where: { id: match.id }, data: fill });
  }

  return prisma.customer.create({
    data: { ...data, companyId: user.companyId, ownerUserId: user.id },
  });
}

/** Confirm a customer id belongs to this user's scope. Returns null if not. */
export async function getScopedCustomer(
  user: Pick<AuthenticatedUser, 'id' | 'companyId'>,
  customerId: string,
): Promise<Customer | null> {
  return prisma.customer.findFirst({ where: { ...customerScope(user), id: customerId } });
}

export interface CustomerListRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  jobCount: number;
  openJobs: number;
  lastServicedAt: string | null;
}

export interface CustomerSummary {
  customers: number;
  openJobs: number;
  servicedThisMonth: number;
  neverServiced: number;
}

/**
 * The dashboard list.
 *
 * Sorted by most recently serviced rather than alphabetically: the customer a
 * technician wants is nearly always one they were at recently, and a name they
 * are hunting for is a search away.
 */
export async function listCustomers(
  user: Pick<AuthenticatedUser, 'id' | 'companyId'>,
  query?: string | null,
): Promise<CustomerListRow[]> {
  const term = clean(query ?? null);
  const where: Prisma.CustomerWhereInput = term
    ? {
        ...customerScope(user),
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { address: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      }
    : customerScope(user);

  const customers = await prisma.customer.findMany({
    where,
    take: 200,
    orderBy: { updatedAt: 'desc' },
    include: {
      jobs: {
        select: { status: true, completedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
    },
  });

  const rows = customers.map((c) => {
    const serviced = c.jobs
      .map((j) => j.completedAt ?? null)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      city: c.city,
      state: c.state,
      jobCount: c.jobs.length,
      openJobs: c.jobs.filter((j) => j.status === 'OPEN' || j.status === 'IN_PROGRESS' || j.status === 'DIAGNOSED').length,
      lastServicedAt: serviced ? serviced.toISOString() : null,
    };
  });

  rows.sort((a, b) => {
    const at = a.lastServicedAt ? Date.parse(a.lastServicedAt) : 0;
    const bt = b.lastServicedAt ? Date.parse(b.lastServicedAt) : 0;
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export function summarise(rows: CustomerListRow[]): CustomerSummary {
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return {
    customers: rows.length,
    openJobs: rows.reduce((total, r) => total + r.openJobs, 0),
    servicedThisMonth: rows.filter(
      (r) => r.lastServicedAt !== null && Date.parse(r.lastServicedAt) >= monthAgo,
    ).length,
    neverServiced: rows.filter((r) => r.jobCount === 0).length,
  };
}
