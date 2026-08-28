/**
 * Customer scoping and summary.
 *
 * The scoping test is the important one. `Customer.companyId` is nullable, so
 * a technician who signs up without a company name has companyId = null — and
 * a query filtered on companyId alone would have matched every other
 * unaffiliated technician's customers. That is a cross-tenant leak of names,
 * phone numbers and home addresses, so it gets a test rather than a comment.
 */

import { describe, expect, it } from 'vitest';
import { customerData, customerScope, summarise } from '../src/lib/customers/service';
import type { CustomerListRow } from '../src/lib/customers/service';

describe('customer scoping', () => {
  it('limits a solo technician to rows they own', () => {
    const where = customerScope({ id: 'user-1', companyId: null });

    expect(where.ownerUserId).toBe('user-1');
    // Both halves matter: ownership alone would expose a company row the
    // technician created before joining, and companyId alone leaks across
    // every unaffiliated account.
    expect(where.companyId).toBeNull();
  });

  it('gives a company technician the company book, not just their own entries', () => {
    const where = customerScope({ id: 'user-1', companyId: 'company-9' });

    expect(where.companyId).toBe('company-9');
    expect(where.ownerUserId).toBeUndefined();
  });

  it('never produces an unfiltered query', () => {
    for (const user of [
      { id: 'a', companyId: null },
      { id: 'b', companyId: 'c' },
    ]) {
      expect(Object.keys(customerScope(user)).length).toBeGreaterThan(0);
    }
  });
});

describe('customer normalisation', () => {
  it('collapses whitespace and lowercases the email', () => {
    const data = customerData({
      name: '  M.   Delacroix ',
      email: ' M.Delacroix@Example.COM ',
      address: '4417  Birchwood Ln',
    });

    expect(data.name).toBe('M. Delacroix');
    expect(data.email).toBe('m.delacroix@example.com');
    expect(data.address).toBe('4417 Birchwood Ln');
  });

  it('turns blank fields into null rather than empty strings', () => {
    const data = customerData({ name: 'Okonkwo', phone: '   ', notes: '' });
    expect(data.phone).toBeNull();
    expect(data.notes).toBeNull();
  });
});

describe('dashboard summary', () => {
  const day = 24 * 60 * 60 * 1000;
  const rows: CustomerListRow[] = [
    row({ id: '1', openJobs: 2, jobCount: 5, lastServicedAt: new Date(Date.now() - 3 * day) }),
    row({ id: '2', openJobs: 0, jobCount: 1, lastServicedAt: new Date(Date.now() - 90 * day) }),
    row({ id: '3', openJobs: 1, jobCount: 1, lastServicedAt: null }),
    row({ id: '4', openJobs: 0, jobCount: 0, lastServicedAt: null }),
  ];

  it('counts open jobs across every customer, not customers with open jobs', () => {
    expect(summarise(rows).openJobs).toBe(3);
  });

  it('counts only the last thirty days as recently serviced', () => {
    expect(summarise(rows).servicedThisMonth).toBe(1);
  });

  it('treats a customer with an open job but no completed one as having history', () => {
    // Customer 3 has a job on the books; only customer 4 is genuinely new.
    expect(summarise(rows).neverServiced).toBe(1);
  });
});

function row(partial: {
  id: string;
  openJobs: number;
  jobCount: number;
  lastServicedAt: Date | null;
}): CustomerListRow {
  return {
    id: partial.id,
    name: `Customer ${partial.id}`,
    phone: null,
    email: null,
    address: null,
    city: null,
    state: null,
    jobCount: partial.jobCount,
    openJobs: partial.openJobs,
    lastServicedAt: partial.lastServicedAt ? partial.lastServicedAt.toISOString() : null,
  };
}
