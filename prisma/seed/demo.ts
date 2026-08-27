/**
 * Demo account.
 *
 * Creates a platform admin on the Pro plan with a customer, a job, and one
 * fully worked diagnosis already in the history — so the app has something in
 * it the moment you open it, instead of an empty state that tells you nothing
 * about what it does.
 *
 * The diagnosis is driven through the real engine rather than being fabricated
 * rows, so what you see is genuinely what the engine concluded.
 *
 *   npm run db:demo
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  applyTestOption,
  classifyComplaint,
  createState,
  evaluate,
  markTestAsked,
  recordMeasurements,
} from '../../src/lib/engine/session';
import { measurementLabel } from '../../src/lib/engine/measurements';
import { fallbackNarration } from '../../src/lib/ai/narrate';
import type { EngineState } from '../../src/lib/engine/types';

const prisma = new PrismaClient();

const EMAIL = 'demo@thermorivet.local';
const PASSWORD = 'demo1234567';

async function main() {
  console.log('Creating the demo account…\n');

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const company = await prisma.company.upsert({
    where: { slug: 'rivet-mechanical' },
    create: {
      name: 'Rivet Mechanical',
      slug: 'rivet-mechanical',
      phone: '(555) 010-8842',
      city: 'Denver',
      state: 'CO',
    },
    update: {},
  });

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      passwordHash,
      fullName: 'Demo Technician',
      role: 'PLATFORM_ADMIN',
      companyId: company.id,
      licenseNumber: 'CO-MJ-44821',
      epaCert: 'Universal',
      yearsExp: 12,
    },
    // Re-running resets the password, which is the point of a demo account.
    update: { passwordHash, role: 'PLATFORM_ADMIN', companyId: company.id },
  });

  // Pro, so reports and photo analysis are reachable.
  const pro = await prisma.plan.findUnique({ where: { tier: 'PRO' } });
  if (pro) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const existing = await prisma.subscription.findFirst({ where: { userId: user.id } });
    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId: pro.id, status: 'ACTIVE', currentPeriodEnd: periodEnd, diagnosesUsed: 0 },
      });
    } else {
      await prisma.subscription.create({
        data: { userId: user.id, planId: pro.id, currentPeriodEnd: periodEnd },
      });
    }
  }

  const customer = await prisma.customer.upsert({
    where: { id: (await prisma.customer.findFirst({ where: { name: 'M. Delacroix' } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    create: {
      companyId: company.id,
      name: 'M. Delacroix',
      phone: '(555) 010-2277',
      address: '4417 Birchwood Ln',
      city: 'Aurora',
      state: 'CO',
    },
    update: {},
  }).catch(() =>
    prisma.customer.create({
      data: {
        companyId: company.id,
        name: 'M. Delacroix',
        phone: '(555) 010-2277',
        address: '4417 Birchwood Ln',
        city: 'Aurora',
        state: 'CO',
      },
    }),
  );

  const job = await prisma.job.create({
    data: {
      userId: user.id,
      companyId: company.id,
      customerId: customer.id,
      jobNumber: 'J-4417',
      title: 'Delacroix — no cooling',
      complaint: 'AC running but the house is not cooling down.',
      status: 'DIAGNOSED',
    },
  });

  // --- Drive a real diagnosis through the engine ---------------------------
  const complaint = 'AC is running but not cooling.';
  let state: EngineState = createState({
    equipmentType: 'CENTRAL_AC',
    families: classifyComplaint(complaint),
    refrigerant: 'R-410A',
    meteringDevice: 'TXV',
    mode: 'COOLING',
    manufacturer: 'Carrier',
    modelNumber: '24ACC636A003',
  });

  const transcript: Array<{ role: 'TECHNICIAN' | 'ENGINE'; content: string }> = [
    { role: 'TECHNICIAN', content: complaint },
  ];

  const say = (s: EngineState, techSaid: string | null) => {
    const view = evaluate(s);
    if (techSaid) transcript.push({ role: 'TECHNICIAN', content: techSaid });
    transcript.push({
      role: 'ENGINE',
      content: fallbackNarration({ view, complaint, lastTechnicianMessage: techSaid }),
    });
    return view.state;
  };

  state = say(state, null);
  state = say(applyTestOption(state, 'inspect-condenser-coil', 'clean'), 'Condenser coil: clean, unobstructed');
  state = say(applyTestOption(state, 'inspect-filter', 'clean'), 'Filter: clean, light passes through');
  state = say(applyTestOption(state, 'confirm-unit-running', 'all_running'), 'Everything is running');

  const readings = [
    { key: 'refrigerant', text: 'R-410A' },
    { key: 'metering_device', text: 'TXV' },
    { key: 'outdoor_db', value: 92 },
    { key: 'suction_pressure', value: 118 },
    { key: 'suction_line_temp', value: 78 },
    { key: 'liquid_pressure', value: 325 },
    { key: 'liquid_line_temp', value: 82 },
    { key: 'return_db', value: 78 },
    { key: 'supply_db', value: 68 },
  ];
  state = recordMeasurements(
    state,
    readings.map((r) => ({ ...r, source: 'voice' as const })),
  ).state;
  state = markTestAsked(state, 'measure-superheat');
  state = markTestAsked(state, 'measure-subcooling');
  state = say(
    state,
    'Carrier R410A, outdoor 92, suction 118, liquid 325, supply 68, return 78. Suction line 78, liquid line 82.',
  );

  state = say(
    applyTestOption(state, 'drier-temperature-drop', 'drop'),
    'Measurable temperature drop across the filter drier, outlet sweating',
  );

  const finalView = evaluate(state);

  const session = await prisma.diagnosticSession.create({
    data: {
      userId: user.id,
      jobId: job.id,
      title: 'Carrier 24ACC636A003 central ac — AC is running but not cooling',
      complaint,
      equipmentType: 'CENTRAL_AC',
      refrigerant: 'R-410A',
      mode: 'COOLING',
      phase: finalView.state.phase,
      engineState: finalView.state as unknown as object,
      conclusion: (finalView.conclusion as unknown as object) ?? undefined,
      confidence: finalView.conclusion?.confidence ?? null,
      ruledOut: finalView.conclusion?.ruledOut.map((r) => r.label) ?? [],
      completedAt: new Date(),
    },
  });

  for (const m of transcript) {
    await prisma.conversationMessage.create({
      data: { sessionId: session.id, role: m.role, content: m.content },
    });
  }

  for (const r of readings) {
    await prisma.measurement.create({
      data: {
        sessionId: session.id,
        key: r.key,
        label: measurementLabel(r.key),
        value: 'value' in r ? r.value : null,
        textValue: 'text' in r ? r.text : null,
        source: 'voice',
      },
    });
  }

  console.log(`  Diagnosis reached: ${finalView.conclusion?.label ?? '(none)'}`);
  console.log(
    `  Confidence: ${finalView.conclusion ? Math.round(finalView.conclusion.confidence * 100) : 0}%`,
  );
  console.log(`  Ruled out: ${finalView.conclusion?.ruledOut.length ?? 0} alternatives\n`);

  console.log('Sign in with:');
  console.log(`  email    ${EMAIL}`);
  console.log(`  password ${PASSWORD}\n`);
  console.log('It is a platform admin on the Pro plan, so /admin and service reports are open.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
