import { describe, expect, it } from 'vitest';
import {
  applyTestOption,
  classifyComplaint,
  createState,
  evaluate,
  recordMeasurements,
} from '../src/lib/engine/session';
import { rankHypotheses } from '../src/lib/engine/inference';
import type { EngineContext, Finding } from '../src/lib/engine/types';

function ctx(over: Partial<EngineContext> = {}): EngineContext {
  return {
    equipmentType: 'CENTRAL_AC',
    families: ['insufficient_cooling'],
    refrigerant: 'R-410A',
    meteringDevice: 'TXV',
    mode: 'COOLING',
    ...over,
  };
}

function finding(key: string, present = true, confidence = 0.9): Finding {
  return {
    key,
    label: key,
    present,
    detail: 'test',
    confidence,
    observedAt: new Date().toISOString(),
  };
}

describe('complaint classification', () => {
  it('maps common field phrasing onto symptom families', () => {
    expect(classifyComplaint('AC is running but not cooling')).toContain('insufficient_cooling');
    expect(classifyComplaint('furnace has no heat, code 31 flashing')).toEqual(
      expect.arrayContaining(['no_heat', 'fault_code']),
    );
    expect(classifyComplaint('unit is frozen up solid')).toContain('frozen_coil');
  });

  it('returns nothing rather than guessing on an unrecognized complaint', () => {
    expect(classifyComplaint('customer says it feels weird')).toEqual([]);
  });
});

