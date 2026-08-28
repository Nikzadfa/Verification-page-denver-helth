/**
 * Safety hazard catalogue.
 *
 * Every test the engine proposes carries hazard ids. The UI renders the hazard
 * banner ABOVE the instruction, and the AI narration layer is required to
 * repeat any CRITICAL hazard in its own words before giving the step.
 *
 * Two rules are enforced in code, not left to the model:
 *  - `neverBypass` hazards produce a hard refusal if a request would defeat
 *    the control (see assertNoBypass below).
 *  - A test whose hazard list includes a LETHAL hazard cannot be marked
 *    "auto-run" or collapsed by the UI.
 */

export type HazardLevel = 'LETHAL' | 'SERIOUS' | 'CAUTION';

export interface Hazard {
  id: string;
  level: HazardLevel;
  title: string;
  /** Shown in the banner. Written to be read on a phone in a mechanical room. */
  warning: string;
  /** Concrete actions, not platitudes. */
  precautions: string[];
  /** Controls that must never be defeated as a repair. */
  neverBypass?: string[];
}

export const HAZARDS: Record<string, Hazard> = {
  'electrical-shock': {
    id: 'electrical-shock',
    level: 'LETHAL',
    title: 'Line-voltage shock hazard',
    warning:
      'Line voltage is present at the disconnect, contactor and board even when the equipment is not running. Contact across 240 V can be fatal.',
    precautions: [
      'Open and lock/tag the disconnect before touching anything you are not deliberately measuring live.',
      'Verify the circuit is dead with a meter you have just proved on a known live source.',
      'When a measurement must be taken live, keep one hand out of the cabinet and use insulated tools and rated PPE.',
      'Never stand in water or on wet ground while working in a live cabinet.',
    ],
  },
  'capacitor-stored-charge': {
    id: 'capacitor-stored-charge',
    level: 'LETHAL',
    title: 'Capacitors hold a lethal charge after power is off',
    warning:
      'A run or start capacitor stores enough energy to kill after the disconnect is open. Turning the power off is not enough.',
    precautions: [
      'Discharge the capacitor through a suitable resistor across the terminals — not by shorting it with a screwdriver, which pits the terminals and can throw molten metal.',
      'Verify 0 V across every terminal pair with a meter before handling.',
      'Treat a bulged or vented capacitor as still charged.',
    ],
  },
  'arc-flash': {
    id: 'arc-flash',
    level: 'LETHAL',
    title: 'Arc flash hazard',
    warning:
      'Switching or probing inside energized commercial gear can produce an arc flash — a blast of plasma, pressure and molten metal.',
    precautions: [
      'Follow your employer\'s electrical safety program and the applicable arc-flash boundary and PPE requirements for the equipment.',
      'De-energize before working whenever the work can be done de-energized.',
      'Do not open covers on energized switchgear without the required PPE and training.',
    ],
  },
  'natural-gas': {
    id: 'natural-gas',
    level: 'LETHAL',
    title: 'Fuel gas — fire and explosion hazard',
    warning:
      'Escaping natural gas or propane can ignite from any spark, including a light switch or a phone.',
    precautions: [
      'If you smell gas: do not operate any electrical switch, leave the building, and call the gas utility from outside.',
      'Leak-test every joint you break, with a leak detector or approved solution — never a flame.',
      'Propane is heavier than air and pools in low spots and crawl spaces.',
    ],
    neverBypass: [
      'Gas valve safety circuits',
      'Rollout switches',
      'Flame proving (flame sensor / flame rod) circuits',
    ],
  },
  combustion: {
    id: 'combustion',
    level: 'SERIOUS',
    title: 'Combustion hazard',
    warning:
      'An appliance that is firing incorrectly can produce carbon monoxide, flame rollout, or delayed ignition strong enough to damage the heat exchanger.',
    precautions: [
      'Watch the ignition sequence from a safe position, not with your face at the burner compartment.',
      'Stop immediately on flame rollout, delayed ignition, or flames leaving the burner box.',
      'Verify the venting is intact and unobstructed before running the appliance.',
    ],
  },
  'co-exposure': {
    id: 'co-exposure',
    level: 'LETHAL',
    title: 'Carbon monoxide',
    warning:
      'Carbon monoxide is colourless and odourless. A cracked heat exchanger, a blocked flue or an overfired burner can put lethal concentrations into occupied space.',
    precautions: [
      'Wear a personal CO monitor whenever you work on combustion equipment.',
      'If ambient CO is elevated, get the occupants out and ventilate before continuing.',
      'A furnace you believe is producing CO into the occupied space must be shut off and tagged, and the occupants told — not left running until the part arrives.',
    ],
    neverBypass: ['Flue/vent pressure switches', 'Blocked-vent safety switches', 'Rollout switches'],
  },
  'refrigerant-handling': {
    id: 'refrigerant-handling',
    level: 'SERIOUS',
    title: 'Refrigerant under pressure',
    warning:
      'Refrigerant systems hold high pressure. A hose or fitting failure can whip a line or spray liquid refrigerant.',
    precautions: [
      'Wear safety glasses and gloves whenever gauges are connected.',
      'Confirm hoses and the manifold are rated for this refrigerant\'s working pressure.',
      'Never vent refrigerant to atmosphere. Recover it.',
      'Never introduce oxygen or compressed air into a refrigerant system, and never pressurize with nitrogen without a regulator and relief.',
    ],
  },
  frostbite: {
    id: 'frostbite',
    level: 'SERIOUS',
    title: 'Liquid refrigerant causes frostbite',
    warning: 'Liquid refrigerant flashing on skin or in the eyes causes immediate freeze burns.',
    precautions: [
      'Safety glasses and gloves any time you break into the refrigerant circuit.',
      'Crack fittings slowly and stand clear of the escape path.',
    ],
  },
  'a2l-flammable': {
    id: 'a2l-flammable',
    level: 'SERIOUS',
    title: 'A2L mildly flammable refrigerant',
    warning:
      'R-32 and R-454B are A2L refrigerants. They burn under the right concentration and ignition conditions.',
    precautions: [
      'Follow the equipment manufacturer\'s A2L service procedure — it is not the same as an R-410A procedure.',
      'Use A2L-rated recovery machines, vacuum pumps and leak detectors.',
      'Eliminate ignition sources and ventilate the space before opening the system.',
      'Brazing on an A2L system requires purging with nitrogen and confirming the system is refrigerant-free first.',
    ],
  },
  'high-pressure-system': {
    id: 'high-pressure-system',
    level: 'SERIOUS',
    title: 'High-pressure refrigerant system',
    warning:
      'R-410A, R-32 and R-454B run at roughly 50–70% higher pressure than R-22. Equipment rated only for R-22 can fail catastrophically.',
    precautions: [
      'Verify gauges, hoses and recovery equipment are rated for the system pressure.',
      'Never exceed the recovery cylinder\'s rated pressure or its 80% fill limit by weight.',
    ],
  },
  'moving-parts': {
    id: 'moving-parts',
    level: 'SERIOUS',
    title: 'Rotating equipment',
    warning:
      'Blowers, condenser fans and belts start without warning under thermostat or board control, including after a delay you did not expect.',
    precautions: [
      'Lock out the disconnect before reaching into a blower or fan compartment.',
      'A furnace blower can start on a timed delay minutes after the burner shuts down.',
      'Keep tools, hoses and sleeves clear of the fan path.',
    ],
  },
  'hot-surfaces': {
    id: 'hot-surfaces',
    level: 'CAUTION',
    title: 'Hot surfaces',
    warning:
      'Heat exchangers, flue pipe, ignitors and discharge lines reach temperatures that burn on contact well after shutdown.',
    precautions: [
      'Let the appliance cool or use gloves rated for the temperature.',
      'A hot surface ignitor stays hot long after it stops glowing.',
    ],
  },
  burns: {
    id: 'burns',
    level: 'SERIOUS',
    title: 'Burn hazard',
    warning: 'Open flame, hot metal and brazing work cause immediate serious burns.',
    precautions: [
      'Have a fire extinguisher within reach before any brazing.',
      'Protect surrounding surfaces and check for combustibles behind the work.',
    ],
  },
  'epa-608': {
    id: 'epa-608',
    level: 'CAUTION',
    title: 'Refrigerant handling is regulated',
    warning:
      'In the US, opening a refrigerant circuit requires EPA Section 608 certification, and venting refrigerant is illegal.',
    precautions: [
      'Recover refrigerant to the required vacuum level for the equipment size before opening the system.',
      'Keep the recovery and disposal records your jurisdiction requires.',
    ],
  },
  'confined-space': {
    id: 'confined-space',
    level: 'LETHAL',
    title: 'Confined space',
    warning:
      'Crawl spaces, attics, mechanical pits and walk-in boxes can hold displaced oxygen or accumulated refrigerant/fuel gas.',
    precautions: [
      'Follow your confined-space entry procedure, including atmospheric testing and an attendant where required.',
      'Refrigerant displaces oxygen and pools low. A leak in a pit can be fatal without any warning smell.',
    ],
  },
  'fall-hazard': {
    id: 'fall-hazard',
    level: 'LETHAL',
    title: 'Working at height',
    warning: 'Rooftop units, attics and ladders are the leading source of serious trade injuries.',
    precautions: [
      'Use fall protection where required and inspect the ladder before climbing.',
      'Do not carry gauges and a recovery machine up a ladder in one trip.',
    ],
  },
  'water-damage': {
    id: 'water-damage',
    level: 'CAUTION',
    title: 'Condensate and water',
    warning: 'A blocked condensate drain can flood a ceiling or a mechanical room quickly.',
    precautions: [
      'Verify the secondary drain and float switch work before you leave.',
      'Do not defeat a condensate float switch to keep a system running.',
    ],
    neverBypass: ['Condensate overflow float switches'],
  },
};

