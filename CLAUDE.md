# Working in this codebase

Read `README.md` first for the architecture. This file is the rules that are
easy to violate accidentally.

## The one rule

**The model never decides anything diagnostic.** It parses language, narrates
the engine's choice, and reads photographs. It does not choose the next test,
rank a cause, or reach a conclusion.

If you find yourself adding a prompt instruction like "be careful to consider
alternatives" or "don't condemn parts prematurely", stop — that belongs in
`src/lib/engine/`, where it can be tested. Prompt-level guardrails hold most of
the time, and most of the time is not good enough here.

## Before changing the engine

`npm test` must pass. The eval suite (`tests/evals.test.ts`) exists to catch
exactly the kind of regression that is invisible in review: the engine still
reaches a plausible answer, but by the wrong route, or one test too early.

A failing eval is usually the engine being wrong, not the test. Read the
replay in the failure output before touching the assertion — it prints the
whole walk with the ranking at each step.

## Adding a hypothesis

Fill in `evidence` honestly, including the findings that argue *against* it,
and especially the ones that `RULES_OUT`. A hypothesis with only supporting
evidence will float near the top forever on its prior and crowd out the real
answer.

Set `requiresEvidence` for anything expensive to be wrong about — compressors,
heat exchangers, control boards. It stops the engine concluding on
circumstantial readings no matter how high the posterior climbs.

Fill in `confusedWith`. It is what produces "here is how to tell these apart",
which is the difference between this and a parts-swapping suggestion box.

## Adding a test

List **every** finding it can produce in `yields`, including the negative
outcomes. The planner computes expected information gain over exactly that
set, so a test that omits its negatives is under-valued and never chosen.

`riskFactor` means *how invasive or consequential is this procedure* — not how
hazardous it is to the technician. Hazards travel separately in `hazardIds`
and are always rendered. Getting this backwards once already suppressed
routine meter work in favour of nothing.

## Data honesty

If you add a number a technician might act on, it carries its provenance.
Decoder fields carry `DECODED`/`INFERRED`/`ESTIMATED`/`UNKNOWN`; P/T
conversions carry `mustVerify`; fault codes carry a `VerificationStatus`;
vision fields carry `legible`. Do not add a code path that strips these.

Never seed a fault code as `CONFIRMED` unless it is genuinely backed by a
manufacturer document in the knowledge base.

## Safety

`neverBypass` entries in `src/lib/safety/hazards.ts` are not advisory. The
guardrail runs on generated output as well as technician input. If you add a
new safety control to the catalogue, add its bypass patterns too.

Hazard banners render above the instruction. Do not move them, collapse them,
or make a LETHAL hazard dismissible.

## UI

Field conditions, not office conditions: 48px minimum touch targets, 16px
minimum input font (smaller zooms the viewport on iOS), severity never by
colour alone, and dark mode as the default.

## Conventions

- `npm run typecheck` and `npm test` before committing.
- `src/lib/engine/` is pure — no I/O, no model calls, no Prisma. That is what
  makes the eval suite fast and the diagnosis replayable.
- Route handlers stay thin. Logic belongs in `src/lib/`.
- Every request body goes through a schema in `src/lib/api/schemas.ts`.
