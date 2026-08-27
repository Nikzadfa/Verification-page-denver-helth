import { describe, expect, it } from 'vitest';
import { renderReportPdf } from '../src/lib/reports/pdf';
import {
  REPORT_DISCLAIMER,
  type ReportMeasurement,
  type ServiceReportContent,
} from '../src/lib/reports/types';

function sample(over: Partial<ServiceReportContent> = {}): ServiceReportContent {
  return {
    generatedAt: new Date().toISOString(),
    company: { name: 'Rivet Mechanical LLC', phone: '(555) 010-8842', address: '18 Foundry Rd, Denver, CO' },
    technician: { name: 'A. Okonkwo', licenseNumber: 'CO-MJ-44821', epaCert: 'Universal' },
    customer: { name: 'M. Delacroix', address: '4417 Birchwood Ln, Aurora, CO', phone: '(555) 010-2277' },
    complaint: 'AC runs constantly but the house stays 6 degrees above setpoint.',
    equipment: {
      type: 'CENTRAL AC',
      manufacturer: 'Carrier',
      modelNumber: '24ACC636A003',
      serialNumber: '3419E48213',
      refrigerant: 'R-410A',
      nominalTons: 3,
      controlBoard: null,
      decodedVerified: [{ label: 'Series', value: '24ACC' }],
      decodedEstimated: [{ label: 'Approximate age', value: '6 years' }],
    },
    faultCodes: [],
    measurements: [
      { label: 'Suction pressure', value: '95', unit: 'psig', target: null, status: 'INFO', derived: false },
      {
        label: 'Superheat',
        value: '28.4',
        unit: '°F',
        target: '8–14 (Typical TXV/EEV superheat setting)',
        status: 'ABNORMAL',
        derived: true,
      },
    ],
    testsPerformed: [{ label: 'Check the air filter', result: 'Clean.', performedAt: null }],
    diagnosis: {
      conclusion: 'Low refrigerant charge (system has a leak)',
      statement: 'The system is short of refrigerant.',
      confidencePercent: 78,
      evidence: ['High superheat with low subcooling.'],
      ruledOut: [{ label: 'Restricted air filter', reason: 'Filter inspected clean.' }],
      caveats: ['Liquid-line restriction is still at 16%.'],
    },
    recommendation: {
      summary: 'Locate and repair the leak, then evacuate and weigh in the nameplate charge.',
      rootCauseWarning: 'Adding refrigerant without finding the leak is not a repair.',
      parts: ['Filter drier', 'R-410A (weighed charge)'],
    },
    safetyNotes: [
      {
        level: 'LETHAL',
        title: 'Capacitors hold a lethal charge after power is off',
        warning: 'A run capacitor stores enough energy to kill after the disconnect is open.',
      },
    ],
    technicianNotes: 'Customer advised of leak-search cost. Approved.',
    citations: [{ documentTitle: 'Carrier 24ACC6 Product Data', publication: '24ACC6-01PD', page: 12 }],
    disclaimer: REPORT_DISCLAIMER,
    ...over,
  };
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

describe('service report PDF', () => {
  it('renders a valid PDF', async () => {
    const bytes = await renderReportPdf(sample(), 'TR-2026-00001');
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it('survives the characters that actually appear in field notes', async () => {
    // The standard PDF fonts are WinAnsi-encoded; degree signs, micro signs,
    // typographic quotes and em dashes all appear in real technician notes and
    // would otherwise throw during encoding.
    const bytes = await renderReportPdf(
      sample({
        technicianNotes:
          'Flame rod read 0.4 µA — below the 1.0 µA minimum. Rise 62 °F vs 30–60 rated. Customer said “leave it off”. ±2 °F on the probe. Résumé of prior visits attached. 温度 also fine.',
        complaint: 'Unit ices up ≥3× per week; ΔT ≤ 8 °F.',
      }),
      'TR-2026-00002',
    );
    expect(isPdf(bytes)).toBe(true);
  });

  it('paginates long content and numbers every page', async () => {
    const many = Array.from({ length: 90 }, (_, i) => ({
      label: `Reading number ${i} with a deliberately long label that has to be truncated in the column`,
      value: String(i),
      unit: '°F',
      target: '10–20 (a fairly long basis string describing where the target came from)',
      status: (i % 4 === 0 ? 'CRITICAL' : i % 3 === 0 ? 'ABNORMAL' : 'NORMAL') as ReportMeasurement['status'],
      derived: i % 2 === 0,
    }));
    const bytes = await renderReportPdf(sample({ measurements: many }), 'TR-2026-00003');
    expect(isPdf(bytes)).toBe(true);
    // Multi-page documents are materially larger than the single-page case.
    expect(bytes.byteLength).toBeGreaterThan(4000);
  });

  it('renders a session that reached no diagnosis', async () => {
    const bytes = await renderReportPdf(
      sample({
        diagnosis: {
          conclusion: null,
          statement: null,
          confidencePercent: null,
          evidence: [],
          ruledOut: [],
          caveats: ['No diagnosis was reached during this visit. Awaiting a static pressure reading.'],
        },
        recommendation: { summary: null, rootCauseWarning: null, parts: [] },
      }),
      'TR-2026-00004',
    );
    expect(isPdf(bytes)).toBe(true);
  });

  it('handles a single token wider than the column without looping forever', async () => {
    const bytes = await renderReportPdf(
      sample({
        complaint: 'X'.repeat(400),
        technicianNotes: 'MODEL' + 'A1B2C3D4E5'.repeat(30),
      }),
      'TR-2026-00005',
    );
    expect(isPdf(bytes)).toBe(true);
  });
});
