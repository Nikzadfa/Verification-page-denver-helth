/**
 * Request validation. Every route body is parsed through one of these — no
 * route reads a raw JSON field directly.
 */

import { z } from 'zod';
import { EquipmentType } from '@prisma/client';

const equipmentTypes = Object.values(EquipmentType) as [EquipmentType, ...EquipmentType[]];

export const registerSchema = z.object({
  email: z.string().email('That does not look like an email address.').max(200),
  password: z
    .string()
    .min(10, 'Use at least 10 characters — this account holds customer job records.')
    .max(200),
  fullName: z.string().min(2, 'We need a name for service reports.').max(120),
  companyName: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  licenseNumber: z.string().max(60).optional(),
  epaCert: z.string().max(40).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export const startDiagnosisSchema = z.object({
  complaint: z.string().min(3, 'Tell me what the customer is reporting.').max(4000),
  equipmentType: z.enum(equipmentTypes).default('UNKNOWN'),
  manufacturer: z.string().max(80).nullish(),
  modelNumber: z.string().max(80).nullish(),
  serialNumber: z.string().max(80).nullish(),
  controlBoard: z.string().max(80).nullish(),
  refrigerant: z.string().max(20).nullish(),
  meteringDevice: z.enum(['TXV', 'EEV', 'FIXED_ORIFICE', 'CAPILLARY', 'UNKNOWN']).nullish(),
  mode: z.enum(['COOLING', 'HEATING', 'DEFROST', 'IDLE', 'UNKNOWN']).nullish(),
  faultCode: z.string().max(40).nullish(),
  jobId: z.string().uuid().nullish(),
  title: z.string().max(160).nullish(),
});

export const messageSchema = z.object({
  text: z.string().min(1).max(4000),
  /** Set when the message came from the microphone rather than the keyboard. */
  source: z.enum(['text', 'voice']).default('text'),
});

export const answerSchema = z.object({
  testId: z.string().min(1).max(80),
  optionValue: z.string().min(1).max(80),
});

export const skipSchema = z.object({
  testId: z.string().min(1).max(80),
  reason: z.string().max(400).optional(),
});

export const measurementsSchema = z.object({
  testId: z.string().max(80).nullish(),
  readings: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        value: z.number().finite().nullish(),
        text: z.string().max(120).nullish(),
        unit: z.string().max(20).nullish(),
        /**
         * Where the number came from. A reading off a wireless probe is not a
         * typed one and is not recorded as one — the service report says which
         * it was, because that is part of how defensible the reading is.
         */
        source: z.enum(['manual', 'voice', 'probe']).default('manual'),
        /** Which probe, for a probe reading. */
        note: z.string().max(160).nullish(),
      }),
    )
    .min(1)
    .max(60),
});

export const faultCodeQuerySchema = z.object({
  manufacturer: z.string().min(1).max(60),
  code: z.string().min(1).max(40),
  equipmentType: z.enum(equipmentTypes).nullish(),
  modelNumber: z.string().max(80).nullish(),
  controlBoard: z.string().max(80).nullish(),
});

export const decodeSchema = z.object({
  modelNumber: z.string().min(2, 'Enter the model number from the rating plate.').max(80),
  serialNumber: z.string().max(80).nullish(),
  manufacturer: z.string().max(60).nullish(),
});

export const jobSchema = z.object({
  title: z.string().min(2).max(160),
  complaint: z.string().max(4000).optional(),
  /** An existing customer. Takes precedence over the typed-in fields below. */
  customerId: z.string().uuid().nullish(),
  customerName: z.string().max(160).optional(),
  customerPhone: z.string().max(40).optional(),
  customerAddress: z.string().max(240).optional(),
  jobNumber: z.string().max(60).optional(),
});

export const customerSchema = z.object({
  name: z.string().min(2, 'A customer needs a name to file the job under.').max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email('That does not look like an email address.').max(200).optional().or(z.literal('')),
  address: z.string().max(240).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  postal: z.string().max(20).optional(),
  notes: z.string().max(4000).optional(),
});

/** Every field optional — a PATCH changes only what it names. */
export const customerPatchSchema = customerSchema.partial();

export const reportSchema = z.object({
  sessionId: z.string().uuid(),
  technicianNotes: z.string().max(6000).optional(),
  finalize: z.boolean().default(false),
});

export const knowledgeDocSchema = z.object({
  title: z.string().min(2).max(240),
  type: z
    .enum([
      'SERVICE_MANUAL',
      'INSTALLATION_MANUAL',
      'TROUBLESHOOTING_GUIDE',
      'WIRING_DIAGRAM',
      'TECHNICAL_BULLETIN',
      'FAULT_CODE_SHEET',
      'SPECIFICATION',
      'TRAINING',
      'OTHER',
    ])
    .default('OTHER'),
  manufacturerSlug: z.string().max(60).nullish(),
  equipmentTypes: z.array(z.enum(equipmentTypes)).default([]),
  modelSeries: z.array(z.string().max(40)).default([]),
  publication: z.string().max(80).nullish(),
  /** Plain text extracted client-side or supplied directly. */
  text: z.string().min(20, 'There is no usable text in this document.').max(4_000_000),
  companyPrivate: z.boolean().default(false),
});

export const planUpdateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(400).optional(),
  priceCentsMonthly: z.number().int().min(0).max(1_000_000).optional(),
  priceCentsYearly: z.number().int().min(0).max(10_000_000).optional(),
  maxDiagnosesPerMonth: z.number().int().min(-1).max(100_000).optional(),
  maxPhotosPerMonth: z.number().int().min(-1).max(100_000).optional(),
  maxSeats: z.number().int().min(1).max(10_000).optional(),
  photoAnalysis: z.boolean().optional(),
  savedJobs: z.boolean().optional(),
  serviceReports: z.boolean().optional(),
  companyDashboard: z.boolean().optional(),
  sharedKnowledge: z.boolean().optional(),
  active: z.boolean().optional(),
  featureBullets: z.array(z.string().max(160)).max(20).optional(),
});

export const evalCaseSchema = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only.'),
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(40),
  tags: z.array(z.string().max(40)).max(12).default([]),
  scenario: z.record(z.unknown()),
  expectations: z.array(z.record(z.unknown())).min(1),
  active: z.boolean().default(true),
});

export const evalRunSchema = z.object({
  label: z.string().max(120).default('Manual run'),
  caseIds: z.array(z.string().uuid()).optional(),
  /** Also run the LLM prose judge. Costs tokens. */
  includeProseJudge: z.boolean().default(false),
});
