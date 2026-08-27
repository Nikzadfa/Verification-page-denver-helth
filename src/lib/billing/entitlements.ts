/**
 * Entitlements.
 *
 * Plan limits live in the database so an administrator can change pricing and
 * quotas without a deploy. Everything here reads the Plan row; nothing
 * hard-codes a price or a limit except the bootstrap defaults used to seed an
 * empty database.
 *
 * The counters reset lazily: rather than running a scheduled job, the first
 * request in a new billing period rolls the period forward and zeroes the
 * counts. That keeps the system correct with no background infrastructure.
 */

import type { Plan, PlanTier, Subscription } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface Entitlements {
  tier: PlanTier;
  planName: string;
  diagnosesRemaining: number | 'unlimited';
  photosRemaining: number | 'unlimited';
  maxSeats: number;
  faultCodeLookup: boolean;
  photoAnalysis: boolean;
  savedJobs: boolean;
  serviceReports: boolean;
  companyDashboard: boolean;
  sharedKnowledge: boolean;
  periodEnd: Date | null;
  status: Subscription['status'];
}

/** Seed values for a database with no Plan rows yet. */
export const DEFAULT_PLANS: Array<
  Omit<Plan, 'id' | 'createdAt' | 'updatedAt' | 'stripeProductId' | 'stripePriceIdMonthly' | 'stripePriceIdYearly'>
> = [
  {
    tier: 'FREE',
    name: 'Free',
    description: 'Try the diagnostic engine. Limited diagnoses and basic fault-code lookup.',
    priceCentsMonthly: 0,
    priceCentsYearly: 0,
    currency: 'usd',
    maxDiagnosesPerMonth: 5,
    maxPhotosPerMonth: 0,
    maxSeats: 1,
    faultCodeLookup: true,
    photoAnalysis: false,
    savedJobs: false,
    serviceReports: false,
    companyDashboard: false,
    sharedKnowledge: false,
    prioritySupport: false,
    featureBullets: [
      '5 guided diagnoses per month',
      'Basic fault-code lookup',
      'Refrigerant P/T and superheat calculators',
    ],
    active: true,
    sortOrder: 0,
  },
  {
    tier: 'PRO',
    name: 'Pro',
    description: 'For the working technician. Unlimited diagnosis, photo analysis, saved jobs and reports.',
    priceCentsMonthly: 2999,
    priceCentsYearly: 29990,
    currency: 'usd',
    maxDiagnosesPerMonth: -1,
    maxPhotosPerMonth: -1,
    maxSeats: 1,
    faultCodeLookup: true,
    photoAnalysis: true,
    savedJobs: true,
    serviceReports: true,
    companyDashboard: false,
    sharedKnowledge: false,
    prioritySupport: false,
    featureBullets: [
      'Unlimited guided diagnoses',
      'Equipment photo analysis and model decoding',
      'Full manufacturer fault-code database',
      'Saved jobs and job history',
      'Service reports with PDF export',
      'Voice input in the field',
    ],
    active: true,
    sortOrder: 1,
  },
  {
    tier: 'COMPANY',
    name: 'Company',
    description: 'For contractors running a crew. Everything in Pro, across your whole team.',
    priceCentsMonthly: 7999,
    priceCentsYearly: 79990,
    currency: 'usd',
    maxDiagnosesPerMonth: -1,
    maxPhotosPerMonth: -1,
    maxSeats: 10,
    faultCodeLookup: true,
    photoAnalysis: true,
    savedJobs: true,
    serviceReports: true,
    companyDashboard: true,
    sharedKnowledge: true,
    prioritySupport: true,
    featureBullets: [
      'Everything in Pro, for every technician',
      'Company dashboard with job and technician views',
      'Shared private knowledge base — upload your own manuals',
      'Company-wide job management and reporting',
      'Branded service reports',
      'Priority support',
    ],
    active: true,
    sortOrder: 2,
  },
];

export async function ensurePlansSeeded(): Promise<void> {
  const count = await prisma.plan.count();
  if (count > 0) return;
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.create({ data: plan });
  }
}

