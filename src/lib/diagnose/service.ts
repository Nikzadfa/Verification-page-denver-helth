/**
 * Diagnostic session service.
 *
 * The one place that persists engine state, so the route handlers stay thin
 * and the ordering guarantee is in a single file: derive → rank → plan →
 * persist → narrate. Narration is last and its failure is non-fatal, because
 * the diagnosis must survive the model being unavailable.
 */

import { Prisma, type EquipmentType } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { AuthenticatedUser } from '@/lib/auth/session';
import {
  applyTestOption,
  classifyComplaint,
  createState,
  evaluate,
  markTestAsked,
  markTestSkipped,
  recordFindings,
  recordMeasurements,
  type EngineView,
} from '@/lib/engine/session';
import type { EngineState, Finding } from '@/lib/engine/types';
import { TEST_MAP } from '@/lib/engine/knowledge/tests';
import { FINDINGS } from '@/lib/engine/knowledge/findings';
import { measurementLabel, MEASUREMENT_MAP } from '@/lib/engine/measurements';
import { extractStructured } from '@/lib/ai/extract';
import { narrate } from '@/lib/ai/narrate';
import { resolveFaultCode } from '@/lib/faultcodes/resolve';
import { retrieveForStep } from '@/lib/rag/retrieve';
import { slugify } from '@/lib/rag/retrieve';
import { checkForBypassRequest } from '@/lib/safety/hazards';
import { claimDiagnosis } from '@/lib/billing/entitlements';
import type { FaultCodeResolution } from '@/lib/faultcodes/types';

const ALLOWED_FINDING_KEYS = FINDINGS.map((f) => f.key);

export interface StartSessionInput {
  complaint: string;
  equipmentType: EquipmentType;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  controlBoard?: string | null;
  refrigerant?: string | null;
  meteringDevice?: 'TXV' | 'EEV' | 'FIXED_ORIFICE' | 'CAPILLARY' | 'UNKNOWN' | null;
  mode?: 'COOLING' | 'HEATING' | 'DEFROST' | 'IDLE' | 'UNKNOWN' | null;
  faultCode?: string | null;
  jobId?: string | null;
  title?: string | null;
}

export async function startSession(user: AuthenticatedUser, input: StartSessionInput) {
  await claimDiagnosis(user.id);

  const families = classifyComplaint(input.complaint);

  let state = createState({
    equipmentType: input.equipmentType,
    families: families.length ? families : ['unknown'],
    refrigerant: input.refrigerant ?? null,
    meteringDevice: input.meteringDevice ?? 'UNKNOWN',
    mode: input.mode ?? 'UNKNOWN',
    manufacturer: input.manufacturer ?? null,
    modelNumber: input.modelNumber ?? null,
    controlBoard: input.controlBoard ?? null,
    faultCode: input.faultCode ?? null,
  });

  // A fault code supplied at intake is resolved immediately, and only an EXACT
  // (board-scoped) match is allowed to move the ranking.
  let faultResolution: FaultCodeResolution | null = null;
  if (input.faultCode && input.manufacturer) {
    faultResolution = await resolveFaultCode({
      manufacturerSlug: slugify(input.manufacturer),
      code: input.faultCode,
      equipmentType: input.equipmentType,
      modelNumber: input.modelNumber ?? null,
      controlBoard: input.controlBoard ?? null,
    }).catch(() => null);

    if (faultResolution) {
      state = {
        ...state,
        faultCodeRefs: faultResolution.match
          ? [
              {
                faultCodeId: faultResolution.match.id,
                code: faultResolution.match.code,
                manufacturer: faultResolution.match.manufacturer,
                scoped: true,
                ...({
                  linkedHypotheses: faultResolution.match.linkedHypotheses,
                  title: faultResolution.match.title,
                  meaning: faultResolution.match.meaning,
                  verification: faultResolution.match.verification,
                } as object),
              },
            ]
          : faultResolution.candidates.map((c) => ({
              faultCodeId: c.id,
              code: c.code,
              manufacturer: c.manufacturer,
              scoped: false,
              ...({ title: c.title, meaning: c.meaning, verification: c.verification } as object),
            })),
      };
    }
  }

  const view = evaluate(state);

  const session = await prisma.diagnosticSession.create({
    data: {
      userId: user.id,
      jobId: input.jobId ?? null,
      title: input.title ?? deriveTitle(input),
      complaint: input.complaint,
      equipmentType: input.equipmentType,
      refrigerant: input.refrigerant ?? null,
      mode: input.mode ?? null,
      phase: view.state.phase,
      engineState: view.state as unknown as object,
    },
  });

  await prisma.conversationMessage.create({
    data: {
      sessionId: session.id,
      role: 'TECHNICIAN',
      content: input.complaint,
    },
  });

  const narration = await narrateAndStore(session.id, view, input.complaint, null, user.id);

  return { sessionId: session.id, view, narration, faultResolution };
}

