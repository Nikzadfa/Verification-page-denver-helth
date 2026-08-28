/**
 * Measurement catalogue.
 *
 * One definition per reading, used by three consumers that must agree:
 *  - the structured entry forms in the UI
 *  - the voice/free-text parser (these keys are what the extractor targets)
 *  - the derivation layer that turns readings into findings
 *
 * Range checks are sanity bounds, not specifications. A value outside the
 * range is flagged back to the technician as "that looks like a typo" rather
 * than being silently accepted and reasoned over.
 */

export type MeasurementGroup =
  | 'temperature'
  | 'refrigeration'
  | 'electrical'
  | 'airflow'
  | 'combustion'
  | 'context';

export interface MeasurementDef {
  key: string;
  label: string;
  group: MeasurementGroup;
  unit: string | null;
  kind: 'number' | 'text' | 'choice';
  choices?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  /** Shown under the input. Keep it to what a tech needs at the unit. */
  hint?: string;
  /** Aliases the voice/text extractor should map onto this key. */
  aliases: string[];
}

export const MEASUREMENTS: MeasurementDef[] = [
  // --- Temperature ---------------------------------------------------------
  {
    key: 'outdoor_db',
    label: 'Outdoor dry bulb',
    group: 'temperature',
    unit: '°F',
    kind: 'number',
    min: -40,
    max: 140,
    step: 1,
    hint: 'In the shade at the condenser intake — not in the sun and not in the discharge air.',
    aliases: ['outdoor temp', 'outdoor temperature', 'ambient', 'outside temp', 'oat', 'odb'],
  },
  {
    key: 'return_db',
    label: 'Return air dry bulb',
    group: 'temperature',
    unit: '°F',
    kind: 'number',
    min: 30,
    max: 120,
    step: 0.1,
    hint: 'In the return plenum, ahead of any bypass duct.',
    aliases: ['return temp', 'return air', 'return', 'ret db', 'rat'],
  },
  {
    key: 'return_wb',
    label: 'Return air wet bulb',
    group: 'temperature',
    unit: '°F',
    kind: 'number',
    min: 30,
    max: 100,
    step: 0.1,
    hint: 'Needed for a fixed-orifice target superheat and for a meaningful ΔT target.',
    aliases: ['return wet bulb', 'wet bulb', 'indoor wet bulb', 'iwb', 'wb'],
  },
  {
    key: 'return_rh',
    label: 'Return air relative humidity',
    group: 'temperature',
    unit: '%',
    kind: 'number',
    min: 0,
    max: 100,
    step: 1,
    hint: 'An alternative to wet bulb — the engine will compute wet bulb from dry bulb and RH.',
    aliases: ['indoor humidity', 'return humidity', 'rh', 'relative humidity'],
  },
  {
    key: 'supply_db',
    label: 'Supply air dry bulb',
    group: 'temperature',
    unit: '°F',
    kind: 'number',
    min: 20,
    max: 200,
    step: 0.1,
    hint: 'In the supply plenum, out of the line of sight of the coil or heat exchanger.',
    aliases: ['supply temp', 'supply air', 'supply', 'sat', 'discharge air'],
  },

  // --- Refrigeration -------------------------------------------------------
  {
    key: 'refrigerant',
    label: 'Refrigerant',
    group: 'refrigeration',
    unit: null,
    kind: 'choice',
    choices: [
      { value: 'R-22', label: 'R-22' },
      { value: 'R-410A', label: 'R-410A' },
      { value: 'R-32', label: 'R-32 (A2L)' },
      { value: 'R-454B', label: 'R-454B (A2L)' },
      { value: 'R-134a', label: 'R-134a' },
      { value: 'R-404A', label: 'R-404A' },
      { value: 'R-407C', label: 'R-407C' },
      { value: 'R-448A', label: 'R-448A' },
      { value: 'R-449A', label: 'R-449A' },
    ],
    hint: 'Read it off the nameplate. Never assume from the equipment age.',
    aliases: ['refrigerant', 'gas', '410', '410a', '22', '454b', 'r32'],
  },
  {
    key: 'metering_device',
    label: 'Metering device',
    group: 'refrigeration',
    unit: null,
    kind: 'choice',
    choices: [
      { value: 'TXV', label: 'TXV (thermostatic expansion valve)' },
      { value: 'EEV', label: 'EEV (electronic expansion valve)' },
      { value: 'FIXED_ORIFICE', label: 'Fixed orifice / piston' },
      { value: 'CAPILLARY', label: 'Capillary tube' },
      { value: 'UNKNOWN', label: 'Not identified yet' },
    ],
    hint: 'Determines whether the system is charged by superheat or by subcooling. Superheat cannot be judged without it.',
    aliases: ['metering device', 'txv', 'piston', 'orifice', 'eev', 'cap tube'],
  },
  {
    key: 'suction_pressure',
    label: 'Suction pressure',
    group: 'refrigeration',
    unit: 'psig',
    kind: 'number',
    min: -15,
    max: 400,
    step: 0.1,
    hint: 'At the suction service port, after at least 15 minutes of steady-state run time.',
    aliases: ['suction', 'suction pressure', 'low side', 'low side pressure', 'suction psi'],
  },
  {
    key: 'suction_sat_temp',
    label: 'Suction saturation temperature',
    group: 'refrigeration',
    unit: '°F',
    kind: 'number',
    min: -40,
    max: 90,
    step: 0.1,
    hint: 'If your manifold reads saturation directly, enter it here — it is preferred over converting a pressure.',
    aliases: ['suction saturation', 'evap sat', 'saturated suction', 'sst'],
  },
  {
    key: 'suction_line_temp',
    label: 'Suction line temperature',
    group: 'refrigeration',
    unit: '°F',
    kind: 'number',
    min: -40,
    max: 150,
    step: 0.1,
    hint: 'Clean, insulated section within about 6 inches of the suction service valve.',
    aliases: ['suction line', 'suction line temp', 'suction temp'],
  },
  {
    key: 'liquid_pressure',
    label: 'Liquid (head) pressure',
    group: 'refrigeration',
    unit: 'psig',
    kind: 'number',
    min: 0,
    max: 800,
    step: 0.1,
    hint: 'At the liquid service port.',
    aliases: ['liquid', 'head', 'head pressure', 'high side', 'discharge pressure', 'liquid psi'],
  },
  {
    key: 'liquid_sat_temp',
    label: 'Liquid saturation temperature',
    group: 'refrigeration',
    unit: '°F',
    kind: 'number',
    min: 0,
    max: 180,
    step: 0.1,
    hint: 'From the manifold if it displays it. On a blend this is the bubble point.',
    aliases: ['liquid saturation', 'condensing temp', 'sct', 'saturated condensing'],
  },
  {
    key: 'liquid_line_temp',
    label: 'Liquid line temperature',
    group: 'refrigeration',
    unit: '°F',
    kind: 'number',
    min: 0,
    max: 200,
    step: 0.1,
    hint: 'At the liquid service valve.',
    aliases: ['liquid line', 'liquid line temp'],
  },
  {
    key: 'discharge_temp',
    label: 'Discharge line temperature',
    group: 'refrigeration',
    unit: '°F',
    kind: 'number',
    min: 50,
    max: 350,
    step: 1,
    hint: 'About 6 inches from the compressor discharge.',
    aliases: ['discharge temp', 'discharge line', 'compressor discharge'],
  },
  {
    key: 'target_subcooling',
    label: 'Target subcooling (from nameplate)',
    group: 'refrigeration',
    unit: '°F',
    kind: 'number',
    min: 0,
    max: 30,
    step: 0.5,
    hint: 'Read it off the unit label or charging chart. Manufacturer specific.',
    aliases: ['target subcool', 'nameplate subcooling', 'required subcooling'],
  },

  // --- Electrical ----------------------------------------------------------
  {
    key: 'supply_voltage',
    label: 'Supply voltage',
    group: 'electrical',
    unit: 'V',
    kind: 'number',
    min: 0,
    max: 600,
    step: 1,
    hint: 'Measured under load at the equipment.',
    aliases: ['line voltage', 'supply voltage', 'incoming voltage', 'volts'],
  },
  {
    key: 'rated_voltage',
    label: 'Rated voltage (nameplate)',
    group: 'electrical',
    unit: 'V',
    kind: 'number',
    min: 0,
    max: 600,
    step: 1,
    aliases: ['nameplate voltage', 'rated voltage'],
  },
  {
    key: 'control_voltage',
    label: '24 V control voltage',
    group: 'electrical',
    unit: 'V',
    kind: 'number',
    min: 0,
    max: 40,
    step: 0.1,
    hint: 'Across the transformer secondary, R to C, with the call energized.',
    aliases: ['control voltage', '24 volt', '24v', 'secondary voltage'],
  },
  {
    key: 'capacitor_rated_uf',
    label: 'Capacitor rating',
    group: 'electrical',
    unit: 'µF',
    kind: 'number',
    min: 0,
    max: 200,
    step: 0.5,
    hint: 'Printed on the can.',
    aliases: ['rated capacitance', 'cap rating', 'microfarad rating'],
  },
  {
    key: 'capacitor_measured_uf',
    label: 'Capacitor measured',
    group: 'electrical',
    unit: 'µF',
    kind: 'number',
    min: 0,
    max: 200,
    step: 0.1,
    hint: 'Discharge it first. Measure with at least one lead disconnected.',
    aliases: ['measured capacitance', 'cap reading', 'actual microfarads'],
  },
  {
    key: 'compressor_amps',
    label: 'Compressor amp draw',
    group: 'electrical',
    unit: 'A',
    kind: 'number',
    min: 0,
    max: 300,
    step: 0.1,
    aliases: ['compressor amps', 'comp amps', 'amp draw', 'running amps'],
  },
  {
    key: 'compressor_rla',
    label: 'Compressor RLA (nameplate)',
    group: 'electrical',
    unit: 'A',
    kind: 'number',
    min: 0,
    max: 300,
    step: 0.1,
    aliases: ['rla', 'rated load amps'],
  },
  {
    key: 'compressor_lra',
    label: 'Compressor LRA (nameplate)',
    group: 'electrical',
    unit: 'A',
    kind: 'number',
    min: 0,
    max: 900,
    step: 1,
    aliases: ['lra', 'locked rotor amps'],
  },

  // --- Airflow -------------------------------------------------------------
  {
    key: 'return_static',
    label: 'Return static pressure',
    group: 'airflow',
    unit: 'in. w.c.',
    kind: 'number',
    min: -2,
    max: 2,
    step: 0.01,
    hint: 'Between the filter and the blower. Normally negative.',
    aliases: ['return static', 'negative static'],
  },
  {
    key: 'supply_static',
    label: 'Supply static pressure',
    group: 'airflow',
    unit: 'in. w.c.',
    kind: 'number',
    min: -2,
    max: 2,
    step: 0.01,
    hint: 'Downstream of the blower and the indoor coil.',
    aliases: ['supply static', 'positive static'],
  },
  {
    key: 'total_static',
    label: 'Total external static',
    group: 'airflow',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 3,
    step: 0.01,
    hint: 'The sum of the return and supply magnitudes.',
    aliases: ['total static', 'tesp', 'external static'],
  },
  {
    key: 'rated_max_static',
    label: 'Rated maximum external static',
    group: 'airflow',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 3,
    step: 0.01,
    hint: 'From the blower table for this specific unit — often 0.5, but check.',
    aliases: ['rated static', 'max static'],
  },
  {
    key: 'filter_drop',
    label: 'Pressure drop across the filter',
    group: 'airflow',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 2,
    step: 0.01,
    aliases: ['filter drop', 'filter pressure drop'],
  },
  {
    key: 'coil_drop',
    label: 'Pressure drop across the coil',
    group: 'airflow',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 2,
    step: 0.01,
    aliases: ['coil drop', 'coil pressure drop'],
  },
  {
    key: 'filter_condition',
    label: 'Filter condition',
    group: 'airflow',
    unit: null,
    kind: 'choice',
    choices: [
      { value: 'CLEAN', label: 'Clean' },
      { value: 'DIRTY', label: 'Loaded' },
      { value: 'BLOCKED', label: 'Blocked / collapsed' },
    ],
    aliases: ['filter condition', 'filter'],
  },
  {
    key: 'evaporator_condition',
    label: 'Evaporator coil condition',
    group: 'airflow',
    unit: null,
    kind: 'choice',
    choices: [
      { value: 'CLEAN', label: 'Clean' },
      { value: 'DIRTY', label: 'Dirty' },
      { value: 'ICED', label: 'Iced' },
    ],
    aliases: ['evaporator condition', 'indoor coil', 'evap coil'],
  },
  {
    key: 'condenser_coil_condition',
    label: 'Condenser coil condition',
    group: 'airflow',
    unit: null,
    kind: 'choice',
    choices: [
      { value: 'CLEAN', label: 'Clean' },
      { value: 'DIRTY', label: 'Dirty' },
      { value: 'OBSTRUCTED', label: 'Blocked airflow around the unit' },
    ],
    aliases: ['condenser condition', 'outdoor coil'],
  },

  // --- Combustion ----------------------------------------------------------
  {
    key: 'flame_current_ua',
    label: 'Flame rectification current',
    group: 'combustion',
    unit: 'µA',
    kind: 'number',
    min: 0,
    max: 30,
    step: 0.1,
    hint: 'Meter in series with the flame sensor lead, set to DC microamps.',
    aliases: ['flame current', 'microamps', 'ua', 'flame signal'],
  },
  {
    key: 'board_minimum_ua',
    label: 'Board minimum flame current',
    group: 'combustion',
    unit: 'µA',
    kind: 'number',
    min: 0,
    max: 10,
    step: 0.1,
    hint: 'From this control board\'s literature. Board specific — do not assume.',
    aliases: ['minimum microamps', 'board minimum'],
  },
  {
    key: 'measured_draft_iwc',
    label: 'Measured draft at the pressure switch',
    group: 'combustion',
    unit: 'in. w.c.',
    kind: 'number',
    min: -5,
    max: 1,
    step: 0.01,
    hint: 'Negative pressure, measured at the switch hose with the inducer running.',
    aliases: ['draft', 'negative pressure', 'inducer pressure'],
  },
  {
    key: 'switch_setpoint_iwc',
    label: 'Pressure switch setpoint',
    group: 'combustion',
    unit: 'in. w.c.',
    kind: 'number',
    min: -5,
    max: 1,
    step: 0.01,
    hint: 'Printed on the switch body.',
    aliases: ['switch setpoint', 'pressure switch rating'],
  },
  {
    key: 'inlet_gas_pressure',
    label: 'Inlet gas pressure',
    group: 'combustion',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 30,
    step: 0.1,
    hint: 'With every gas appliance in the building firing.',
    aliases: ['inlet pressure', 'supply gas pressure', 'gas pressure'],
  },
  {
    key: 'manifold_pressure',
    label: 'Manifold gas pressure',
    group: 'combustion',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 20,
    step: 0.1,
    aliases: ['manifold pressure', 'outlet pressure'],
  },
  {
    key: 'rated_manifold_pressure',
    label: 'Rated manifold pressure (rating plate)',
    group: 'combustion',
    unit: 'in. w.c.',
    kind: 'number',
    min: 0,
    max: 20,
    step: 0.1,
    aliases: ['rated manifold'],
  },
  {
    key: 'rated_rise_min',
    label: 'Rated temperature rise — minimum',
    group: 'combustion',
    unit: '°F',
    kind: 'number',
    min: 0,
    max: 120,
    step: 1,
    aliases: ['rise min', 'minimum rise'],
  },
  {
    key: 'rated_rise_max',
    label: 'Rated temperature rise — maximum',
    group: 'combustion',
    unit: '°F',
    kind: 'number',
    min: 0,
    max: 150,
    step: 1,
    aliases: ['rise max', 'maximum rise'],
  },

  // --- Context -------------------------------------------------------------
  {
    key: 'nominal_tons',
    label: 'Nominal capacity',
    group: 'context',
    unit: 'tons',
    kind: 'number',
    min: 0.5,
    max: 100,
    step: 0.5,
    aliases: ['tonnage', 'tons', 'capacity'],
  },
  {
    key: 'altitude_ft',
    label: 'Site altitude',
    group: 'context',
    unit: 'ft',
    kind: 'number',
    min: 0,
    max: 14000,
    step: 100,
    hint: 'Above about 2,000 ft, gas input must be derated and the air-side constants change.',
    aliases: ['altitude', 'elevation'],
  },
];

export const MEASUREMENT_MAP: Record<string, MeasurementDef> = Object.fromEntries(
  MEASUREMENTS.map((m) => [m.key, m]),
);

export function measurementsForGroup(group: MeasurementGroup): MeasurementDef[] {
  return MEASUREMENTS.filter((m) => m.group === group);
}

export function measurementLabel(key: string): string {
  return MEASUREMENT_MAP[key]?.label ?? key;
}

export interface RangeIssue {
  key: string;
  value: number;
  message: string;
}

/** Sanity check, not a specification check. Catches typos before inference. */
export function checkRange(key: string, value: number): RangeIssue | null {
  const def = MEASUREMENT_MAP[key];
  if (!def || def.kind !== 'number') return null;
  if (def.min !== undefined && value < def.min) {
    return { key, value, message: `${def.label} of ${value}${def.unit ?? ''} is below the plausible range (${def.min}). Check the entry before I reason from it.` };
  }
  if (def.max !== undefined && value > def.max) {
    return { key, value, message: `${def.label} of ${value}${def.unit ?? ''} is above the plausible range (${def.max}). Check the entry before I reason from it.` };
  }
  return null;
}