/**
 * Resolve entitlements for a user. Company subscriptions take precedence over
 * a personal one so a technician added to a company seat is not billed twice
 * and is not held to the lower of two limits.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: { include: { plan: true } },
      company: { include: { subscription: { include: { plan: true } } } },
    },
  });

  if (!user) throw new Error('User not found');

  const subscription = user.company?.subscription ?? user.subscription ?? null;

  if (!subscription) {
    const free = await prisma.plan.findUnique({ where: { tier: 'FREE' } });
    return {
      tier: 'FREE',
      planName: free?.name ?? 'Free',
      diagnosesRemaining: free?.maxDiagnosesPerMonth === -1 ? 'unlimited' : (free?.maxDiagnosesPerMonth ?? 5),
      photosRemaining: free?.maxPhotosPerMonth === -1 ? 'unlimited' : (free?.maxPhotosPerMonth ?? 0),
      maxSeats: 1,
      faultCodeLookup: free?.faultCodeLookup ?? true,
      photoAnalysis: free?.photoAnalysis ?? false,
      savedJobs: free?.savedJobs ?? false,
      serviceReports: free?.serviceReports ?? false,
      companyDashboard: false,
      sharedKnowledge: false,
      periodEnd: null,
      status: 'ACTIVE',
    };
  }

  const rolled = await rollPeriodIfNeeded(subscription.id);
  const plan = subscription.plan;
  const usable = subscription.status === 'ACTIVE' || subscription.status === 'TRIALING';

  return {
    tier: usable ? plan.tier : 'FREE',
    planName: plan.name,
    diagnosesRemaining:
      !usable
        ? 0
        : plan.maxDiagnosesPerMonth === -1
          ? 'unlimited'
          : Math.max(0, plan.maxDiagnosesPerMonth - rolled.diagnosesUsed),
    photosRemaining:
      !usable
        ? 0
        : plan.maxPhotosPerMonth === -1
          ? 'unlimited'
          : Math.max(0, plan.maxPhotosPerMonth - rolled.photosUsed),
    maxSeats: plan.maxSeats,
    faultCodeLookup: plan.faultCodeLookup,
    photoAnalysis: usable && plan.photoAnalysis,
    savedJobs: usable && plan.savedJobs,
    serviceReports: usable && plan.serviceReports,
    companyDashboard: usable && plan.companyDashboard,
    sharedKnowledge: usable && plan.sharedKnowledge,
    periodEnd: subscription.currentPeriodEnd,
    status: subscription.status,
  };
}

async function rollPeriodIfNeeded(subscriptionId: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  const end = sub.currentPeriodEnd;
  if (!end || end > new Date()) return sub;

  const nextStart = end;
  const nextEnd = new Date(end);
  nextEnd.setMonth(nextEnd.getMonth() + 1);

  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      currentPeriodStart: nextStart,
      currentPeriodEnd: nextEnd,
      diagnosesUsed: 0,
      photosUsed: 0,
    },
  });
}

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly feature: string,
    public readonly upgradeTo: PlanTier,
  ) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export async function assertCanStartDiagnosis(userId: string): Promise<void> {
  const ent = await getEntitlements(userId);
  if (ent.diagnosesRemaining === 'unlimited') return;
  if (ent.diagnosesRemaining > 0) return;
  throw new QuotaExceededError(
    `You have used all ${ent.planName} diagnoses for this period. Upgrade to Pro for unlimited diagnoses.`,
    'diagnoses',
    'PRO',
  );
}

export async function assertCanAnalyzePhoto(userId: string): Promise<void> {
  const ent = await getEntitlements(userId);
  if (!ent.photoAnalysis) {
    throw new QuotaExceededError(
      'Photo analysis is a Pro feature. You can still enter the model and serial number by hand.',
      'photoAnalysis',
      'PRO',
    );
  }
  if (ent.photosRemaining !== 'unlimited' && ent.photosRemaining <= 0) {
    throw new QuotaExceededError('Photo analysis quota used for this period.', 'photoAnalysis', 'PRO');
  }
}

export async function assertCanUseReports(userId: string): Promise<void> {
  const ent = await getEntitlements(userId);
  if (!ent.serviceReports) {
    throw new QuotaExceededError(
      'Service reports are a Pro feature.',
      'serviceReports',
      'PRO',
    );
  }
}

/** Increment usage. Counts against the company subscription when there is one. */
export async function recordUsage(
  userId: string,
  kind: 'diagnosis' | 'photo',
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscription: { select: { id: true } }, company: { select: { subscription: { select: { id: true } } } } },
  });
  const subscriptionId = user?.company?.subscription?.id ?? user?.subscription?.id;
  if (!subscriptionId) return;

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: kind === 'diagnosis' ? { diagnosesUsed: { increment: 1 } } : { photosUsed: { increment: 1 } },
  });
}
