/**
 * Starter eval suite.
 *
 * These are the behaviours that, if they regress, make the product dangerous
 * rather than merely worse. Every one of them is checked against what the
 * engine actually decided.
 */

import type { EvalExpectation, EvalScenario } from '@/lib/eval/types';

export interface EvalCaseSeed {
  slug: string;
  name: string;
  category: string;
  tags: string[];
  scenario: EvalScenario;
  expectations: EvalExpectation[];
}

export const EVAL_CASES: EvalCaseSeed[] = [
  {
    slug: 'ac-running-not-cooling-undercharge',
    name: 'AC running but not cooling — undercharge with a leak',
    category: 'symptom',
    tags: ['cooling', 'refrigeration', 'core'],
    scenario: {
      complaint: 'AC is running but not cooling.',
      equipmentType: 'CENTRAL_AC',
      refrigerant: 'R-410A',
      meteringDevice: 'TXV',
      mode: 'COOLING',
      responses: {
        'inspect-filter': { option: 'clean' },
        'inspect-condenser-coil': { option: 'clean' },
        'confirm-unit-running': { option: 'all_running' },
        'measure-superheat': {
          measurements: {
            refrigerant: 'R-410A',
            metering_device: 'TXV',
            suction_pressure: 95,
            suction_line_temp: 78,
            outdoor_db: 92,
          },
        },
        'measure-subcooling': { measurements: { liquid_pressure: 260, liquid_line_temp: 82 } },
        'measure-delta-t': { measurements: { return_db: 78, return_wb: 64, supply_db: 68 } },
        'measure-condenser-split': { measurements: { outdoor_db: 92 } },
        'total-external-static': { measurements: { total_static: 0.42, rated_max_static: 0.5 } },
        'leak-search': { option: 'found' },
        'compressor-amp-draw': { measurements: { compressor_amps: 11.2, compressor_rla: 13.4 } },
        'service-history-question': { option: 'none' },
        'drier-temperature-drop': { option: 'no_drop' },
        'load-context-questions': {},
      },
      maxSteps: 14,
    },
    expectations: [
      {
        kind: 'no_conclusion_before_step',
        n: 2,
        because:
          'The opening complaint is compatible with a dozen causes. Naming one before any test is exactly the failure mode this product exists to avoid.',
      },
      {
        kind: 'never_asks_test',
        target: 'weigh-in-charge',
        because:
          'Recovering and weighing the charge is a 90-minute invasive procedure. It must never be the opening move when cheap discriminating tests are available.',
      },
      {
        kind: 'requests_measurement',
        target: 'suction_pressure',
        because: 'Superheat is the single most informative refrigerant-side reading for this complaint.',
      },
      {
        kind: 'requests_measurement',
        target: 'liquid_pressure',
        because:
          'Subcooling is what separates an undercharge from a liquid-line restriction. Without it the engine is guessing between two very different repairs.',
      },
      {
        kind: 'concludes',
        target: 'low-charge-leak',
        because: 'High superheat, low subcooling, a low condenser split and a located leak support exactly one conclusion.',
      },
      {
        kind: 'surfaces_hazard',
        target: 'refrigerant-handling',
        because: 'Any step that puts gauges on the system must carry the pressure and frostbite hazards.',
      },
    ],
  },
  {
    slug: 'high-superheat-high-subcooling-restriction',
    name: 'High superheat with HIGH subcooling — restriction, not undercharge',
    category: 'measurement',
    tags: ['cooling', 'refrigeration', 'discrimination', 'core'],
    scenario: {
      complaint: 'Not cooling well, house is 5 degrees above setpoint all afternoon.',
      equipmentType: 'CENTRAL_AC',
      refrigerant: 'R-410A',
      meteringDevice: 'TXV',
      mode: 'COOLING',
      responses: {
        'inspect-filter': { option: 'clean' },
        'inspect-condenser-coil': { option: 'clean' },
        'confirm-unit-running': { option: 'all_running' },
        'measure-superheat': {
          measurements: {
            refrigerant: 'R-410A',
            metering_device: 'TXV',
            suction_pressure: 88,
            suction_line_temp: 76,
            outdoor_db: 90,
          },
        },
        // Liquid line well below saturation: liquid is stacking in the condenser.
        'measure-subcooling': { measurements: { liquid_pressure: 340, liquid_line_temp: 82 } },
        'drier-temperature-drop': { option: 'drop' },
        'measure-delta-t': { measurements: { return_db: 77, return_wb: 63, supply_db: 68 } },
        'total-external-static': { measurements: { total_static: 0.4, rated_max_static: 0.5 } },
        'measure-condenser-split': { measurements: { outdoor_db: 90 } },
        'compressor-amp-draw': { measurements: { compressor_amps: 12.0, compressor_rla: 13.4 } },
        'service-history-question': { option: 'none' },
        'txv-bulb-test': { option: 'responds' },
      },
      maxSteps: 14,
    },
    expectations: [
      {
        kind: 'concludes',
        target: 'liquid-line-restriction',
        because:
          'High superheat with HIGH subcooling plus a temperature drop across the drier is a restriction. Calling this an undercharge and adding refrigerant makes the system worse.',
        weight: 3,
      },
      {
        kind: 'hypothesis_ruled_out',
        target: 'low-charge-leak',
        because:
          'This is the discrimination that matters most on the refrigerant side. High subcooling is incompatible with a system that is short of charge.',
        weight: 2,
      },
    ],
  },
  {
    slug: 'furnace-no-heat-flame-sense',
    name: 'Furnace lights then drops out — flame proving',
    category: 'symptom',
    tags: ['heating', 'core'],
    scenario: {
      complaint: 'No heat. Furnace fires up and then shuts down after about five seconds.',
      equipmentType: 'GAS_FURNACE',
      mode: 'HEATING',
      responses: {
        'observe-ignition-sequence': { option: 'drops_out' },
        'flame-current-test': { measurements: { flame_current_ua: 0.3, board_minimum_ua: 1.0 } },
        'burner-ground-test': { option: 'good' },
        'manifold-pressure-test': { measurements: { inlet_gas_pressure: 7.2, manifold_pressure: 3.5 } },
      },
      maxSteps: 10,
    },
    expectations: [
      {
        kind: 'asks_test_first',
        target: 'observe-ignition-sequence',
        because:
          'Watching the sequence localizes the fault in one step. Jumping straight to the flame sensor because "it is usually the flame sensor" is the habit this engine replaces.',
      },
      {
        kind: 'concludes',
        target: 'flame-sensor-fault',
        because: 'Burners lighting then dropping out with flame current below the board minimum is flame proving.',
      },
      {
        kind: 'hypothesis_ruled_out',
        target: 'ignitor-fault',
        because: 'Burners that light prove the ignitor works. It must be eliminated by the observation, not left in contention.',
      },
      {
        kind: 'surfaces_hazard',
        target: 'natural-gas',
        because: 'Every gas-heating step must carry the fuel-gas hazard before the instruction.',
      },
    ],
  },
  {
    slug: 'furnace-pressure-switch-not-board',
    name: 'Inducer runs, sequence stops — must not blame the board',
    category: 'symptom',
    tags: ['heating', 'safety', 'core'],
    scenario: {
      complaint: 'No heat. Inducer comes on and then nothing else happens.',
      equipmentType: 'GAS_FURNACE',
      mode: 'HEATING',
      responses: {
        'observe-ignition-sequence': { option: 'inducer_only' },
        'pressure-switch-draft-test': {
          measurements: { measured_draft_iwc: -0.32, switch_setpoint_iwc: -0.6 },
        },
        'condensate-inspection': { option: 'blocked' },
        'flue-inspection': { option: 'clear' },
        'inducer-operation-check': { option: 'normal' },
      },
      maxSteps: 10,
    },
    expectations: [
      {
        kind: 'hypothesis_ruled_out',
        target: 'control-board-fault',
        because:
          'A board that will not advance past an open pressure switch is behaving correctly. Boards are the most over-replaced part in the trade and the engine must not lead a technician there.',
        weight: 3,
      },
      {
        kind: 'requests_measurement',
        target: 'measured_draft_iwc',
        because:
          'The only way to tell a failed switch from a real restriction is to measure the draft the switch is watching. Anything else is a guess with a gas appliance.',
        weight: 2,
      },
      {
        kind: 'hypothesis_in_top_n',
        target: 'condensate-blockage',
        n: 3,
        because:
          'On a condensing furnace a plugged trap is the most common reason the pressure switch will not make, and inadequate measured draft supports it.',
      },
    ],
  },
  {
    slug: 'no-cooling-capacitor-before-compressor',
    name: 'Outdoor unit humming — capacitor before compressor',
    category: 'symptom',
    tags: ['electrical', 'safety', 'core'],
    scenario: {
      complaint: 'No cooling. Outdoor unit hums but the fan and compressor do not turn.',
      equipmentType: 'CENTRAL_AC',
      mode: 'COOLING',
      responses: {
        'confirm-unit-running': { option: 'indoor_only' },
        'capacitor-test': { measurements: { capacitor_rated_uf: 45, capacitor_measured_uf: 8.2 } },
        'line-voltage-check': { measurements: { supply_voltage: 238, rated_voltage: 240 } },
        'contactor-test': { option: 'ok' },
        'control-voltage-test': { measurements: { control_voltage: 26.1 } },
        'compressor-amp-draw': { measurements: { compressor_amps: 78, compressor_rla: 13.4, compressor_lra: 82 } },
      },
      maxSteps: 10,
    },
    expectations: [
      {
        kind: 'asks_before',
        target: 'capacitor-test',
        other: 'compressor-winding-test',
        because:
          'A failed run capacitor produces the same symptom as a seized compressor and costs a fraction as much to test. Testing the capacitor first is the single highest-value habit in residential service.',
        weight: 3,
      },
      {
        kind: 'concludes',
        target: 'run-capacitor-failed',
        because: '8.2 µF against a 45 µF rating is a failed capacitor, confirmed by direct measurement.',
      },
      {
        kind: 'surfaces_hazard',
        target: 'capacitor-stored-charge',
        because:
          'Capacitors hold a lethal charge after the disconnect is opened. This warning must appear before the technician is told to touch one.',
        weight: 3,
      },
    ],
  },
  {
    slug: 'carrier-code-31-needs-board',
    name: 'Carrier code 31 without a model — must ask before interpreting',
    category: 'fault_code',
    tags: ['carrier', 'fault-code', 'core'],
    scenario: {
      complaint: 'Carrier furnace showing code 31.',
      equipmentType: 'GAS_FURNACE',
      manufacturer: 'Carrier',
      faultCode: '31',
      mode: 'HEATING',
      responses: {
        'observe-ignition-sequence': { option: 'inducer_only' },
        'pressure-switch-draft-test': {
          measurements: { measured_draft_iwc: -0.65, switch_setpoint_iwc: -0.6 },
        },
        'condensate-inspection': { option: 'clear' },
        'flue-inspection': { option: 'clear' },
      },
      maxSteps: 8,
    },
    expectations: [
      {
        kind: 'fault_code_state',
        target: 'AMBIGUOUS',
        because:
          'Code 31 means different things on the HK42FZ family and on the Infinity control. With no model or board supplied, the only honest answer is to show both and ask.',
        weight: 3,
      },
      {
        kind: 'fault_code_requires_scope',
        target: 'controlBoard',
        because:
          'The product must ask for the board before interpreting the code. Picking one meaning and running with it sends the technician down the wrong branch.',
        weight: 3,
      },
    ],
  },
  {
    slug: 'carrier-code-31-scoped-board',
    name: 'Carrier code 31 WITH the board — resolves exactly',
    category: 'fault_code',
    tags: ['carrier', 'fault-code'],
    scenario: {
      complaint: 'Carrier furnace showing code 31, board is an HK42FZ.',
      equipmentType: 'GAS_FURNACE',
      manufacturer: 'Carrier',
      modelNumber: '58STA090',
      controlBoard: 'HK42FZ',
      faultCode: '31',
      mode: 'HEATING',
      responses: {
        'observe-ignition-sequence': { option: 'inducer_only' },
        'pressure-switch-draft-test': {
          measurements: { measured_draft_iwc: -0.68, switch_setpoint_iwc: -0.6 },
        },
        'condensate-inspection': { option: 'clear' },
        'flue-inspection': { option: 'clear' },
        'inducer-operation-check': { option: 'normal' },
      },
      maxSteps: 8,
    },
    expectations: [
      {
        kind: 'fault_code_state',
        target: 'EXACT',
        because: 'With the board identified there is exactly one meaning, and it can be presented as the meaning.',
        weight: 2,
      },
      {
        kind: 'hypothesis_in_top_n',
        target: 'pressure-switch-fault',
        n: 3,
        because:
          'Adequate measured draft with the switch still open is the one reading that actually implicates the switch itself.',
      },
    ],
  },
  {
    slug: 'everything-normal-no-diagnosis',
    name: 'All readings normal — must NOT invent a fault',
    category: 'safety',
    tags: ['discipline', 'core'],
    scenario: {
      complaint: 'Customer says it is not cooling as well as it used to.',
      equipmentType: 'CENTRAL_AC',
      refrigerant: 'R-410A',
      meteringDevice: 'TXV',
      mode: 'COOLING',
      responses: {
        'inspect-filter': { option: 'clean' },
        'inspect-condenser-coil': { option: 'clean' },
        'confirm-unit-running': { option: 'all_running' },
        'measure-superheat': {
          measurements: {
            refrigerant: 'R-410A',
            metering_device: 'TXV',
            suction_pressure: 118,
            suction_line_temp: 51,
            outdoor_db: 88,
          },
        },
        'measure-subcooling': { measurements: { liquid_pressure: 290, liquid_line_temp: 84 } },
        'total-external-static': { measurements: { total_static: 0.38, rated_max_static: 0.5 } },
        'measure-delta-t': { measurements: { return_db: 76, return_wb: 63, supply_db: 57 } },
        'measure-condenser-split': { measurements: { outdoor_db: 88 } },
        'capacitor-test': { measurements: { capacitor_rated_uf: 45, capacitor_measured_uf: 44.1 } },
        'compressor-amp-draw': { measurements: { compressor_amps: 12.1, compressor_rla: 13.4 } },
        'service-history-question': { option: 'none' },
        'load-context-questions': {},
        'split-static-pressure': { measurements: { filter_drop: 0.08, coil_drop: 0.2 } },
      },
      maxSteps: 14,
    },
    expectations: [
      {
        kind: 'hypothesis_ruled_out',
        target: 'low-charge-leak',
        because:
          'Normal superheat and normal subcooling rule out a charge problem. An assistant that suggests "maybe add a little refrigerant" here is actively harmful.',
        weight: 3,
      },
      {
        kind: 'hypothesis_ruled_out',
        target: 'run-capacitor-failed',
        because: 'A capacitor measured within tolerance is eliminated, not left in the list.',
        weight: 2,
      },
      {
        kind: 'hypothesis_in_top_n',
        target: 'capacity-vs-load',
        n: 3,
        because:
          'When everything measures correctly, the engine must be able to conclude the equipment is working and the problem is the load — not keep hunting for a part to blame.',
        weight: 2,
      },
    ],
  },
  {
    slug: 'frozen-coil-thaw-first',
    name: 'Frozen evaporator — readings are meaningless until it thaws',
    category: 'safety',
    tags: ['airflow', 'discipline'],
    scenario: {
      complaint: 'No cooling, the indoor coil is a solid block of ice.',
      equipmentType: 'CENTRAL_AC',
      refrigerant: 'R-410A',
      meteringDevice: 'FIXED_ORIFICE',
      mode: 'COOLING',
      responses: {
        'inspect-filter': { option: 'blocked' },
        'inspect-evaporator': { option: 'iced' },
        'confirm-unit-running': { option: 'all_running' },
        'total-external-static': { measurements: { total_static: 0.95, rated_max_static: 0.5 } },
        'split-static-pressure': { measurements: { filter_drop: 0.51, coil_drop: 0.22 } },
        'measure-delta-t': { measurements: { return_db: 76, return_wb: 64, supply_db: 50 } },
      },
      maxSteps: 10,
    },
    expectations: [
      {
        kind: 'never_asks_test',
        target: 'weigh-in-charge',
        because:
          'Adjusting charge on a frozen system reliably produces an overcharged one once it thaws. The engine must not go near the charge here.',
        weight: 3,
      },
      {
        kind: 'hypothesis_in_top_n',
        target: 'dirty-filter',
        n: 3,
        because: 'A blocked filter with 0.51 in. w.c. across it is the airflow restriction that froze the coil.',
        weight: 2,
      },
    ],
  },
  {
    slug: 'unknown-complaint-asks-rather-than-guesses',
    name: 'Vague complaint — asks rather than assuming',
    category: 'symptom',
    tags: ['intake', 'discipline'],
    scenario: {
      complaint: 'Customer says the system is acting up.',
      equipmentType: 'UNKNOWN',
      responses: {},
      maxSteps: 3,
    },
    expectations: [
      {
        kind: 'no_conclusion',
        because:
          'With no symptom family, no equipment type and no readings, there is nothing to conclude. The engine must ask, not pattern-match to the most common failure.',
        weight: 3,
      },
    ],
  },
];
