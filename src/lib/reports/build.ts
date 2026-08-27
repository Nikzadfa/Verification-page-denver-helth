/**
 * Assemble a service report from a completed (or in-progress) diagnostic
 * session. Pure data assembly — the PDF renderer consumes the same structure
 * the UI shows, so what the technician reviews on screen is what the customer
 * receives.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { evaluate } from '@/lib/engine/session';
import type { EngineState } from '@/lib/engine/types';
import { TEST_MAP } from '@/lib/engine/knowledge/tests';
import { measurementLabel, MEASUREMENT_MAP } from '@/lib/engine/measurements';
import { getHazards } from '@/lib/safety/hazards';
import { decodeModel, decodedSummary } from '@/lib/decoder';
import { REPORT_DISCLAIMER, type ReportMeasurement, type ServiceReportContent } from './types';

export async function buildReportContent(sessionId: string): Promise<ServiceReportContent> {
  const session = await prisma.diagnosticSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      user: { include: { company: true } },
      equipment: { include: { manufacturer: true, controlBoard: true, customer: true } },
      job: { include: { customer: true } },
      measurements: { orderBy: { takenAt: 'asc' } },
    },
  });

  const state = session.engineState as unknown as EngineState;
  const view = evaluate(state);

  // --- Measurements -------------------------------------------------------
  const raw: ReportMeasurement[] = session.measurements.map((m) => {
    const def = MEASUREMENT_MAP[m.key];
    return {
      label: m.label || measurementLabel(m.key),
      value: m.value !== null ? String(m.value) : (m.textValue ?? '—'),
      unit: m.unit ?? def?.unit ?? null,
      target: null,
      status: 'INFO' as const,
      derived: m.derivedFrom.length > 0 || m.source === 'calculated',
      note: m.notes,
    };
  });

  const derived: ReportMeasurement[] = view.derivedValues
    .filter((d) => d.value !== null)
    .map((d) => ({
      label: d.label,
      value: String(d.value),
      unit: d.unit,
      target: d.target ? `${d.target.low}–${d.target.high} (${d.target.basis})` : null,
      status: d.severity,
      derived: true,
      note: d.mustVerify
        ? 'Calculated from a pressure-to-temperature conversion. Confirm against the refrigerant P/T chart if marginal.'
        : null,
    }));

  // --- Tests performed ----------------------------------------------------
  const testsPerformed = state.askedTestIds.map((id) => {
    const test = TEST_MAP[id];
    const relatedFindings = state.findings.filter((f) => f.sourceTestId === id && f.present);
    return {
      label: test?.label ?? id,
      result: relatedFindings.length
        ? relatedFindings.map((f) => f.detail || f.label).join(' ')
        : 'Performed; no abnormal result recorded.',
      performedAt: relatedFindings[0]?.observedAt ?? null,
    };
  });

  // --- Equipment identity, with decode provenance preserved ----------------
  const modelNumber = session.equipment?.modelNumber ?? state.context.modelNumber ?? null;
  const serialNumber = session.equipment?.serialNumber ?? null;
  let decodedVerified: Array<{ label: string; value: string }> = [];
  let decodedEstimated: Array<{ label: string; value: string }> = [];

  if (modelNumber) {
    const decoded = decodeModel(
      modelNumber,
      serialNumber,
      session.equipment?.manufacturer?.name ?? state.context.manufacturer ?? null,
    );
    const summary = decodedSummary(decoded);
    decodedVerified = summary.verified;
    decodedEstimated = summary.estimated.map((e) => ({ label: e.label, value: e.value }));
  }

  const customer = session.job?.customer ?? session.equipment?.customer ?? null;
  const company = session.user.company;

  const hazardIds = new Set<string>(view.conclusion?.safetyIds ?? []);
  for (const id of state.askedTestIds) {
    for (const h of TEST_MAP[id]?.hazardIds ?? []) hazardIds.add(h);
  }

  return {
    generatedAt: new Date().toISOString(),
    company: {
      name: company?.name ?? null,
      phone: company?.phone ?? null,
      address: [company?.address, company?.city, company?.state, company?.postal].filter(Boolean).join(', ') || null,
    },
    technician: {
      name: session.user.fullName,
      licenseNumber: session.user.licenseNumber,
      epaCert: session.user.epaCert,
    },
    customer: {
      name: customer?.name ?? null,
      address: [customer?.address, customer?.city, customer?.state, customer?.postal].filter(Boolean).join(', ') || null,
      phone: customer?.phone ?? null,
    },
    complaint: session.complaint,
    equipment: {
      type: session.equipmentType.replace(/_/g, ' '),
      manufacturer: session.equipment?.manufacturer?.name ?? state.context.manufacturer ?? null,
      modelNumber,
      serialNumber,
      refrigerant: session.refrigerant ?? state.context.refrigerant ?? null,
      nominalTons: session.equipment?.nominalTons ?? null,
      controlBoard: session.equipment?.controlBoard?.partNumber ?? state.context.controlBoard ?? null,
      decodedVerified,
      decodedEstimated,
    },
    faultCodes: state.faultCodeRefs.map((f) => ({
      code: f.code,
      manufacturer: f.manufacturer,
      title: (f as { title?: string }).title ?? '',
      meaning: (f as { meaning?: string }).meaning ?? '',
      scoped: f.scoped,
      verification: (f as { verification?: string }).verification ?? 'UNVERIFIED',
    })),
    measurements: [...raw, ...derived],
    testsPerformed,
    diagnosis: {
      conclusion: view.conclusion?.label ?? null,
      statement: view.conclusion?.statement ?? null,
      confidencePercent: view.conclusion ? Math.round(view.conclusion.confidence * 100) : null,
      evidence: (view.conclusion?.evidence ?? []).map((e) => `${e.label}${e.detail ? `: ${e.detail}` : ''}`),
      ruledOut: view.conclusion?.ruledOut ?? [],
      caveats: view.conclusion?.caveats ?? (view.conclusion ? [] : [
        `No diagnosis was reached during this visit. ${view.stopReason}`,
      ]),
    },
    recommendation: {
      summary: view.conclusion?.repair.summary ?? null,
      rootCauseWarning: view.conclusion?.repair.rootCauseWarning ?? null,
      parts: view.conclusion?.repair.parts ?? [],
    },
    safetyNotes: getHazards([...hazardIds])
      .filter((h) => h.level !== 'CAUTION')
      .map((h) => ({ level: h.level, title: h.title, warning: h.warning })),
    technicianNotes: null,
    citations: state.citations.map((c) => ({
      documentTitle: c.documentTitle,
      page: c.page ?? null,
    })),
    disclaimer: REPORT_DISCLAIMER,
  };
}

/**
 * Sequential, human-readable report number.
 *
 * Reading the maximum and adding one is a race: two technicians finishing a
 * job in the same second both read the same maximum, and the second insert
 * dies on the unique constraint with an error neither of them can act on.
 * `createReport` therefore takes the allocation and the insert together and
 * retries on collision, rather than handing out a number that may already be
 * taken by the time it is used.
 */
