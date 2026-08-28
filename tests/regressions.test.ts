/**
 * Regression tests for defects found in the post-build review.
 *
 * Each one failed before its fix. They are grouped by what went wrong rather
 * than by module, because that is how someone reading a future failure will
 * want to find them.
 */

import { describe, expect, it } from 'vitest';
import { applyTestOption, createState, evaluate } from '../src/lib/engine/session';
import { TESTS } from '../src/lib/engine/knowledge/tests';
import { extractDeterministic } from '../src/lib/ai/extract';

describe('engine: an option must declare every finding it implies', () => {
  it('burners lighting proves the inducer ran and the ignitor glowed', () => {
    let s = createState({ equipmentType: 'GAS_FURNACE', families: ['no_heat'], mode: 'HEATING' });
    s = applyTestOption(s, 'observe-ignition-sequence', 'drops_out');

    // Anything a test yields but an option omits is recorded as established
    // ABSENT. Omitting the earlier stages told the engine the inducer never
    // ran on a furnace whose burners had just lit, which inverted the
    // likelihood ratio and boosted inducer-motor-fault.
    for (const key of ['inducer_running', 'ignitor_glows']) {
      const f = s.findings.find((x) => x.key === key);
      expect(f?.present, `${key} must be present, not absent`).toBe(true);
    }

    const view = evaluate(s);
    const inducer = view.scores.find((x) => x.hypothesisId === 'inducer-motor-fault');
    expect(inducer?.posterior ?? 0).toBeLessThan(0.02);
  });

  it('no option contradicts a finding it also declares present', () => {
    for (const test of TESTS) {
      for (const option of test.options ?? []) {
        const absent = test.yields.filter((y) => !option.findings.includes(y));
        for (const key of option.findings) {
          expect(
            absent.includes(key),
            `${test.id}/${option.value} declares ${key} both present and absent`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('extraction: units and categorical fields', () => {
  it('refuses a message in Celsius rather than reading it as Fahrenheit', () => {
    const r = extractDeterministic('suction line temp 12 celsius');
    // 12 °C recorded as 12 °F is a 42-degree error straight into superheat.
    expect(r.measurements).toEqual([]);
    expect(r.unitRefusal).toBe(true);
    expect(r.warnings[0]).toMatch(/not in °F or psig/i);
  });

  it('refuses kPa the same way', () => {
    const r = extractDeterministic('suction 118, liquid 325 kPa');
    expect(r.measurements).toEqual([]);
    expect(r.unitRefusal).toBe(true);
  });

  it('never puts a number into a categorical field', () => {
    // "gas" is an alias of the refrigerant field; the numeric scan used to
    // match "inlet gas 7" and set refrigerant = 7.
    const r = extractDeterministic('inlet gas 7 and manifold pressure 3.5');
    const refrigerant = r.measurements.find((m) => m.key === 'refrigerant');
    expect(refrigerant).toBeUndefined();
    expect(r.measurements.find((m) => m.key === 'manifold_pressure')?.value).toBe(3.5);
  });

  it('still handles the ordinary case', () => {
    const r = extractDeterministic(
      'Carrier R410A, outdoor temperature 92, suction 118, liquid 325, supply 68, return 78',
    );
    const byKey = Object.fromEntries(r.measurements.map((m) => [m.key, m.value ?? m.text]));
    expect(byKey).toMatchObject({
      refrigerant: 'R-410A',
      outdoor_db: 92,
      suction_pressure: 118,
      liquid_pressure: 325,
      supply_db: 68,
      return_db: 78,
    });
    expect(r.unitRefusal).toBeFalsy();
  });
});
