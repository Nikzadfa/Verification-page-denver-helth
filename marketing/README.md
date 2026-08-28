# Sell sheet

`ThermoRivet-overview.pdf` — four pages, A4, print-ready. Built from the real
app: every screenshot in `shots/` is a capture of the running application, and
every claim in the copy corresponds to behaviour covered by a test.

## Put your own details on it

The contact block on page 4 ships with placeholders. Fill them in and rebuild:

```bash
SHEET_COMPANY="Rivet Mechanical LLC" \
SHEET_EMAIL="sales@rivetmechanical.com" \
SHEET_PHONE="(555) 010-8842" \
SHEET_SITE="rivetmechanical.com" \
node marketing/build-sheet.mjs
```

Takes a couple of seconds. It writes the PDF and a matching self-contained
`.html` (useful for an email body or a landing page).

## Options

```bash
node marketing/build-sheet.mjs --out ~/Desktop/ThermoRivet.pdf
node marketing/build-sheet.mjs --shots path/to/other/screenshots
CHROME_PATH=/path/to/chrome node marketing/build-sheet.mjs   # non-default browser
```

Letter instead of A4: change `@page { size: A4 }` and the `.page` width and
height in the stylesheet inside the script, and the `format` passed to
`page.pdf`.

## Replacing a screenshot

Drop a new PNG into `shots/` under the same filename and rebuild. Phone
captures are tall, so each plate is cropped before it is placed — the `PLATES`
map near the top of the script holds a `keep` fraction (how much of the image
height to retain from the top) and an optional width per file. Adjust the
`keep` value if a new capture ends mid-row.

## Before you send it anywhere

The sheet says out loud, on page 4, that Fieldpiece, Testo and Yellow Jacket
probes do not connect yet, and that the iOS app is not on the App Store. That
is deliberate. A contractor who finds out afterwards stops trusting the rest of
the page, and a sales conversation that opens with the limits is a shorter one.

Do not delete that panel to make the sheet look better. If those things change,
change the panel.

Two claims to keep current as the product moves:

- **"91 automated tests"** on page 1 — run `npm test` and update the number.
- **"41 candidate causes"** — that is the size of the hypothesis catalogue in
  `src/lib/engine/knowledge/hypotheses.ts`.

The gauge screenshots show the built-in simulator, and the amber banner saying
so is visible in the image. Leave it visible.
