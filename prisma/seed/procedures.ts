/**
 * Long-form diagnostic procedures.
 *
 * The engine's tests carry a one-paragraph instruction, which is what a
 * technician wants mid-diagnosis. These are the full write-ups behind them,
 * linked by `procedureSlug`, for when someone wants the whole method.
 */

export interface ProcedureSeed {
  slug: string;
  title: string;
  category: string;
  equipmentTypes: string[];
  summary: string;
  steps: Array<{ n: number; instruction: string; expected: string; tools: string[]; caution?: string }>;
  toolsNeeded: string[];
  safetyIds: string[];
  estMinutes: number;
}

export const PROCEDURES: ProcedureSeed[] = [
  {
    slug: 'measure-superheat',
    title: 'Measure superheat',
    category: 'refrigeration',
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'PACKAGE_UNIT', 'MINI_SPLIT', 'REFRIGERATION'],
    summary:
      'Superheat is how many degrees the suction vapour has been heated above its saturation temperature. It tells you whether the evaporator is being fed correctly, and on a fixed-orifice system it is the charging metric.',
    steps: [
      {
        n: 1,
        instruction:
          'Run the system in the failing mode for at least 15 minutes so it reaches steady state. Readings taken during the first few minutes mean nothing.',
        expected: 'Pressures stop moving.',
        tools: ['Manifold gauges'],
      },
      {
        n: 2,
        instruction:
          'Connect to the suction service port. Record the suction pressure, or read the saturation temperature directly off a digital manifold — that is preferred, it avoids a chart conversion.',
        expected: 'A stable suction pressure.',
        tools: ['Manifold gauges'],
        caution: 'Confirm hoses and manifold are rated for this refrigerant. R-410A, R-32 and R-454B run far higher than R-22.',
      },
      {
        n: 3,
        instruction:
          'Clamp a temperature probe to a clean section of the suction line within about 6 inches of the service valve, and insulate it from ambient air.',
        expected: 'A stable line temperature.',
        tools: ['Clamp thermometer', 'Insulation'],
      },
      {
        n: 4,
        instruction:
          'Superheat is the line temperature minus the saturation temperature. On a zeotropic blend, use the DEW point for the saturation temperature.',
        expected:
          'On a TXV/EEV, roughly 8-14 °F. On a fixed orifice, whatever the charge chart gives for the current indoor wet bulb and outdoor dry bulb.',
        tools: [],
      },
    ],
    toolsNeeded: ['Manifold gauges', 'Clamp thermometer', 'P/T chart or digital manifold'],
    safetyIds: ['refrigerant-handling', 'frostbite', 'high-pressure-system', 'epa-608'],
    estMinutes: 15,
  },
  {
    slug: 'total-external-static',
    title: 'Measure total external static pressure',
    category: 'airflow',
    equipmentTypes: [],
    summary:
      'The only field measurement that shows whether the duct system is within what the blower was designed for. Without it, "low airflow" is an assumption.',
    steps: [
      {
        n: 1,
        instruction:
          'Drill or use existing test ports: one on the return side between the filter and the blower, one on the supply side downstream of the blower and the indoor coil.',
        expected: 'Two ports in the airstream, clear of the coil face.',
        tools: ['Drill', 'Test port plugs'],
        caution: 'Lock out the disconnect before drilling anywhere near a blower compartment.',
      },
      {
        n: 2,
        instruction:
          'With the blower running at the speed used for the failing mode, read each port with a manometer.',
        expected: 'Return reads negative, supply reads positive.',
        tools: ['Digital manometer'],
      },
      {
        n: 3,
        instruction: 'Add the magnitudes of the two readings. That is total external static pressure.',
        expected: 'At or below the maximum on this unit\'s blower table — commonly 0.5 in. w.c.',
        tools: [],
      },
      {
        n: 4,
        instruction:
          'If it is over, split it: read the drop across the filter alone and across the coil alone. Whichever is disproportionate is the restriction. If neither accounts for it, the ductwork does.',
        expected:
          'A clean 1-inch filter drops under about 0.1 in. w.c.; a clean A-coil roughly 0.15-0.30 in. w.c. at rated airflow.',
        tools: ['Digital manometer'],
      },
    ],
    toolsNeeded: ['Digital manometer', 'Static pressure probes', 'Drill'],
    safetyIds: ['moving-parts', 'electrical-shock'],
    estMinutes: 20,
  },
  {
    slug: 'flame-current-test',
    title: 'Measure flame rectification current',
    category: 'heating',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    summary:
      'Flame proving works by rectification: the flame conducts current in one direction between the sensor and ground. Measuring the microamps is what separates a dirty sensor from a bad board, and it is the difference between a five-dollar fix and a needless board replacement.',
    steps: [
      {
        n: 1,
        instruction:
          'Set a meter to DC microamps and put it in SERIES with the flame sensor lead — disconnect the lead and bridge the gap with the meter.',
        expected: 'The meter is in the sense circuit, not across it.',
        tools: ['Multimeter with µA range'],
        caution: 'The burner compartment is hot and gas is flowing. Keep your face clear of the burner box.',
      },
      {
        n: 2,
        instruction: 'Start a call for heat and read the current once the burners light.',
        expected:
          'At or above the minimum in this board\'s literature — commonly around 0.5-1.0 µA minimum with 2-6 µA usual, but the actual figure is board specific.',
        tools: ['Multimeter with µA range'],
      },
      {
        n: 3,
        instruction:
          'If it is low, clean the sensor with a non-abrasive pad. Never sandpaper or emery cloth — they leave a residue that insulates the rod.',
        expected: 'Current comes up above the board minimum.',
        tools: ['Non-abrasive pad'],
      },
      {
        n: 4,
        instruction:
          'If a clean sensor sitting properly in the flame still reads low, check the ground path: resistance from the burner assembly to the board common, and the neutral/ground bond at the furnace.',
        expected: 'Near-zero resistance from the burner assembly to the board common.',
        tools: ['Multimeter'],
      },
    ],
    toolsNeeded: ['Multimeter with µA range', 'Non-abrasive pad'],
    safetyIds: ['natural-gas', 'combustion', 'hot-surfaces', 'electrical-shock'],
    estMinutes: 15,
  },
  {
    slug: 'capacitor-test',
    title: 'Test a run capacitor',
    category: 'electrical',
    equipmentTypes: [],
    summary:
      'The single highest-value five-minute test in residential service. A failed run capacitor produces the same symptoms as a seized compressor and costs a fraction as much.',
    steps: [
      {
        n: 1,
        instruction: 'Open and lock out the disconnect. Verify the circuit is dead with a meter you have just proved on a known live source.',
        expected: 'No voltage at the contactor line terminals.',
        tools: ['Multimeter'],
        caution: 'Turning the power off is not enough — the capacitor is still charged.',
      },
      {
        n: 2,
        instruction:
          'Discharge the capacitor through a suitable resistor across its terminals. Do not short it with a screwdriver; that pits the terminals and can throw molten metal.',
        expected: '0 V across every terminal pair.',
        tools: ['Discharge resistor', 'Multimeter'],
        caution: 'A run capacitor holds enough energy to kill after the disconnect is open.',
      },
      {
        n: 3,
        instruction: 'Disconnect at least one lead and measure capacitance on each side of a dual round.',
        expected: 'Within the tolerance printed on the can, usually ±6% of rated µF.',
        tools: ['Capacitance meter'],
      },
      {
        n: 4,
        instruction:
          'Inspect for bulging, venting or oil residue. A physically damaged capacitor is a replacement regardless of what it measures.',
        expected: 'A flat top and a dry can.',
        tools: [],
      },
    ],
    toolsNeeded: ['Multimeter with capacitance range', 'Discharge resistor'],
    safetyIds: ['electrical-shock', 'capacitor-stored-charge'],
    estMinutes: 10,
  },
  {
    slug: 'pressure-switch-draft-test',
    title: 'Measure draft at the pressure switch',
    category: 'heating',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    summary:
      'Separates a failed pressure switch from a real venting restriction. Most "bad pressure switch" calls are blocked flues, plugged condensate traps or weak inducers — and the switch is doing exactly what it was fitted to do.',
    steps: [
      {
        n: 1,
        instruction: 'Read the setpoint printed on the switch body. It is a negative pressure, in inches of water column.',
        expected: 'A stated setpoint, e.g. -0.60 in. w.c.',
        tools: [],
      },
      {
        n: 2,
        instruction: 'Tee a manometer into the pressure switch hose so you measure what the switch sees.',
        expected: 'The manometer is in the sense line, not the flue.',
        tools: ['Digital manometer', 'Tee fitting'],
      },
      {
        n: 3,
        instruction: 'Start a call for heat and read the negative pressure once the inducer is at speed.',
        expected: 'Measured draft meets or exceeds the switch setpoint.',
        tools: ['Digital manometer'],
        caution:
          'Never jumper the pressure switch to run the furnace. It is the only device proving the flue is clear, and defeating it can vent combustion products into occupied space.',
      },
      {
        n: 4,
        instruction:
          'Draft adequate and the switch not closing means the switch has failed. Draft inadequate means the restriction is real — inspect the vent and intake, the condensate trap and drain ports, the inducer wheel and the housing for cracks.',
        expected: 'A clear cause, not a guess.',
        tools: [],
      },
    ],
    toolsNeeded: ['Digital manometer', 'Tee fitting'],
    safetyIds: ['co-exposure', 'natural-gas', 'electrical-shock'],
    estMinutes: 15,
  },
];
