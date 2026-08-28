#!/usr/bin/env node
/**
 * Builds the ThermoRivet sell sheet as a print-ready PDF.
 *
 * Screenshots are real captures of the running app, downscaled and inlined as
 * data URIs so the HTML is self-contained and the PDF renders identically
 * anywhere.
 *
 *   node marketing/build-sheet.mjs [--shots <dir>] [--out <file.pdf>]
 *
 * Every claim in the copy corresponds to behaviour that exists and is covered
 * by a test. Nothing here describes a feature that is not shipping — the sheet
 * carries a "what is not built yet" panel instead, which is the part a
 * contractor will trust you on.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SHOTS = arg('shots', resolve(root, 'marketing/shots'));
const OUT = arg('out', resolve(root, 'marketing/ThermoRivet-overview.pdf'));
const CHROME =
  process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * Crop a phone screenshot to the part that carries the point, then downscale.
 *
 * A full 414x896 capture is far too tall for a print column — dropped in whole
 * it either shrinks past legibility or pushes the page below it off the sheet.
 * `keep` is the fraction of the original height retained from the top.
 */
async function shot(name, { width = 620, keep = 1 } = {}) {
  const buffer = await readFile(resolve(SHOTS, `${name}.png`));
  const meta = await sharp(buffer).metadata();
  const height = Math.round((meta.height ?? 0) * keep);

  const out = await sharp(buffer)
    .extract({ left: 0, top: 0, width: meta.width ?? 0, height })
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${out.toString('base64')}`;
}

/** Per-image crop, tuned so each one ends on a clean edge rather than mid-row. */
const PLATES = {
  'c1-undercharge': { keep: 0.60 },
  // The page-2 trio sits in a fixed 56 x 60 mm frame; cropping to roughly that
  // aspect means `cover` trims nothing off the sides.
  'c4-capacitor': { keep: 0.92, width: 560 },
  'd2-ranking': { keep: 0.52 },
  'v-1-conclusion-top': { keep: 0.52 },
  'k1-code31-ambiguous': { keep: 0.62 },
  'shot-customers': { keep: 0.60, width: 460 },
  'p6-step6-live-circuit': { keep: 0.46, width: 460 },
  'p2-step2-vendors': { keep: 0.88, width: 520 },
  'd7-no-fault-found': { keep: 0.62 },
  'p9-derived': { keep: 0.54, width: 460 },
  'shot-home': { keep: 0.60, width: 460 },
  'c3-furnace': { keep: 0.52 },
};

const IMG = Object.fromEntries(
  await Promise.all(Object.entries(PLATES).map(async ([n, o]) => [n, await shot(n, o)])),
);

const CONTACT = {
  company: process.env.SHEET_COMPANY ?? 'Your Company Name',
  email: process.env.SHEET_EMAIL ?? 'you@yourdomain.com',
  phone: process.env.SHEET_PHONE ?? '(000) 000-0000',
  site: process.env.SHEET_SITE ?? 'thermorivet.example.com',
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ThermoRivet</title>
<style>
  @page { size: A4; margin: 0; }

  :root {
    --ink: #10171d;
    --ink-2: #3d4d59;
    --ink-3: #6d7c88;
    --rule: #d7dee4;
    --rule-2: #eef2f5;
    --accent: #0b6ea8;
    --accent-soft: #eaf4fa;
    --copper: #a8511c;
    --copper-soft: #fbf1e9;
    --good: #1c6b4a;
    --paper: #ffffff;
    --panel: #f6f8fa;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body {
    font-family: Charter, 'Bitstream Charter', 'DejaVu Serif', Georgia, serif;
    color: var(--ink);
    background: var(--paper);
    font-size: 9.6pt;
    line-height: 1.5;
  }

  .page {
    width: 210mm; height: 297mm;
    padding: 15mm 16mm 18mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    display: flex; flex-direction: column;
  }
  .page:last-child { page-break-after: auto; }

  /* ---- type ---- */
  h1, h2, h3, h4, .sans, .eyebrow, .stat-n, .plan-price, .badge, .fig-n {
    font-family: 'Liberation Sans', Helvetica, Arial, sans-serif;
  }

  .eyebrow {
    font-size: 7pt; font-weight: 700; letter-spacing: .16em;
    text-transform: uppercase; color: var(--ink-3);
  }

  h1 { font-size: 30pt; line-height: 1.02; letter-spacing: -.025em; font-weight: 800; }
  h2 { font-size: 15pt; line-height: 1.12; letter-spacing: -.015em; font-weight: 800; }
  h3 { font-size: 10.5pt; line-height: 1.2; font-weight: 700; }
  h4 { font-size: 8.6pt; font-weight: 700; letter-spacing: .01em; }

  p { margin-top: 2.2mm; }
  .lede { font-size: 11.4pt; line-height: 1.45; color: var(--ink-2); }
  .muted { color: var(--ink-3); }
  .small { font-size: 8.2pt; line-height: 1.42; }
  .tiny { font-size: 7.2pt; line-height: 1.4; }

  strong { font-weight: 700; }
  em.k { font-style: normal; font-weight: 700; color: var(--accent); }

  /* ---- masthead ---- */
  .masthead { display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm; }
  .wordmark { display: flex; align-items: center; gap: 3mm; }
  .mark { width: 11mm; height: 11mm; flex: none; }
  .wordmark .name {
    font-family: 'Liberation Sans', Helvetica, sans-serif;
    font-size: 17pt; font-weight: 800; letter-spacing: -.02em;
  }
  .wordmark .kicker { font-size: 7.4pt; color: var(--ink-3); letter-spacing: .04em; }

  .rule { height: .6pt; background: var(--rule); margin: 4mm 0; }
  .rule-heavy { height: 2pt; background: var(--ink); margin: 3mm 0 5mm; }

  /* ---- layout helpers ---- */
  .row { display: flex; gap: 6mm; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .fill { flex: 1; }
  .spacer { flex: 1 1 auto; }

  /* ---- claim tiles ---- */
  .claims { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: .6pt solid var(--rule); border-bottom: .6pt solid var(--rule); }
  .claim { padding: 4mm 5mm 4mm 0; border-right: .6pt solid var(--rule); }
  .claim:last-child { border-right: 0; padding-right: 0; }
  .claim:not(:first-child) { padding-left: 5mm; }
  .stat-n { font-size: 20pt; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
  .claim h4 { margin-top: 1.5mm; }
  .claim p { margin-top: 1mm; }

  /* ---- device frames ---- */
  .phone { border: .8pt solid var(--rule); border-radius: 3mm; overflow: hidden; background: #fff; }
  .phone img { display: block; width: 100%; }
  /* A fixed frame, because the crops differ in height with content density and
     ragged plate bottoms leave the captions on three different baselines. */
  .phone.fix { height: var(--h); }
  .phone.fix img { height: 100%; object-fit: cover; object-position: top center; }
  .cap { margin-top: 1.6mm; }
  .fig-n {
    display: inline-block; font-size: 6.6pt; font-weight: 800; letter-spacing: .08em;
    color: var(--accent); border: .6pt solid var(--accent); border-radius: 1mm;
    padding: .3mm 1.2mm; margin-right: 1.4mm; vertical-align: 1px;
  }

  /* ---- panels ---- */
  .panel { background: var(--panel); border-radius: 2mm; padding: 5mm; }
  .panel-accent { background: var(--accent-soft); border-left: 2pt solid var(--accent); border-radius: 0 2mm 2mm 0; padding: 5mm; }
  .panel-copper { background: var(--copper-soft); border-left: 2pt solid var(--copper); border-radius: 0 2mm 2mm 0; padding: 5mm; }

  ul { list-style: none; }
  li { position: relative; padding-left: 4.2mm; margin-top: 1.8mm; }
  li::before {
    content: ''; position: absolute; left: 0; top: 1.55mm;
    width: 1.6mm; height: 1.6mm; border-radius: 50%; background: var(--accent);
  }
  li.no::before { background: var(--copper); }
  li.tick::before {
    content: '\\2713'; font-family: 'Liberation Sans', sans-serif; font-size: 7.5pt;
    font-weight: 700; color: var(--good); background: none; width: auto; height: auto; top: -.1mm;
  }

  /* ---- feature blocks ---- */
  .feat { display: grid; grid-template-columns: 30mm 1fr; gap: 5mm; align-items: start; }
  .feat + .feat { margin-top: 3mm; padding-top: 3mm; border-top: .6pt solid var(--rule-2); }

  /* ---- plans ---- */
  .plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .plan { border: .8pt solid var(--rule); border-radius: 2mm; padding: 4.5mm; }
  .plan.hero { border-color: var(--accent); border-width: 1.4pt; background: var(--accent-soft); }
  .plan-price { font-size: 19pt; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
  .plan-price span { font-size: 8pt; font-weight: 400; color: var(--ink-3); letter-spacing: 0; }
  .plan ul li { margin-top: 1.3mm; font-size: 8pt; }
  .plan ul li::before { top: 1.35mm; width: 1.3mm; height: 1.3mm; }

  .badge {
    display: inline-block; font-size: 6.6pt; font-weight: 800; letter-spacing: .1em;
    text-transform: uppercase; padding: .8mm 2mm; border-radius: 1mm;
    background: var(--accent); color: #fff;
  }

  /* ---- footer ---- */
  .foot {
    position: absolute; left: 16mm; right: 16mm; bottom: 8mm;
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 6.8pt; color: var(--ink-3); letter-spacing: .04em;
    border-top: .6pt solid var(--rule); padding-top: 2mm;
    font-family: 'Liberation Sans', sans-serif;
  }

  .contact-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
  .contact-grid .k { font-size: 6.8pt; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); font-family: 'Liberation Sans', sans-serif; font-weight: 700; }
  .contact-grid .v { font-size: 9.4pt; margin-top: .8mm; }
</style></head>
<body>

<!-- ══════════════════════════ PAGE 1 ══════════════════════════ -->
<section class="page">
  <div class="masthead">
    <div class="wordmark">
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="13" fill="#10171d"/>
        <circle cx="32" cy="32" r="17" fill="none" stroke="#39a8dd" stroke-width="4"/>
        <rect x="29" y="12" width="6" height="26" rx="3" fill="#c8712f"/>
        <circle cx="32" cy="43" r="8" fill="#c8712f"/>
        <circle cx="32" cy="43" r="3.5" fill="#10171d"/>
      </svg>
      <div>
        <div class="name">ThermoRivet</div>
        <div class="kicker">Diagnostic assistant for HVAC service technicians</div>
      </div>
    </div>
    <div class="eyebrow">Product overview</div>
  </div>

  <div class="rule-heavy"></div>

  <div class="row" style="align-items: flex-start;">
    <div style="flex: 1.35;">
      <h1>It works the fault,<br>not the keyword.</h1>
      <p class="lede" style="margin-top:4mm;">
        Most “AI for HVAC” is a chatbot that answers whatever you type. ThermoRivet runs a
        diagnostic engine: it holds every candidate cause at once, asks for the single test that
        best separates them, and updates the ranking from what you actually measured.
      </p>
      <p style="margin-top:3.5mm; color: var(--ink-2);">
        The reasoning is deterministic and runs on our own servers — the same evidence produces the
        same walk, every time, and every conclusion can be replayed step by step. That is what makes
        it defensible in front of a customer, and what a language model on its own cannot give you.
      </p>

      <div class="panel-accent" style="margin-top:5mm;">
        <h3>The rule the whole product is built on</h3>
        <p class="small" style="margin-top:1.5mm;">
          Nothing expensive gets condemned on circumstantial evidence. A compressor, a heat
          exchanger or a control board requires a test that confirms it directly — no matter how
          far in front it is on the readings.
        </p>
      </div>
    </div>

    <div style="flex: .65;">
      <div class="phone"><img src="${IMG['c1-undercharge']}" alt="Diagnosis screen showing a low refrigerant charge conclusion"></div>
      <p class="cap tiny muted"><span class="fig-n">01</span>A finished diagnosis: the conclusion, the hazards that apply to it, and the evidence behind it.</p>
    </div>
  </div>

  <div class="grid-2" style="margin-top:6mm;">
    <div>
      <h4 style="color:var(--ink-3); letter-spacing:.1em; text-transform:uppercase; font-size:7pt;">On a call it</h4>
      <ul class="small" style="margin-top:2mm;">
        <li>Takes the complaint in the words the customer used, or spoken aloud</li>
        <li>Asks the one test that best separates what is still on the table</li>
        <li>Reads the rating plate from a photo, and asks again if it cannot</li>
        <li>Scopes a fault code to the model and control board before interpreting it</li>
      </ul>
    </div>
    <div>
      <h4 style="color:var(--ink-3); letter-spacing:.1em; text-transform:uppercase; font-size:7pt;">And then</h4>
      <ul class="small" style="margin-top:2mm;">
        <li>Names the repair with the parts, or says it does not have enough to name one</li>
        <li>Files the whole walk against the customer and the job</li>
        <li>Exports a service report the customer can read</li>
        <li>Keeps every reading with a note of where the number came from</li>
      </ul>
    </div>
  </div>

  <div class="spacer"></div>

  <div class="claims">
    <div class="claim">
      <div class="stat-n">1</div>
      <h4>question at a time</h4>
      <p class="tiny muted">Cheapest informative test first, with the reason it was chosen. Never a checklist of forty readings.</p>
    </div>
    <div class="claim">
      <div class="stat-n">41</div>
      <h4>candidate causes</h4>
      <p class="tiny muted">Ranked continuously across electrical, refrigeration, heating and airflow — with what rules each one out.</p>
    </div>
    <div class="claim">
      <div class="stat-n">91</div>
      <h4>automated tests</h4>
      <p class="tiny muted">Including an evaluation suite that checks the <em>route</em> to an answer, not just the answer.</p>
    </div>
  </div>

  <p class="small muted" style="margin-top:5mm;">
    Runs in any phone browser and installs to the home screen. Dark by default, 48&nbsp;px touch
    targets, 16&nbsp;px inputs — built for a phone held in a gloved hand in a mechanical room, not
    for a desk.
  </p>

  <div class="foot"><span>ThermoRivet — product overview</span><span>Page 1 of 4</span></div>
</section>

<!-- ══════════════════════════ PAGE 2 ══════════════════════════ -->
<section class="page">
  <div class="eyebrow">How a diagnosis actually runs</div>
  <h2 style="margin-top:2mm;">Evidence in, ranking out, conclusion last</h2>
  <div class="rule"></div>

  <div class="grid-3">
    <div>
      <div class="phone fix" style="--h:60mm;"><img src="${IMG['v-1-conclusion-top']}" alt="The app asking a single diagnostic question with a hazard banner above it"></div>
      <p class="cap tiny muted"><span class="fig-n">02</span><strong>One question.</strong> The hazard for the step is rendered above the instruction and a lethal one cannot be dismissed.</p>
    </div>
    <div>
      <div class="phone fix" style="--h:60mm;"><img src="${IMG['d2-ranking']}" alt="Six candidate causes ranked by probability"></div>
      <p class="cap tiny muted"><span class="fig-n">03</span><strong>Live ranking.</strong> Every candidate with its current probability. Tap one to see the findings driving it — and the ones arguing against.</p>
    </div>
    <div>
      <div class="phone fix" style="--h:60mm;"><img src="${IMG['c3-furnace']}" alt="Furnace flame sensor conclusion at 100% confidence"></div>
      <p class="cap tiny muted"><span class="fig-n">04</span><strong>Conclusion.</strong> Flame proving localised in two questions, with the repair, the parts and every hazard that applies.</p>
    </div>
  </div>

  <div class="rule" style="margin-top:5mm;"></div>

  <div class="row" style="margin-top:1mm;">
    <div style="flex:1.45;">
      <h2>The reading that gets compressors replaced</h2>
      <p style="margin-top:2.5mm; color: var(--ink-2);">
        A condenser humming and drawing <strong>78&nbsp;A against an 82&nbsp;A locked-rotor
        rating</strong> is a stalled motor. It is also the single most common reason a healthy
        compressor gets condemned and a customer gets a five-figure quote they did not need.
      </p>
      <p style="margin-top:2.5mm; color: var(--ink-2);">
        In our own recorded walk, “compressor mechanically seized” was leading the ranking one step
        earlier. The engine refused to conclude on it, called for the capacitor test, and found
        <strong>8.2&nbsp;µF against a 45&nbsp;µF rating</strong>. The answer was a $30 part.
      </p>
      <div class="panel" style="margin-top:4mm;">
        <p class="small">
          That behaviour is not a prompt asking the model to be careful. It is a property of the
          engine — an expensive hypothesis carries a required-evidence flag and cannot be concluded
          without a test that confirms it — and it has a test that fails if it ever regresses.
        </p>
      </div>
    </div>
    <div style="flex:.55;">
      <div class="phone"><img src="${IMG['c4-capacitor']}" alt="Run capacitor conclusion at 72% confidence with the amp draw evidence"></div>
      <p class="cap tiny muted"><span class="fig-n">05</span>The same evidence, the correct part.</p>
    </div>
  </div>

  <div class="spacer"></div>

  <div class="grid-2" style="margin-top:4mm;">
    <div class="panel-accent">
      <h3>It says when it does not know</h3>
      <p class="small" style="margin-top:1.5mm;">
        On a system where every reading is in range it reaches <strong>no conclusion at all</strong>
        rather than manufacturing a fault. An app that invents a failure on healthy equipment costs
        you the customer.
      </p>
    </div>
    <div class="panel-accent">
      <h3>Fault codes scoped to the board</h3>
      <p class="small" style="margin-top:1.5mm;">
        A Carrier code means different things on different boards. Without one, the app returns
        <strong>every meaning it holds</strong> and asks for the model number rather than picking.
        Entries stay marked unverified until confirmed against a manufacturer document.
      </p>
    </div>
  </div>

  <div class="foot"><span>ThermoRivet — product overview</span><span>Page 2 of 4</span></div>
</section>

<!-- ══════════════════════════ PAGE 3 ══════════════════════════ -->
<section class="page">
  <div class="eyebrow">In the van, on the roof</div>
  <h2 style="margin-top:2mm;">The rest of the call</h2>
  <div class="rule"></div>

  <div class="feat">
    <div>
      <div class="phone"><img src="${IMG['p6-step6-live-circuit']}" alt="Live superheat and subcooling from wireless probes"></div>
      <p class="cap tiny muted"><span class="fig-n">06</span>Live circuit. Amber banner marks the built-in simulator.</p>
    </div>
    <div>
      <h3>Wireless gauges, read live</h3>
      <p class="small" style="margin-top:1.5mm;">
        Pair a wireless probe set and superheat and subcooling recompute on every packet — dew point
        on the low side, bubble point on the liquid line, so a zeotropic blend stays honest. Watching
        superheat settle is how you know the system has stabilised; a snapshot typed afterwards is a
        reading of the transient.
      </p>
      <p class="small" style="margin-top:2mm;">
        A clamp feeds nothing until you say where it is fitted, a reading over a minute old is
        refused, and two probes claiming the same line is reported rather than silently overwritten.
      </p>
      <p class="small" style="margin-top:2mm;">
        <strong>Working today:</strong> any probe using the published Bluetooth standard profile,
        on Android, Windows and macOS. <strong>Not yet:</strong> Fieldpiece JobLink, Testo and
        Yellow Jacket — see page&nbsp;4.
      </p>
    </div>
  </div>

  <div class="feat">
    <div>
      <div class="phone"><img src="${IMG['shot-customers']}" alt="Customer list with open job counts"></div>
      <p class="cap tiny muted"><span class="fig-n">07</span>The book, sorted by who you saw last.</p>
    </div>
    <div>
      <h3>Customers and service history</h3>
      <p class="small" style="margin-top:1.5mm;">
        Every job files itself against the customer. Open the site and you get the contact, the gate
        code and the dog, the equipment on site, and every diagnosis and report ever raised there —
        before you knock.
      </p>
      <p class="small" style="margin-top:2mm;">
        A repeat visit attaches to the existing record instead of creating a second copy of the same
        house. Call, text and directions are one tap from the customer screen. On a company plan the
        book is shared across the crew; a solo technician's records stay private to them.
      </p>
    </div>
  </div>

  <div class="feat">
    <div>
      <div class="phone"><img src="${IMG['p9-derived']}" alt="Calculated readings with severity and provenance"></div>
      <p class="cap tiny muted"><span class="fig-n">08</span>Every conversion says where it came from.</p>
    </div>
    <div>
      <h3>Numbers that carry their provenance</h3>
      <p class="small" style="margin-top:1.5mm;">
        Superheat, subcooling, evaporator TD, temperature rise, static pressure, capacitor
        tolerance, gas input — each with its expected band and a plain-English reading of what it
        means. Anything converted from a pressure is tagged <strong>CONVERTED</strong> and tells you
        to confirm against the manufacturer's P/T chart before acting on a marginal value.
      </p>
      <p class="small" style="margin-top:2mm;">
        Model-number decoding separates what it actually read from what it inferred. Photo analysis
        of a rating plate never guesses a character it could not see — it asks for a better picture.
        Service reports export to PDF with the readings, the conclusion and what was ruled out.
      </p>
    </div>
  </div>

  <div class="feat">
    <div>
      <div class="phone"><img src="${IMG['shot-home']}" alt="Home screen showing the diagnostic tools"></div>
      <p class="cap tiny muted"><span class="fig-n">09</span>One screen, everything on the truck.</p>
    </div>
    <div>
      <h3>The rest of the toolkit</h3>
      <p class="small" style="margin-top:1.5mm;">
        Manufacturer fault-code lookup, rating-plate scanning, and the four calculator sets a
        technician reaches for most — electrical (capacitor tolerance, amp draw, voltage drop),
        refrigeration (P/T, superheat, subcooling, target charge), heating (temperature rise, gas
        input, ignition sequence) and airflow (static pressure, CFM, delta-T).
      </p>
      <p class="small" style="margin-top:2mm;">
        Each is the same engine's arithmetic, so a number worked out on a calculator screen means
        what it means inside a diagnosis.
      </p>
    </div>
  </div>

  <div class="spacer"></div>

  <div class="panel" style="margin-top:3mm; padding:4mm;">
    <div class="grid-2" style="gap:7mm;">
      <div>
        <h4>Safety is not advisory</h4>
        <p class="tiny" style="margin-top:1.2mm;">
          Line voltage, capacitor storage, fuel gas, refrigerant pressure, combustion and CO, arc
          flash and rotating equipment each carry a banner above the step they apply to. The app
          will not help bypass a safety control, and the guardrail runs on its own generated text
          as well as on what you type.
        </p>
      </div>
      <div>
        <h4>Built for the conditions</h4>
        <p class="tiny" style="margin-top:1.2mm;">
          Dark by default because most service work happens in dark spaces. Severity is never
          carried by colour alone. Voice input runs on the phone itself. The full diagnostic engine
          works with no AI key configured at all — a language model only changes the wording, never
          the decision.
        </p>
      </div>
    </div>
  </div>

  <div class="foot"><span>ThermoRivet — product overview</span><span>Page 3 of 4</span></div>
</section>

<!-- ══════════════════════════ PAGE 4 ══════════════════════════ -->
<section class="page">
  <div class="eyebrow">Plans</div>
  <h2 style="margin-top:2mm;">Priced per technician</h2>
  <div class="rule"></div>

  <div class="plans">
    <div class="plan">
      <h3>Free</h3>
      <div class="plan-price" style="margin-top:2mm;">$0</div>
      <p class="tiny muted" style="margin-top:1mm;">Try the engine</p>
      <ul style="margin-top:3mm;">
        <li>5 guided diagnoses a month</li>
        <li>Fault-code lookup</li>
        <li>Refrigerant P/T and superheat calculators</li>
      </ul>
    </div>
    <div class="plan hero">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Pro</h3><span class="badge">Most technicians</span>
      </div>
      <div class="plan-price" style="margin-top:2mm;">$29 <span>/ month</span></div>
      <p class="tiny muted" style="margin-top:1mm;">or $290 a year — two months free</p>
      <ul style="margin-top:3mm;">
        <li>Unlimited guided diagnoses</li>
        <li>Wireless gauge readings</li>
        <li>Photo analysis and model decoding</li>
        <li>Full fault-code database</li>
        <li>Customers and service history</li>
        <li>Service reports with PDF export</li>
        <li>Voice input in the field</li>
      </ul>
    </div>
    <div class="plan">
      <h3>Company</h3>
      <div class="plan-price" style="margin-top:2mm;">$79.99 <span>/ month</span></div>
      <p class="tiny muted" style="margin-top:1mm;">10 technician seats included</p>
      <ul style="margin-top:3mm;">
        <li>Everything in Pro, for every technician</li>
        <li>Shared customer book across the crew</li>
        <li>Your own manuals in the knowledge base</li>
        <li>Branded service reports</li>
        <li>Priority support</li>
      </ul>
    </div>
  </div>

  <div class="rule" style="margin-top:6mm;"></div>

  <div class="row" style="margin-top:1mm;">
    <div style="flex:1;">
      <h2>Where it stands today</h2>
      <p class="small" style="margin-top:2mm; color: var(--ink-2);">
        We would rather you knew this before you bought it than after. Everything on the previous
        three pages is built and running. These are the edges.
      </p>

      <div class="panel-copper" style="margin-top:4mm;">
        <h4>Fieldpiece, Testo and Yellow Jacket probes do not connect yet</h4>
        <p class="small" style="margin-top:1.2mm;">
          Their probes speak Bluetooth, but none of the three publishes the protocol and none offers
          a public SDK. A driver written from guesswork would turn arbitrary bytes into
          plausible-looking pressures that a technician then adjusts a charge from — a silent
          failure worse than no wireless support. So we have not shipped one. Probes using the
          published Bluetooth standard profile work now, and the app lists the exact status per
          vendor on the pairing screen.
        </p>
      </div>

      <ul class="small" style="margin-top:4mm;">
        <li class="no"><strong>iOS wireless probes need the native app.</strong> Apple has never shipped Web Bluetooth, and every iOS browser is WebKit underneath. Everything else works in Mobile Safari today.</li>
        <li class="no"><strong>The iOS app is not on the App Store yet.</strong> Account deletion, privacy and support pages, and Apple In-App Purchase are all built and ready for review.</li>
        <li class="no"><strong>Boilers, hydronics and VRF are thin.</strong> The engine's depth is in split systems, packaged units, gas furnaces and heat pumps.</li>
        <li class="no"><strong>Fault-code data is marked unverified</strong> until confirmed against a manufacturer document. The app says so on every entry rather than pretending otherwise.</li>
      </ul>
    </div>

    <div style="flex:.5;">
      <div class="phone"><img src="${IMG['p2-step2-vendors']}" alt="The in-app probe support list showing which vendors work"></div>
      <p class="cap tiny muted"><span class="fig-n">10</span>The support list is in the app, on the pairing screen — not buried in a footnote.</p>
    </div>
  </div>

  <div class="spacer"></div>

  <div class="rule-heavy" style="margin-bottom:4mm;"></div>
  <div class="contact-grid">
    <div><div class="k">Company</div><div class="v">${CONTACT.company}</div></div>
    <div><div class="k">Email</div><div class="v">${CONTACT.email}</div></div>
    <div><div class="k">Phone</div><div class="v">${CONTACT.phone}</div></div>
    <div><div class="k">Web</div><div class="v">${CONTACT.site}</div></div>
  </div>
  <p class="tiny muted" style="margin-top:3mm; margin-bottom:6mm;">
    ThermoRivet assists a qualified technician. It does not replace one. Always follow applicable
    codes, the manufacturer's procedures, and your own safety practices. Screenshots are of the
    working application; readings shown against the built-in simulator are marked as such on screen.
  </p>

  <div class="foot"><span>ThermoRivet — product overview</span><span>Page 4 of 4</span></div>
</section>

</body></html>`;

await mkdir(dirname(OUT), { recursive: true });
const htmlPath = OUT.replace(/\.pdf$/, '.html');
await writeFile(htmlPath, html);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();

console.log(`Wrote ${OUT}`);
console.log(`      ${htmlPath}`);
