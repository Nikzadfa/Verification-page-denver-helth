# ThermoRivet

A diagnostic assistant for HVAC service technicians.

The product is not a chat interface with an HVAC prompt. The reasoning is a
deterministic engine; the language model sits on either side of it, parsing
what a technician said and putting the engine's chosen step into readable
prose. That separation is the whole design, and everything else follows from
it.

---

## Why it is built this way

A language model asked to "diagnose systematically" will do so most of the
time. The rest of the time it pattern-matches to the most common failure and
names a part. In a trade where the wrong answer means a return trip, a wrong
part, or a furnace left running with a defeated safety control, "most of the
time" is not a specification.

So the decisions that matter are made in code:

| Decision | Made by |
|---|---|
| What to ask next | `src/lib/engine/planner.ts` — expected decisiveness ÷ cost |
| How likely each cause is | `src/lib/engine/inference.ts` — Bayesian update in log space |
| Whether there is enough evidence to conclude | `src/lib/engine/planner.ts` — `shouldConclude` |
| What a reading means | `src/lib/hvac/` — real psychrometrics and refrigerant math |
| What a fault code means | `src/lib/faultcodes/decide.ts` — scoped to the control board |
| Whether an instruction is safe | `src/lib/safety/hazards.ts` — structural, not prompted |
| Understanding free text and voice | the model (with a deterministic parser first) |
| Wording the step | the model (with a template fallback) |
| Reading a photograph | the model |

Take the API key away and the product still diagnoses correctly. It just
reads less fluently.

---

## The diagnostic loop

```
complaint
   ↓  classified into symptom families (keywords first, model only as fallback)
hypothesis set
   ↓  ranked by prior × likelihood ratios from the findings so far
next test
   ↓  chosen by expected decisiveness ÷ (time × risk)
technician answers  ──►  measurements ──► derived findings (superheat, static, µA…)
   ↓
re-rank, re-plan
   ↓  only when: confidence ≥ 62%, required evidence present,
   ↓             a confirming test has run, and no cheap test would change the answer
diagnosis + evidence + what was ruled out and why
```

Four guards keep it honest, and all four are tested:

- **No premature conclusion.** The engine will not name a cause while a cheap
  test remains that would meaningfully move the ranking.
- **No condemnation without direct evidence.** A hypothesis with
  `requiresEvidence` cannot be concluded on circumstantial readings, however
  high its posterior climbs. You cannot condemn a compressor without winding
  or amp data.
- **Trade sequencing.** `prerequisiteTestIds` encodes rules information gain
  will not produce on its own — above all, test the run capacitor before going
  anywhere near condemning the compressor.
- **Negative results count.** Establishing that the filter is clean argues
  against the dirty-filter hypothesis. Without this the engine could never
  rule anything out.

---

## Fault codes

The central rule: **a printed fault code has no meaning until it is scoped to
a control board.** Carrier code 31 means one thing on an HK42FZ and something
else on an Infinity control, and a system that answers confidently for both is
worse than no system, because the technician trusts it.

`resolveFaultCode` returns a resolution *state*, and both the UI and the
narration layer are required to act on it:

| State | Behaviour |
|---|---|
| `EXACT` | One match at board scope. Safe to present as the meaning. |
| `MODEL_SCOPED` | Matched at series level. Presented with an explicit "confirm the board". |
| `AMBIGUOUS` | Several meanings. **All** are shown; the board is demanded. Never picks one. |
| `BRAND_FALLBACK` | Brand-level entry only. Clearly hedged. |
| `NOT_FOUND` | Says so. Does not invent a meaning. |

Every seeded code is `PROVISIONAL` — from public service literature, not
checked against a manufacturer document held in this installation. Technicians
see that status on every lookup. Upload the real literature under
**Admin → Knowledge base** and promote codes to `CONFIRMED`.

---

## Data honesty

Three mechanisms, because this is where a tool like this does real damage:

