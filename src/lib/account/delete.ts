/**
 * Account deletion.
 *
 * App Store Review Guideline 5.1.1(v) requires that an app offering account
 * creation also offers account deletion from inside the app. Beyond the
 * guideline, a technician who leaves the trade should be able to take their
 * customers' addresses and phone numbers with them.
 *
 * What "delete" means here is stated plainly rather than implied:
 *
 *  - Photographs are removed from object storage first. Database rows cascade;
 *    stored files do not, and a file nobody has a row pointing at is the worst
 *    kind of leftover — invisible and permanent.
 *  - Customers belonging to a solo technician go with the account. Customers
 *    belonging to a company stay: they are the company's records, not this
 *    user's, and the company keeps operating.
 *  - Knowledge documents the user uploaded stay, with the uploader detached.
 *    They may be the company's manuals, and the schema already detaches rather
 *    than cascades.
 *
 * A company administrator deleting themselves would strand the company, so
 * that is refused rather than half-done.
 */

import { prisma } from '@/lib/db';
import { deleteObject } from '@/lib/storage';

export class AccountDeletionError extends Error {}

export interface DeletionSummary {
  photosRemoved: number;
  photosOrphaned: number;
  customersRemoved: number;
}

export async function deleteAccount(userId: string): Promise<DeletionSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, companyId: true },
  });
  if (!user) throw new AccountDeletionError('That account no longer exists.');

  if (user.role === 'COMPANY_ADMIN' && user.companyId) {
    const others = await prisma.user.count({
      where: { companyId: user.companyId, id: { not: user.id } },
    });
    if (others > 0) {
      throw new AccountDeletionError(
        'You are the administrator of a company with other technicians on it. Transfer the company to another administrator, or remove the other technicians first — deleting your account now would lock them out of their own jobs.',
      );
    }
  }

  const photos = await prisma.photo.findMany({
    where: { userId: user.id },
    select: { storageKey: true },
  });

  let photosRemoved = 0;
  let photosOrphaned = 0;
  for (const photo of photos) {
    try {
      await deleteObject(photo.storageKey);
      photosRemoved += 1;
    } catch (error) {
      // Storage being briefly unavailable must not block the deletion — the
      // user asked to leave. The count is reported so the failure is visible
      // rather than swallowed.
      photosOrphaned += 1;
      console.error('[account] could not delete stored photo', photo.storageKey, error);
    }
  }

  // A solo technician's customers exist only for them.
  const customersRemoved = user.companyId
    ? 0
    : (await prisma.customer.deleteMany({ where: { ownerUserId: user.id, companyId: null } })).count;

  // Everything else — sessions, jobs, reports, photos, subscription, usage —
  // cascades from the User row.
  await prisma.user.delete({ where: { id: user.id } });

  return { photosRemoved, photosOrphaned, customersRemoved };
}