export function getHazards(ids: string[]): Hazard[] {
  return ids.map((id) => HAZARDS[id]).filter((h): h is Hazard => Boolean(h));
}

export function highestLevel(ids: string[]): HazardLevel | null {
  const levels = getHazards(ids).map((h) => h.level);
  if (levels.includes('LETHAL')) return 'LETHAL';
  if (levels.includes('SERIOUS')) return 'SERIOUS';
  if (levels.includes('CAUTION')) return 'CAUTION';
  return null;
}

/** Every control that must never be permanently defeated, for the AI guardrail. */
export function neverBypassList(): string[] {
  const out = new Set<string>();
  for (const h of Object.values(HAZARDS)) {
    for (const item of h.neverBypass ?? []) out.add(item);
  }
  return [...out];
}

const BYPASS_PATTERNS: Array<{ re: RegExp; control: string }> = [
  { re: /\b(jump(er)?|bypass|defeat|short|strap)\b[^.]{0,40}\b(pressure switch)\b/i, control: 'pressure switch' },
  { re: /\b(jump(er)?|bypass|defeat|short)\b[^.]{0,40}\b(limit|rollout|roll-?out)\b/i, control: 'limit or rollout switch' },
  { re: /\b(jump(er)?|bypass|defeat|disable)\b[^.]{0,40}\b(flame (sensor|rod)|flame proving)\b/i, control: 'flame proving circuit' },
  { re: /\b(bypass|defeat|disable|remove)\b[^.]{0,40}\b(float switch|condensate switch)\b/i, control: 'condensate float switch' },
  { re: /\b(bypass|defeat|disable)\b[^.]{0,40}\b(high pressure|low pressure) switch\b/i, control: 'refrigerant pressure safety switch' },
  { re: /\b(disable|defeat|bypass)\b[^.]{0,40}\b(blocked vent|spill switch)\b/i, control: 'vent safety switch' },
];

export interface BypassCheck {
  blocked: boolean;
  control?: string;
  message?: string;
}

/**
 * Structural guardrail. Runs on every AI-authored instruction before it is
 * shown, and on technician requests before they are sent to the model, so a
 * "just jumper the pressure switch" answer can never reach the field even if a
 * model would otherwise produce one.
 *
 * Temporary diagnostic jumpering under supervision is a real technique, so the
 * message explains the safe alternative rather than only refusing.
 */
export function checkForBypassRequest(text: string): BypassCheck {
  for (const p of BYPASS_PATTERNS) {
    if (p.re.test(text)) {
      return {
        blocked: true,
        control: p.control,
        message:
          `That would defeat the ${p.control}, which is a safety control — leaving it defeated can vent combustion products into occupied space, flood a building, or destroy the equipment. ` +
          `Diagnose it instead: measure the input the switch is supposed to see (draft in inches w.c. at the pressure port, temperature at the limit, microamps at the flame rod) and compare that to the switch's setpoint. ` +
          `If the input is correct and the switch will not respond, the switch has failed and gets replaced. If the input is wrong, the switch is doing its job and the real fault is upstream.`,
      };
    }
  }
  return { blocked: false };
}