**Refrigerant P/T tables** (`src/lib/hvac/refrigerants.ts`) are field
approximations and say so in the type system. Every conversion returns
`mustVerify`, and the UI renders "converted from pressure — confirm against
your P/T chart" wherever it appears, including in the PDF. The engine prefers
a technician-entered saturation temperature and only falls back to the tables.

**Model decoding** (`src/lib/decoder/`) marks every field `DECODED`,
`INFERRED`, `ESTIMATED` or `UNKNOWN`. A guessed tonnage never renders like a
decoded one. Refrigerant is deliberately never inferred from a model number.

**Photo analysis** (`src/lib/vision/analyze.ts`) returns `null` for anything
not legible character by character, reports ambiguous characters by position
(`8` vs `B`) rather than choosing, and says what photo to take instead.

---

## Safety

Hazards are data, not prompt text. Every test carries hazard ids; the UI
renders the banner **above** the instruction and a LETHAL hazard cannot be
collapsed. `checkForBypassRequest` runs on both technician input and generated
output, so an instruction to jumper a pressure switch cannot reach the field
even if a model produced one — the technician gets the diagnostic alternative
instead.

---

## Running it

```bash
npm install
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET at minimum
npx prisma migrate deploy     # needs PostgreSQL 15+ with the vector extension
npm run db:seed
npm run dev
```

`ANTHROPIC_API_KEY` is optional. Without it the engine works fully; free-text
understanding, narration and photo analysis fall back or degrade with a clear
message. Stripe, S3 and Voyage are all optional in the same way.

```bash
npm test          # 42 tests: engine, evals, PDF
npm run typecheck
npm run build
```

---

## AI Testing Center

`/admin/eval` replays stored scenarios through the real engine and grades what
it actually decided — which test it asked for, in what order, how it ranked the
causes, whether it concluded too early, whether it demanded the board before
interpreting a code.

The checks are mechanical, not model-graded. A suite graded by a language model
drifts with the grader and you lose the ability to tell a regression from a
mood. Every run is stamped with the engine and prompt version, so a regression
is traceable rather than mysterious.

The suite runs in CI as `tests/evals.test.ts` — no database, no model, roughly
400 ms — which is what lets it gate every change to the hypothesis catalogue.
It has already earned its keep: it caught five real engine defects during
development, documented in the git history.

---

## Adding to the knowledge base

Adding a **failure mode**: one entry in `src/lib/engine/knowledge/hypotheses.ts`
— what it is, which complaints it explains, its likelihood weights, what it is
confused with and which test separates them, and what the repair involves.
Nothing else changes.

Adding a **test**: one entry in `knowledge/tests.ts` with its time cost, risk
factor, hazard ids and the findings it can produce — *including the negative
ones*, or the planner will under-value it.

Adding a **manufacturer**: one entry in `prisma/seed/manufacturers.ts` plus
fault codes scoped to its boards. No schema change, no code change, no prompt
change.

Adding a **model-number decoder**: one entry in the `DECODERS` registry in
`src/lib/decoder/index.ts`.

---

## Layout

```
src/lib/engine/     the diagnostic engine (deterministic, pure, no I/O)
  knowledge/        hypotheses, tests, findings — the evidence base
src/lib/hvac/       refrigerants, psychrometrics, circuit/airflow/electrical/combustion analysis
src/lib/safety/     hazard catalogue and the bypass guardrail
src/lib/faultcodes/ scoped resolution (decide.ts is pure and directly tested)
src/lib/decoder/    model-number decoding with provenance per field
src/lib/rag/        chunking, embeddings, pgvector search, citation-bearing retrieval
src/lib/ai/         provider, prompts, extraction, narration
src/lib/vision/     photo analysis
src/lib/eval/       scenario replay and mechanical grading
src/lib/reports/    report assembly and server-side PDF
src/app/            Next.js App Router: pages and API routes
tests/              engine, eval suite, PDF
```

---

ThermoRivet assists a qualified technician. It does not replace one. Follow
applicable codes, the manufacturer's procedures, and your own safety practices.
