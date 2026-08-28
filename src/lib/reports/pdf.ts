/**
 * Server-side PDF generation with pdf-lib.
 *
 * Deliberately dependency-light: no headless browser, no native binaries, so
 * the report renders identically on a laptop and in a container, and a PDF
 * request cannot take down the app by exhausting memory on a Chromium
 * instance.
 *
 * The layout is a simple flowing document with automatic page breaks. It is
 * built to be read on paper by a customer, so measurement status is conveyed
 * by a text marker as well as colour — a report printed on a mono office
 * printer must still show which readings were out of range.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ServiceReportContent } from './types';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.42, 0.46, 0.52);
const RULE = rgb(0.82, 0.85, 0.88);
const ACCENT = rgb(0.05, 0.42, 0.55);
const ALERT = rgb(0.72, 0.18, 0.12);
const WARN = rgb(0.72, 0.45, 0.05);

interface Cursor {
  page: PDFPage;
  y: number;
  pageNumber: number;
}

export async function renderReportPdf(
  content: ServiceReportContent,
  reportNumber: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Service Report ${reportNumber}`);
  pdf.setProducer('ThermoRivet');
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const pages: PDFPage[] = [];
  const newPage = (): PDFPage => {
    const p = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(p);
    return p;
  };

  const cursor: Cursor = { page: newPage(), y: PAGE_HEIGHT - MARGIN, pageNumber: 1 };

  const ensure = (needed: number) => {
    if (cursor.y - needed < MARGIN + 46) {
      cursor.page = newPage();
      cursor.pageNumber += 1;
      cursor.y = PAGE_HEIGHT - MARGIN;
    }
  };

  const text = (
    value: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; width?: number; gap?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    const width = opts.width ?? CONTENT_WIDTH - indent;
    const lines = wrap(value, font, size, width);
    for (const line of lines) {
      ensure(size + 3);
      cursor.page.drawText(line, {
        x: MARGIN + indent,
        y: cursor.y - size,
        size,
        font,
        color: opts.color ?? INK,
      });
      cursor.y -= size + 3.5;
    }
    cursor.y -= opts.gap ?? 0;
  };

  const heading = (value: string) => {
    ensure(34);
    cursor.y -= 10;
    cursor.page.drawText(value.toUpperCase(), {
      x: MARGIN,
      y: cursor.y - 10,
      size: 10,
      font: bold,
      color: ACCENT,
    });
    cursor.y -= 15;
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y },
      end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
      thickness: 0.75,
      color: RULE,
    });
    cursor.y -= 10;
  };

  const field = (label: string, value: string | null) => {
    if (!value) return;
    ensure(14);
    cursor.page.drawText(`${label}`, { x: MARGIN, y: cursor.y - 9, size: 8.5, font: bold, color: MUTED });
    const lines = wrap(value, regular, 9.5, CONTENT_WIDTH - 130);
    let first = true;
    for (const line of lines) {
      ensure(13);
      cursor.page.drawText(line, { x: MARGIN + 130, y: cursor.y - 9, size: 9.5, font: regular, color: INK });
      if (!first) cursor.y -= 0;
      cursor.y -= 13;
      first = false;
    }
  };

  // ---- Header -------------------------------------------------------------
  cursor.page.drawText('SERVICE REPORT', { x: MARGIN, y: cursor.y - 18, size: 18, font: bold, color: INK });
  cursor.page.drawText(reportNumber, {
    x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(reportNumber, 11),
    y: cursor.y - 16,
    size: 11,
    font: bold,
    color: ACCENT,
  });
  cursor.y -= 26;

  const dateLine = new Date(content.generatedAt).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  cursor.page.drawText(dateLine, { x: MARGIN, y: cursor.y - 10, size: 9, font: regular, color: MUTED });
  cursor.y -= 20;
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 1.5,
    color: ACCENT,
  });
  cursor.y -= 6;

  // ---- Parties ------------------------------------------------------------
  heading('Service call');
  field('Company', content.company.name);
  field('Company phone', content.company.phone);
  field('Technician', content.technician.name);
  field('License', content.technician.licenseNumber ?? null);
  field('EPA certification', content.technician.epaCert ?? null);
  field('Customer', content.customer.name);
  field('Service address', content.customer.address);
  field('Customer phone', content.customer.phone);

  // ---- Complaint ----------------------------------------------------------
  heading('Customer complaint');
  text(content.complaint || 'Not recorded.');

  // ---- Equipment ----------------------------------------------------------
  heading('Equipment');
  field('Type', content.equipment.type);
  field('Manufacturer', content.equipment.manufacturer);
  field('Model number', content.equipment.modelNumber);
  field('Serial number', content.equipment.serialNumber);
  field('Refrigerant', content.equipment.refrigerant);
  field('Control board', content.equipment.controlBoard);
  field('Nominal capacity', content.equipment.nominalTons ? `${content.equipment.nominalTons} tons` : null);

  if (content.equipment.decodedEstimated.length) {
    cursor.y -= 4;
    text('Estimated from the model/serial number (not read from the rating plate):', {
      font: italic,
      size: 8.5,
      color: MUTED,
    });
    for (const d of content.equipment.decodedEstimated) {
      text(`• ${d.label}: ${d.value}`, { size: 8.5, indent: 10, color: MUTED });
    }
  }

  // ---- Fault codes --------------------------------------------------------
  if (content.faultCodes.length) {
    heading('Fault codes');
    for (const fc of content.faultCodes) {
      text(`${fc.manufacturer} code ${fc.code} — ${fc.title}`, { font: bold });
      text(fc.meaning, { indent: 10 });
      if (!fc.scoped) {
        text(
          'Not resolved to this specific control board. Confirm the meaning against the code list on the unit before acting on it.',
          { indent: 10, font: italic, size: 8.5, color: WARN },
        );
      }
      cursor.y -= 4;
    }
  }

  // ---- Measurements -------------------------------------------------------
  if (content.measurements.length) {
    heading('Measurements');

    const cols = [MARGIN, MARGIN + 190, MARGIN + 268, MARGIN + 400];
    ensure(16);
    const headers = ['Reading', 'Value', 'Expected', 'Status'];
    headers.forEach((h, i) => {
      cursor.page.drawText(h, { x: cols[i]!, y: cursor.y - 8, size: 8, font: bold, color: MUTED });
    });
    cursor.y -= 14;

    for (const m of content.measurements) {
      ensure(16);
      const statusText =
        m.status === 'CRITICAL' ? 'CRITICAL' : m.status === 'ABNORMAL' ? 'OUT OF RANGE' : m.status === 'WATCH' ? 'MARGINAL' : m.status === 'NORMAL' ? 'In range' : '—';
      const statusColor = m.status === 'CRITICAL' ? ALERT : m.status === 'ABNORMAL' ? ALERT : m.status === 'WATCH' ? WARN : MUTED;

      const label = truncate(m.label + (m.derived ? ' (derived)' : ''), regular, 8.5, 185);
      cursor.page.drawText(label, { x: cols[0]!, y: cursor.y - 8, size: 8.5, font: regular, color: INK });
      cursor.page.drawText(truncate(`${m.value}${m.unit ? ` ${m.unit}` : ''}`, bold, 8.5, 72), {
        x: cols[1]!,
        y: cursor.y - 8,
        size: 8.5,
        font: bold,
        color: INK,
      });
      cursor.page.drawText(truncate(m.target ?? '—', regular, 8, 126), {
        x: cols[2]!,
        y: cursor.y - 8,
        size: 8,
        font: regular,
        color: MUTED,
      });
      cursor.page.drawText(statusText, { x: cols[3]!, y: cursor.y - 8, size: 8, font: bold, color: statusColor });
      cursor.y -= 13;
    }

    cursor.y -= 4;
    text(
      'Readings marked "derived" were calculated from other measurements, including approximate pressure-to-temperature conversions.',
      { size: 8, font: italic, color: MUTED },
    );
  }

  // ---- Tests --------------------------------------------------------------
  if (content.testsPerformed.length) {
    heading('Tests performed');
    for (const t of content.testsPerformed) {
      text(`• ${t.label}`, { font: bold, size: 9 });
      text(t.result, { indent: 12, size: 9 });
      cursor.y -= 2;
    }
  }

  // ---- Diagnosis ----------------------------------------------------------
  heading('Diagnosis');
  if (content.diagnosis.conclusion) {
    text(content.diagnosis.conclusion, { font: bold, size: 11 });
    if (content.diagnosis.statement) text(content.diagnosis.statement);
    if (content.diagnosis.confidencePercent !== null) {
      text(`Confidence: ${content.diagnosis.confidencePercent}%`, { size: 9, color: MUTED });
    }
    if (content.diagnosis.evidence.length) {
      cursor.y -= 4;
      text('Evidence supporting this:', { font: bold, size: 9 });
      for (const e of content.diagnosis.evidence) text(`• ${e}`, { indent: 10, size: 9 });
    }
    if (content.diagnosis.ruledOut.length) {
      cursor.y -= 4;
      text('Considered and ruled out:', { font: bold, size: 9 });
      for (const r of content.diagnosis.ruledOut) {
        text(`• ${r.label} — ${r.reason}`, { indent: 10, size: 9, color: MUTED });
      }
    }
  } else {
    text('No diagnosis was reached during this visit.', { font: bold });
  }
  for (const c of content.diagnosis.caveats) {
    cursor.y -= 3;
    text(c, { size: 9, font: italic, color: WARN });
  }

  // ---- Recommendation -----------------------------------------------------
  if (content.recommendation.summary) {
    heading('Recommended repair');
    text(content.recommendation.summary);
    if (content.recommendation.rootCauseWarning) {
      cursor.y -= 4;
      text(content.recommendation.rootCauseWarning, { font: italic, size: 9, color: WARN });
    }
    if (content.recommendation.parts.length) {
      cursor.y -= 4;
      text('Parts:', { font: bold, size: 9 });
      for (const p of content.recommendation.parts) text(`• ${p}`, { indent: 10, size: 9 });
    }
  }

  // ---- Safety -------------------------------------------------------------
  if (content.safetyNotes.length) {
    heading('Safety notes');
    for (const s of content.safetyNotes) {
      text(`${s.level} — ${s.title}`, { font: bold, size: 9, color: s.level === 'LETHAL' ? ALERT : WARN });
      text(s.warning, { indent: 10, size: 8.5 });
      cursor.y -= 2;
    }
  }

  // ---- Notes and sources --------------------------------------------------
  if (content.technicianNotes) {
    heading('Technician notes');
    text(content.technicianNotes);
  }

  if (content.citations.length) {
    heading('Sources referenced');
    for (const c of content.citations) {
      text(`• ${c.documentTitle}${c.page ? `, page ${c.page}` : ''}${c.publication ? ` (${c.publication})` : ''}`, {
        size: 8.5,
        color: MUTED,
      });
    }
  }

  // ---- Signature ----------------------------------------------------------
  ensure(60);
  cursor.y -= 18;
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + 220, y: cursor.y },
    thickness: 0.75,
    color: RULE,
  });
  cursor.page.drawText('Technician signature', { x: MARGIN, y: cursor.y - 11, size: 8, font: regular, color: MUTED });
  cursor.page.drawLine({
    start: { x: MARGIN + 280, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 0.75,
    color: RULE,
  });
  cursor.page.drawText('Date', { x: MARGIN + 280, y: cursor.y - 11, size: 8, font: regular, color: MUTED });

  // ---- Footers ------------------------------------------------------------
  const total = pages.length;
  pages.forEach((page, i) => {
    const footer = `${reportNumber}  ·  Page ${i + 1} of ${total}`;
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 30 },
      end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 30 },
      thickness: 0.5,
      color: RULE,
    });
    const disclaimerLines = wrap(content.disclaimer, regular, 6.5, CONTENT_WIDTH);
    disclaimerLines.slice(0, 3).forEach((line, j) => {
      page.drawText(line, { x: MARGIN, y: MARGIN + 20 - j * 7.5, size: 6.5, font: regular, color: MUTED });
    });
    page.drawText(footer, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footer, 7),
      y: MARGIN - 6,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });

  return pdf.save();
}

/** Word wrap against real glyph widths, with a hard break for long tokens. */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const sanitized = sanitize(value);
  const out: string[] = [];

  for (const paragraph of sanitized.split('\n')) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single token wider than the column (a long model number) is broken.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            out.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line) out.push(line);
  }

  return out.length ? out : [''];
}

/**
 * The standard PDF fonts are WinAnsi-encoded and pdf-lib throws on anything
 * outside that range. Technician notes routinely contain °, ±, µ and typographic
 * dashes, so map them rather than letting a report fail to generate.
 */
function sanitize(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .replace(/µ|μ/g, 'u')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/±/g, '+/-')
    .replace(/[^\x20-\x7E -ÿ\n]/g, '');
}

function truncate(value: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitize(value);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}