function deriveTitle(input: StartSessionInput): string {
  const bits = [
    input.manufacturer,
    input.modelNumber,
    input.equipmentType !== 'UNKNOWN' ? input.equipmentType.replace(/_/g, ' ').toLowerCase() : null,
  ].filter(Boolean);
  const head = bits.length ? bits.join(' ') : 'Diagnosis';
  return `${head} — ${input.complaint.slice(0, 60)}${input.complaint.length > 60 ? '…' : ''}`;
}

export async function loadSession(user: AuthenticatedUser, sessionId: string) {
  const session = await prisma.diagnosticSession.findFirst({
    where: {
      id: sessionId,
      // A company admin can open any session belonging to their company's
      // technicians; everyone else sees only their own.
      ...(user.role === 'PLATFORM_ADMIN'
        ? {}
        : user.role === 'COMPANY_ADMIN' && user.companyId
          ? { user: { companyId: user.companyId } }
          : { userId: user.id }),
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      measurements: { orderBy: { takenAt: 'asc' } },
      photos: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!session) return null;

  const state = session.engineState as unknown as EngineState;
  const view = evaluate(state);
  return { session, view };
}

async function persist(sessionId: string, view: EngineView) {
  await prisma.diagnosticSession.update({
    where: { id: sessionId },
    data: {
      phase: view.state.phase,
      engineState: view.state as unknown as object,
      // Prisma reads `undefined` as "do not touch this column". Using it here
      // left a retracted diagnosis in the row while confidence and completedAt
      // were cleared, so a corrected reading produced a session that still
      // claimed a conclusion the engine no longer held.
      conclusion: (view.conclusion as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
      confidence: view.conclusion?.confidence ?? null,
      ruledOut: view.conclusion?.ruledOut.map((r) => r.label) ?? [],
      completedAt: view.conclusion ? new Date() : null,
    },
  });
}

async function narrateAndStore(
  sessionId: string,
  view: EngineView,
  complaint: string,
  lastTechnicianMessage: string | null,
  userId: string,
): Promise<string> {
  // Manufacturer-specific retrieval for whatever step is next, so any spec the
  // narration touches is grounded and cited.
  let citations: Array<{ documentTitle: string; page?: number | null; snippet: string }> = [];
  if (view.nextTest || view.conclusion) {
    const retrieval = await retrieveForStep(
      view.state,
      view.nextTest?.test.label ?? view.conclusion?.label ?? '',
    ).catch(() => null);
    citations = retrieval?.citations.map((c) => ({
      documentTitle: c.documentTitle,
      page: c.page,
      snippet: c.snippet,
    })) ?? [];
  }

  const narration = await narrate({
    view,
    complaint,
    lastTechnicianMessage,
    citations,
    userId,
    sessionId,
  });

  // Structural safety gate: an instruction that would defeat a safety control
  // never reaches the technician, whatever the model produced.
  const bypass = checkForBypassRequest(narration.text);
  const content = bypass.blocked
    ? `${bypass.message}\n\n(The generated step was withheld because it would have defeated a safety control.)`
    : narration.text;

  await prisma.conversationMessage.create({
    data: {
      sessionId,
      role: narration.usedModel ? 'ASSISTANT' : 'ENGINE',
      content,
      payload: buildPayload(view) as unknown as object,
      citations: citations.length ? (citations as unknown as object) : undefined,
      inputTokens: narration.inputTokens,
      outputTokens: narration.outputTokens,
      latencyMs: narration.latencyMs,
      model: narration.model,
    },
  });

  return content;
}

/** The structured half of an assistant turn, rendered as cards by the UI. */
function buildPayload(view: EngineView) {
  return {
    phase: view.state.phase,
    nextTest: view.nextTest
      ? {
          id: view.nextTest.test.id,
          label: view.nextTest.test.label,
          kind: view.nextTest.test.kind,
          category: view.nextTest.test.category,
          instruction: view.nextTest.test.instruction,
          expected: view.nextTest.test.expected,
          options: view.nextTest.test.options ?? null,
          collects: view.nextTest.test.collects,
          hazardIds: view.nextTest.test.hazardIds,
          rationale: view.nextTest.rationale,
          separates: view.nextTest.separates,
          costMinutes: view.nextTest.test.costMinutes,
          procedureSlug: view.nextTest.test.procedureSlug ?? null,
        }
      : null,
    ranked: view.ranked.map((r) => ({
      id: r.hypothesisId,
      label: r.label,
      posterior: r.posterior,
      category: r.category,
      support: r.support,
    })),
    derived: view.derivedValues,
    hazards: view.hazards,
    differential: view.differential
      ? { a: view.differential.a.label, b: view.differential.b.label, how: view.differential.how ?? null }
      : null,
    conclusion: view.conclusion,
    verifyNotes: view.verifyNotes,
    notes: view.notes,
    missingReadings: view.missingReadings,
    stopReason: view.stopReason,
    entropyBits: view.entropyBits,
  };
}

/** Free text or a voice transcript from the technician. */
export async function handleMessage(
  user: AuthenticatedUser,
  sessionId: string,
  text: string,
  source: 'text' | 'voice',
) {
  const loaded = await loadSession(user, sessionId);
  if (!loaded) return null;

  await prisma.conversationMessage.create({
    data: { sessionId, role: 'TECHNICIAN', content: text, payload: { source } },
  });

  // A technician asking how to bypass a safety control gets the diagnostic
  // alternative, not a refusal and not an answer.
  const bypass = checkForBypassRequest(text);
  if (bypass.blocked) {
    await prisma.conversationMessage.create({
      data: { sessionId, role: 'ENGINE', content: bypass.message!, payload: { safetyBlock: true } },
    });
    const view = evaluate(loaded.session.engineState as unknown as EngineState);
    return { view, narration: bypass.message!, extraction: null };
  }

  const extraction = await extractStructured(text, {
    userId: user.id,
    sessionId,
    allowedFindingKeys: ALLOWED_FINDING_KEYS,
  });

  let state = loaded.session.engineState as unknown as EngineState;

  if (extraction.measurements.length) {
    state = recordMeasurements(
      state,
      extraction.measurements.map((m) => ({
        key: m.key,
        value: m.value ?? null,
        text: m.text ?? null,
        unit: m.unit ?? null,
        // 'text' at the API boundary is manual entry as far as provenance goes.
        source: source === 'voice' ? 'voice' : 'manual',
      })),
    ).state;
    await persistMeasurements(sessionId, extraction.measurements.map((m) => ({
      key: m.key,
      value: m.value ?? null,
      text: m.text ?? null,
      unit: m.unit ?? null,
      source: source === 'voice' ? 'voice' : 'manual',
    })));
  }

  if (extraction.findings.length) {
    const now = new Date().toISOString();
    const findings: Finding[] = extraction.findings.map((f) => ({
      key: f.key,
      label: f.key,
      present: f.present,
      detail: f.detail,
      confidence: f.confidence,
      observedAt: now,
    }));
    state = recordFindings(state, findings);
  }

  const view = evaluate(state);
  await persist(sessionId, view);
  const narration = await narrateAndStore(sessionId, view, loaded.session.complaint, text, user.id);

  return { view, narration, extraction };
}

/** The technician picked an option on a QUESTION-kind test. */
export async function answerTest(
  user: AuthenticatedUser,
  sessionId: string,
  testId: string,
  optionValue: string,
) {
  const loaded = await loadSession(user, sessionId);
  if (!loaded) return null;

  const test = TEST_MAP[testId];
  if (!test) return null;
  const option = test.options?.find((o) => o.value === optionValue);

  await prisma.conversationMessage.create({
    data: {
      sessionId,
      role: 'TECHNICIAN',
      content: `${test.label}: ${option?.label ?? optionValue}`,
      payload: { testId, optionValue },
    },
  });

  const state = applyTestOption(loaded.session.engineState as unknown as EngineState, testId, optionValue);
  const view = evaluate(state);
  await persist(sessionId, view);
  const narration = await narrateAndStore(
    sessionId,
    view,
    loaded.session.complaint,
    option?.label ?? optionValue,
    user.id,
  );

  return { view, narration };
}

export async function submitMeasurements(
  user: AuthenticatedUser,
  sessionId: string,
  readings: Array<{
    key: string;
    value?: number | null;
    text?: string | null;
    unit?: string | null;
    source?: 'manual' | 'voice' | 'probe';
    note?: string | null;
  }>,
  testId?: string | null,
) {
  const loaded = await loadSession(user, sessionId);
  if (!loaded) return null;

  const inputs = readings.map((r) => ({
    key: r.key,
    value: r.value ?? null,
    text: r.text ?? null,
    unit: r.unit ?? MEASUREMENT_MAP[r.key]?.unit ?? null,
    source: r.source ?? 'manual',
    note: r.note ?? null,
  }));

  let { state, warnings } = recordMeasurements(
    loaded.session.engineState as unknown as EngineState,
    inputs,
  );
  if (testId) state = markTestAsked(state, testId);

  await persistMeasurements(sessionId, inputs);

  const summary = inputs
    .map((i) => `${measurementLabel(i.key)}: ${i.value ?? i.text}${i.unit ? ` ${i.unit}` : ''}`)
    .join(', ');
  const fromProbe = inputs.some((i) => i.source === 'probe');

  await prisma.conversationMessage.create({
    data: {
      sessionId,
      role: 'TECHNICIAN',
      content: fromProbe ? `From wireless probes — ${summary}` : summary,
      payload: { testId, readings: inputs },
    },
  });

  const view = evaluate(state);
  await persist(sessionId, view);
  const narration = await narrateAndStore(sessionId, view, loaded.session.complaint, summary, user.id);

  return { view, narration, warnings };
}

export async function skipTest(
  user: AuthenticatedUser,
  sessionId: string,
  testId: string,
  reason?: string,
) {
  const loaded = await loadSession(user, sessionId);
  if (!loaded) return null;

  const test = TEST_MAP[testId];
  await prisma.conversationMessage.create({
    data: {
      sessionId,
      role: 'TECHNICIAN',
      content: `Skipped: ${test?.label ?? testId}${reason ? ` — ${reason}` : ''}`,
      payload: { testId, skipped: true, reason: reason ?? null },
    },
  });

  const state = markTestSkipped(loaded.session.engineState as unknown as EngineState, testId);
  const view = evaluate(state);
  await persist(sessionId, view);
  const narration = await narrateAndStore(
    sessionId,
    view,
    loaded.session.complaint,
    `Cannot run ${test?.label ?? testId}${reason ? ` — ${reason}` : ''}`,
    user.id,
  );

  return { view, narration };
}

async function persistMeasurements(
  sessionId: string,
  inputs: Array<{
    key: string;
    value: number | null;
    text: string | null;
    unit: string | null;
    source: string;
    note?: string | null;
  }>,
) {
  for (const i of inputs) {
    await prisma.measurement.create({
      data: {
        sessionId,
        key: i.key,
        label: measurementLabel(i.key),
        value: i.value,
        textValue: i.text,
        unit: i.unit,
        source: i.source,
        notes: i.note ?? null,
      },
    });
  }
}