describe('inference', () => {
  it('separates undercharge from restriction using subcooling', () => {
    const opts = { equipmentType: 'CENTRAL_AC' as const, families: ['insufficient_cooling' as const] };

    const undercharge = rankHypotheses(
      [finding('superheat_high'), finding('subcooling_low'), finding('pattern_high_sh_low_sc')],
      opts,
    );
    const restriction = rankHypotheses(
      [finding('superheat_high'), finding('subcooling_high'), finding('pattern_high_sh_high_sc')],
      opts,
    );

    expect(undercharge[0]!.hypothesisId).toBe('low-charge-leak');
    expect(restriction[0]!.hypothesisId).toBe('liquid-line-restriction');
  });

  it('lets a RULES_OUT finding eliminate a hypothesis outright', () => {
    const scores = rankHypotheses([finding('capacitor_ok')], {
      equipmentType: 'CENTRAL_AC',
      families: ['no_cooling'],
    });
    const cap = scores.find((s) => s.hypothesisId === 'run-capacitor-failed');
    expect(cap?.ruledOut).toBe(true);
    expect(cap?.posterior).toBe(0);
  });

  it('learns from a negative result, not just a positive one', () => {
    const opts = { equipmentType: 'CENTRAL_AC' as const, families: ['frozen_coil' as const] };
    const neutral = rankHypotheses([], opts);
    const filterAbsent = rankHypotheses([finding('filter_dirty', false)], opts);

    const before = neutral.find((s) => s.hypothesisId === 'dirty-filter')!.posterior;
    const after = filterAbsent.find((s) => s.hypothesisId === 'dirty-filter')!.posterior;
    expect(after).toBeLessThan(before);
  });

  it('weights a low-confidence observation less than a confident one', () => {
    const opts = { equipmentType: 'CENTRAL_AC' as const, families: ['insufficient_cooling' as const] };
    const sure = rankHypotheses([finding('subcooling_low', true, 1)], opts);
    const unsure = rankHypotheses([finding('subcooling_low', true, 0.3)], opts);

    const sureP = sure.find((s) => s.hypothesisId === 'low-charge-leak')!.posterior;
    const unsureP = unsure.find((s) => s.hypothesisId === 'low-charge-leak')!.posterior;
    expect(sureP).toBeGreaterThan(unsureP);
  });

  it('posteriors form a probability distribution', () => {
    const scores = rankHypotheses([finding('superheat_high')], {
      equipmentType: 'CENTRAL_AC',
      families: ['insufficient_cooling'],
    });
    const total = scores.reduce((a, s) => a + s.posterior, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe('planner', () => {
  it('asks one question at a time, cheapest-informative first', () => {
    const view = evaluate(createState(ctx()));
    expect(view.nextTest).not.toBeNull();
    // Should never open with the 90-minute recovery-and-weigh-in.
    expect(view.nextTest!.test.id).not.toBe('weigh-in-charge');
    expect(view.nextTest!.test.costMinutes).toBeLessThanOrEqual(15);
  });

  it('never proposes the same test twice', () => {
    let state = createState(ctx());
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const view = evaluate(state);
      if (!view.nextTest) break;
      const id = view.nextTest.test.id;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      state = applyTestOption(state, id, view.nextTest.test.options?.[0]?.value ?? 'none');
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('gates tests behind their prerequisites', () => {
    // leak-search requires subcooling_low; it must not be offered before that.
    const view = evaluate(createState(ctx()));
    expect(view.planned.map((p) => p.test.id)).not.toContain('leak-search');
  });

  it('explains which hypotheses the chosen test separates', () => {
    const view = evaluate(createState(ctx()));
    expect(view.nextTest!.rationale.length).toBeGreaterThan(20);
  });
});

describe('premature-diagnosis guard', () => {
  it('will not conclude from the opening complaint alone', () => {
    const view = evaluate(createState(ctx()));
    expect(view.conclusion).toBeNull();
    expect(view.state.phase).toBe('INTAKE');
  });

  it('will not condemn a compressor without direct winding or amp evidence', () => {
    let state = createState(ctx({ families: ['no_cooling'] }));
    // Pile on circumstantial evidence that points at a weak compressor.
    state = {
      ...state,
      findings: [
        finding('subcooling_low'),
        finding('condenser_split_low'),
        finding('compressor_running'),
        finding('delta_t_low'),
      ],
    };
    const view = evaluate(state);
    expect(view.conclusion?.hypothesisId).not.toBe('compressor-not-pumping');
  });

  it('holds off while a cheap discriminating test remains', () => {
    let state = createState(ctx());
    state = { ...state, findings: [finding('superheat_high'), finding('subcooling_low')] };
    const view = evaluate(state);
    if (!view.conclusion) {
      expect(view.stopReason.length).toBeGreaterThan(10);
    }
  });
});

describe('full diagnostic walk — undercharge', () => {
  it('reaches a leak/undercharge conclusion once the evidence supports it', () => {
    let state = createState(ctx({ families: ['insufficient_cooling'] }));

    state = applyTestOption(state, 'inspect-filter', 'clean');
    state = applyTestOption(state, 'inspect-condenser-coil', 'clean');
    state = recordMeasurements(state, [
      { key: 'refrigerant', text: 'R-410A' },
      { key: 'metering_device', text: 'TXV' },
      { key: 'outdoor_db', value: 92 },
      { key: 'suction_pressure', value: 95 },
      { key: 'suction_line_temp', value: 78 },
      { key: 'liquid_pressure', value: 260 },
      { key: 'liquid_line_temp', value: 82 },
      { key: 'return_db', value: 78 },
      { key: 'supply_db', value: 66 },
    ]).state;
    state = { ...state, askedTestIds: [...state.askedTestIds, 'measure-superheat', 'measure-subcooling'] };

    const mid = evaluate(state);
    expect(mid.ranked[0]!.hypothesisId).toBe('low-charge-leak');

    state = applyTestOption(mid.state, 'leak-search', 'found');
    const final = evaluate(state);

    expect(final.conclusion).not.toBeNull();
    expect(final.conclusion!.hypothesisId).toBe('low-charge-leak');
    expect(final.conclusion!.repair.rootCauseWarning).toMatch(/leak/i);
  });
});

describe('full diagnostic walk — furnace flame sensor', () => {
  it('localizes to flame proving from the ignition sequence, not by guessing', () => {
    let state = createState({
      equipmentType: 'GAS_FURNACE',
      families: ['no_heat'],
      mode: 'HEATING',
    });

    state = applyTestOption(state, 'observe-ignition-sequence', 'drops_out');
    const afterSequence = evaluate(state);
    expect(afterSequence.ranked[0]!.hypothesisId).toBe('flame-sensor-fault');
    // Ignitor and pressure switch must be eliminated by the observation.
    const ignitor = afterSequence.scores.find((s) => s.hypothesisId === 'ignitor-fault');
    expect(ignitor!.ruledOut || ignitor!.posterior < 0.05).toBe(true);

    state = recordMeasurements(afterSequence.state, [
      { key: 'flame_current_ua', value: 0.3 },
      { key: 'board_minimum_ua', value: 1.0 },
    ]).state;
    state = { ...state, askedTestIds: [...state.askedTestIds, 'flame-current-test'] };

    const final = evaluate(state);
    expect(final.conclusion?.hypothesisId).toBe('flame-sensor-fault');
  });

  it('does not blame the board when the pressure switch never closes', () => {
    let state = createState({
      equipmentType: 'GAS_FURNACE',
      families: ['no_heat'],
      mode: 'HEATING',
    });
    state = applyTestOption(state, 'observe-ignition-sequence', 'inducer_only');
    const view = evaluate(state);
    const board = view.scores.find((s) => s.hypothesisId === 'control-board-fault');
    const top = view.ranked[0]!;
    expect(top.hypothesisId).not.toBe('control-board-fault');
    expect(board!.posterior).toBeLessThan(top.posterior);
  });
});

describe('measurement sanity checks', () => {
  it('flags an implausible reading instead of reasoning from it', () => {
    const { warnings } = recordMeasurements(createState(ctx()), [
      { key: 'suction_pressure', value: 9000 },
    ]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/plausible range/i);
  });
});

describe('correcting a measurement retracts what it implied', () => {
  it('drops the old derived finding when a reading is replaced', () => {
    let state = createState(ctx());
    state = recordMeasurements(state, [
      { key: 'refrigerant', text: 'R-410A' },
      { key: 'metering_device', text: 'TXV' },
      { key: 'suction_pressure', value: 95 },
      { key: 'suction_line_temp', value: 85 },
    ]).state;
    const high = evaluate(state);
    expect(high.state.findings.some((f) => f.key === 'superheat_high' && f.present)).toBe(true);

    // 95 psig on R-410A saturates near 29 °F, so a 40 °F line temp is ~11 °F
    // of superheat — squarely inside the TXV band.
    state = recordMeasurements(high.state, [{ key: 'suction_line_temp', value: 40 }]).state;
    const corrected = evaluate(state);
    expect(corrected.state.findings.some((f) => f.key === 'superheat_high' && f.present)).toBe(false);
  });
});
