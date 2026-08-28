/**
 * Service report content.
 *
 * A service report is a document a customer may read, an insurer may read, and
 * a lawyer may read after a callback. Two things follow from that:
 *
 *  - The report records what was MEASURED separately from what was CONCLUDED,
 *    and it records what was ruled out and why. A report that only names a
 *    conclusion is unreviewable.
 *  - Any value that came from an approximate conversion, or from an
 *    unverified knowledge-base entry, is marked as such in the document
 *    itself. The technician signs their name to this; they need to know which
 *    numbers are readings and which are derivations.
 */

export interface ReportMeasurement {
  label: string;
  value: string;
  unit: string | null;
  target: string | null;
  status: 'NORMAL' | 'WATCH' | 'ABNORMAL' | 'CRITICAL' | 'INFO';
  /** Set when the value depends on an approximate P/T conversion. */
  derived: boolean;
  note?: string | null;
}

export interface ReportTest {
  label: string;
  result: string;
  performedAt?: string | null;
}

export interface ReportCitation {
  documentTitle: string;
  publication?: string | null;
  page?: number | null;
}

export interface ServiceReportContent {
  generatedAt: string;

  company: {
    name: string | null;
    phone: string | null;
    address: string | null;
  };
  technician: {
    name: string;
    licenseNumber?: string | null;
    epaCert?: string | null;
  };
  customer: {
    name: string | null;
    address: string | null;
    phone: string | null;
  };

  complaint: string;

  equipment: {
    type: string;
    manufacturer: string | null;
    modelNumber: string | null;
    serialNumber: string | null;
    refrigerant: string | null;
    nominalTons: number | null;
    controlBoard: string | null;
    /** Decoded fields, split so estimates are visibly estimates. */
    decodedVerified: Array<{ label: string; value: string }>;
    decodedEstimated: Array<{ label: string; value: string }>;
  };

  faultCodes: Array<{
    code: string;
    manufacturer: string;
    title: string;
    meaning: string;
    /** Whether it was resolved to this specific board/model. */
    scoped: boolean;
    verification: string;
  }>;

  measurements: ReportMeasurement[];
  testsPerformed: ReportTest[];

  diagnosis: {
    conclusion: string | null;
    statement: string | null;
    confidencePercent: number | null;
    evidence: string[];
    ruledOut: Array<{ label: string; reason: string }>;
    caveats: string[];
  };

  recommendation: {
    summary: string | null;
    rootCauseWarning: string | null;
    parts: string[];
  };

  safetyNotes: Array<{ level: string; title: string; warning: string }>;
  technicianNotes: string | null;
  citations: ReportCitation[];

  /** Rendered at the foot of every page. */
  disclaimer: string;
}

export const REPORT_DISCLAIMER =
  'This report records the measurements taken and the reasoning applied during this service visit. ' +
  'Values marked "derived" were calculated from other readings, including pressure-to-temperature conversions that are approximate; ' +
  'confirm any marginal value against the refrigerant manufacturer\'s P/T chart and the equipment rating plate. ' +
  'Diagnostic conclusions are based on the evidence available at the time of the visit and are the professional judgement of the technician named above.';