async function peekNextReportNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TR-${year}-`;
  const last = await prisma.serviceReport.findFirst({
    where: { reportNumber: { startsWith: prefix } },
    orderBy: { reportNumber: 'desc' },
    select: { reportNumber: true },
  });
  const n = last ? Number(last.reportNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, '0')}`;
}

/** Retained for callers that only need to display the next number. */
export const nextReportNumber = peekNextReportNumber;

export interface CreateReportInput {
  userId: string;
  jobId: string | null;
  sessionId: string;
  content: ServiceReportContent;
  technicianNotes: string | null;
  finalize: boolean;
}

export async function createReport(input: CreateReportInput) {
  const MAX_ATTEMPTS = 6;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const reportNumber = await peekNextReportNumber();
    try {
      return await prisma.serviceReport.create({
        data: {
          userId: input.userId,
          jobId: input.jobId,
          sessionId: input.sessionId,
          reportNumber,
          content: input.content as unknown as Prisma.InputJsonValue,
          technicianNotes: input.technicianNotes,
          status: input.finalize ? 'FINAL' : 'DRAFT',
        },
      });
    } catch (error) {
      const collision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('reportNumber');
      if (!collision) throw error;
      // Another report took this number. Re-read and try the next one.
    }
  }

  throw new Error(
    'Could not allocate a report number after several attempts. Try again in a moment.',
  );
}
