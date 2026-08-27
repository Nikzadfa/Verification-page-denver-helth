/**
 * Carrier fault-code seed — the reference implementation.
 *
 * ---------------------------------------------------------------------------
 * DATA PROVENANCE
 * ---------------------------------------------------------------------------
 * Every row here is seeded as PROVISIONAL. That is not hedging for its own
 * sake: these entries come from public service literature, and they have NOT
 * been checked against a manufacturer document held in this installation's
 * knowledge base. The resolver surfaces that status to the technician on every
 * lookup, and the AI is forbidden from asserting a PROVISIONAL entry as fact.
 *
 * The intended workflow is that an administrator uploads the actual Carrier
 * service literature for the boards their technicians work on, links each code
 * row to the source document, and promotes it to CONFIRMED. Until that
 * happens, the product tells the truth about what it knows.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SCOPING MATTERS
 * ---------------------------------------------------------------------------
 * Note that code "31" appears twice below with two different meanings, scoped
 * to two different control boards. That is not a data error — it is the
 * central fact this subsystem exists to handle. A technician who reads "31" on
 * an Infinity board and gets the HK42FZ meaning goes looking for a pressure
 * switch problem on a furnace that is reporting something else entirely.
 *
 * When the board is unknown, the resolver returns AMBIGUOUS and shows both.
 */

import type { EquipmentType, VerificationStatus } from '@prisma/client';
import type { FaultTestStep, PossibleCause } from '@/lib/faultcodes/types';

export interface FaultCodeSeed {
  code: string;
  displayCode?: string;
  equipmentType: EquipmentType;
  /** Scope. A row with neither is brand-level and always returns hedged. */
  series?: string;
  board?: string;
  title: string;
  meaning: string;
  triggerConditions: string;
  possibleCauses: PossibleCause[];
  safetyIds: string[];
  testSequence: FaultTestStep[];
  repairNotes?: string;
  verification?: VerificationStatus;
  linkedHypotheses: string[];
}

const GAS = ['natural-gas', 'combustion', 'co-exposure', 'electrical-shock'];
const ELEC = ['electrical-shock', 'capacitor-stored-charge'];

export const CARRIER_FAULT_CODES: FaultCodeSeed[] = [
  // =========================================================================
  // HK42FZ family — the widely fitted Carrier/Bryant furnace control
  // =========================================================================
  {
    code: '31',
    displayCode: '3 flashes, pause, 1 flash',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Pressure switch did not close, or reopened during the cycle',
    meaning:
      'The control started the inducer and waited for the pressure switch to prove draft. Either the switch never closed, or it closed and then dropped out while the burner was running. The control will not open the gas valve without a proved draft, so the furnace shuts down.',
    triggerConditions:
      'The inducer has been commanded on and the pressure switch contacts have not closed within the control\'s proving period — or they closed, the sequence advanced, and then they opened again mid-cycle.',
    possibleCauses: [
      {
        cause: 'Condensate trap or drain blocked, backing water into the collector box or inducer',
        likelihood: 'COMMON',
        note: 'On a condensing furnace this is the single most common cause. Pull the trap before you touch anything else.',
        hypothesisId: 'condensate-blockage',
      },
      {
        cause: 'Pressure switch hose disconnected, cracked, kinked, or full of condensate',
        likelihood: 'COMMON',
        hypothesisId: 'pressure-switch-fault',
      },
      { cause: 'Blocked or restricted flue or combustion air intake', likelihood: 'COMMON', hypothesisId: 'blocked-flue' },
      {
        cause: 'Weak or failing inducer motor — spinning, but not producing rated draft',
        likelihood: 'OCCASIONAL',
        hypothesisId: 'inducer-motor-fault',
      },
      {
        cause: 'Cracked inducer housing or a blown housing gasket losing draft',
        likelihood: 'OCCASIONAL',
        hypothesisId: 'inducer-motor-fault',
      },
      { cause: 'Failed pressure switch — draft is adequate and it will not close', likelihood: 'OCCASIONAL', hypothesisId: 'pressure-switch-fault' },
      { cause: 'Plugged inducer wheel or collector box passages', likelihood: 'OCCASIONAL' },
      { cause: 'High wind or vent termination in a pressure zone causing intermittent dropouts', likelihood: 'RARE' },
    ],
    safetyIds: GAS,
    testSequence: [
      {
        step: 1,
        action:
          'Pull the condensate trap and check that it and the drain line flow freely. Check the collector box drain ports.',
        expected: 'Trap and drain clear, water flows out under its own weight.',
        ifPass: 'Move to step 2.',
        ifFail:
          'Clean the trap and drain, verify free flow, and re-run the furnace. This is the most common cause on a condensing furnace and it costs nothing to check first.',
        hazardIds: ['co-exposure', 'electrical-shock'],
      },
      {
        step: 2,
        action:
          'Inspect the pressure switch hose end to end. Check for a disconnected end, a crack, a kink, condensate standing in it, and soot or debris blocking the port.',
        expected: 'Hose intact, clear and connected at both ends.',
        ifPass: 'Move to step 3.',
        ifFail: 'Clear or replace the hose and re-run.',
        hazardIds: ['co-exposure'],
      },
      {
        step: 3,
        action:
          'Tee a manometer into the pressure switch hose and read the negative pressure with the inducer running. Compare it to the setpoint printed on the switch body.',
        expected: 'Measured draft meets or exceeds the switch setpoint.',
        ifPass:
          'The inducer is producing the draft the switch needs and the switch is not responding — the switch has failed. Go to step 5.',
        ifFail:
          'The switch is doing its job; the draft really is inadequate. Go to step 4. Do NOT jumper the switch to run the furnace — it is the only device proving the flue is clear, and defeating it can vent combustion products into the house.',
        hazardIds: ['co-exposure', 'natural-gas'],
      },
      {
        step: 4,
        action:
          'Find why the draft is low: inspect the full vent run and the combustion air intake for obstruction, check the inducer wheel and housing for debris, corrosion or cracks, and confirm the inducer comes up to full speed.',
        expected: 'A clear vent, an intact housing, and an inducer at full speed.',
        ifPass:
          'If everything reads clear and the draft is still low, re-measure at the inducer outlet to separate a restriction from a weak motor.',
        ifFail: 'Correct the obstruction or replace the inducer assembly, then re-measure the draft.',
        hazardIds: ['co-exposure', 'combustion', 'fall-hazard'],
      },
      {
        step: 5,
        action:
          'With adequate draft confirmed, check switch continuity across the contacts with the inducer running.',
        expected: 'Contacts closed once the setpoint draft is present.',
        ifPass: 'The switch is functional — look again at intermittent draft or wiring.',
        ifFail: 'Replace the pressure switch with one of the same setpoint and configuration.',
        hazardIds: ['electrical-shock'],
      },
    ],
    repairNotes:
      'Do not replace the pressure switch until you have measured the draft. Most calls for this code are blocked condensate traps, plugged flues or failing inducers — the switch is usually reporting a real problem rather than being the problem.',
    linkedHypotheses: [
      'condensate-blockage',
      'pressure-switch-fault',
      'blocked-flue',
      'inducer-motor-fault',
    ],
  },
  {
    code: '33',
    displayCode: '3 flashes, pause, 3 flashes',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Limit circuit fault',
    meaning:
      'A device in the limit string has opened. The limit string protects the heat exchanger from overheating, so this is nearly always the furnace telling you it is not getting enough air across the heat exchanger.',
    triggerConditions:
      'The limit circuit opened while the furnace was firing, or opened and stayed open long enough for the control to flag it.',
    possibleCauses: [
      { cause: 'Restricted air filter', likelihood: 'COMMON', hypothesisId: 'dirty-filter' },
      { cause: 'Blower not running, or running at the wrong speed for the heating mode', likelihood: 'COMMON', hypothesisId: 'blower-motor-failure' },
      { cause: 'Restricted or undersized duct system, closed dampers, blocked returns', likelihood: 'COMMON', hypothesisId: 'duct-restriction' },
      { cause: 'Dirty blower wheel', likelihood: 'OCCASIONAL', hypothesisId: 'dirty-filter' },
      { cause: 'Furnace overfired — manifold pressure set above the rating plate', likelihood: 'OCCASIONAL', hypothesisId: 'gas-supply-pressure' },
      { cause: 'Failed limit switch opening below its setpoint', likelihood: 'RARE', hypothesisId: 'limit-circuit-open' },
      { cause: 'Blocked or partially collapsed heat exchanger passages', likelihood: 'RARE', hypothesisId: 'heat-exchanger-concern' },
    ],
    safetyIds: [...GAS, 'hot-surfaces', 'moving-parts'],
    testSequence: [
      {
        step: 1,
        action: 'Pull the filter and check it. Confirm the blower runs on a heating call and comes up to speed.',
        expected: 'A filter that passes light, and a blower that starts and runs steadily.',
        ifPass: 'Move to step 2.',
        ifFail: 'Correct the filter or the blower, then re-run and measure temperature rise.',
        hazardIds: ['moving-parts'],
      },
      {
        step: 2,
        action:
          'Run the furnace at steady state for 10 minutes and measure temperature rise: return and supply dry bulb, with the supply probe out of the line of sight of the heat exchanger.',
        expected: 'Rise inside the range printed on this furnace\'s rating plate.',
        ifPass:
          'Rise is in range and the limit is still opening — the limit switch itself is the suspect. Go to step 4.',
        ifFail: 'Rise is above the rating plate. Go to step 3 to find the airflow restriction.',
        hazardIds: ['hot-surfaces', 'co-exposure'],
      },
      {
        step: 3,
        action:
          'Measure total external static pressure, then split it across the filter and the coil to localize the restriction.',
        expected: 'Total external static at or below the blower table maximum for this unit.',
        ifPass: 'Static is fine but rise is high — check whether the furnace is overfired by clocking the gas meter.',
        ifFail: 'Correct the restriction the split identifies, then re-measure rise.',
        hazardIds: ['moving-parts'],
      },
      {
        step: 4,
        action:
          'With the furnace cool and power off and locked out, check continuity across each limit in the string.',
        expected: 'All limits closed at room temperature.',
        ifPass: 'A limit that is closed cold and opening in service with rise in range is opening below setpoint — replace it.',
        ifFail: 'Replace the open limit. Never jumper or remove a limit switch to run the furnace.',
        hazardIds: ['electrical-shock', 'co-exposure'],
      },
    ],
    repairNotes:
      'The limit is the messenger, not the message. Replacing a limit switch without correcting the airflow restriction that opened it puts the heat exchanger straight back under the same thermal stress.',
    linkedHypotheses: ['limit-circuit-open', 'dirty-filter', 'blower-motor-failure', 'duct-restriction'],
  },
  {
    code: '34',
    displayCode: '3 flashes, pause, 4 flashes',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Ignition proving failure',
    meaning:
      'The control opened the gas valve and did not receive an adequate flame signal, or received one and then lost it. The burners may light and drop out after a few seconds — that is the classic presentation.',
    triggerConditions:
      'Flame was not proved within the trial-for-ignition period, or the flame signal was lost after a successful light.',
    possibleCauses: [
      { cause: 'Dirty or coated flame sensor', likelihood: 'COMMON', hypothesisId: 'flame-sensor-fault' },
      { cause: 'Poor burner or chassis ground breaking the rectification path', likelihood: 'COMMON', hypothesisId: 'poor-burner-ground' },
      { cause: 'Flame sensor not positioned in the flame', likelihood: 'OCCASIONAL', hypothesisId: 'flame-sensor-fault' },
      { cause: 'Low gas supply or manifold pressure producing a weak flame', likelihood: 'OCCASIONAL', hypothesisId: 'gas-supply-pressure' },
      { cause: 'Gas valve not opening or not regulating', likelihood: 'OCCASIONAL', hypothesisId: 'gas-valve-fault' },
      { cause: 'Ignitor cracked or mis-positioned so the burner lights late', likelihood: 'OCCASIONAL', hypothesisId: 'ignitor-fault' },
      { cause: 'Dirty or misaligned burners, or blocked burner ports', likelihood: 'OCCASIONAL' },
      { cause: 'Control board flame-sense circuit failure', likelihood: 'RARE', hypothesisId: 'control-board-fault' },
    ],
    safetyIds: GAS,
    testSequence: [
      {
        step: 1,
        action:
          'Watch a full ignition attempt from a safe position. Note whether the burners light at all, and if so how long they stay lit.',
        expected: 'Burners light and stay lit.',
        ifPass: 'If they light and drop out after a few seconds, go to step 2 — this is a flame-proving problem.',
        ifFail:
          'If they never light, this is not a flame-sense problem. Check the ignitor, the gas valve voltage, and gas supply pressure instead.',
        hazardIds: ['natural-gas', 'combustion'],
      },
      {
        step: 2,
        action:
          'Put a meter set to DC microamps in series with the flame sensor lead and read the current with the burners lit.',
        expected: 'At or above the minimum in this board\'s literature — commonly around 0.5–1.0 µA minimum, but the actual figure is board specific.',
        ifPass: 'Flame signal is adequate. The control is dropping the valve for another reason — check gas pressure and the board.',
        ifFail: 'Go to step 3.',
        hazardIds: ['natural-gas', 'hot-surfaces', 'electrical-shock'],
      },
      {
        step: 3,
        action:
          'Clean the flame sensor with a non-abrasive pad — never sandpaper or emery cloth, which leave a residue that insulates the rod. Confirm the sensor sits in the flame. Re-read the microamps.',
        expected: 'Flame current comes up above the board minimum.',
        ifPass: 'Done — but see the repair note about why it fouled.',
        ifFail: 'Go to step 4.',
        hazardIds: ['hot-surfaces', 'natural-gas'],
      },
      {
        step: 4,
        action:
          'Check the ground path: resistance from the burner assembly to the board common, and the neutral/ground bond at the furnace. Rectification returns through this path.',
        expected: 'Near-zero resistance from the burner assembly to the board common.',
        ifPass:
          'With a clean sensor in a good flame and a solid ground still reading low, measure manifold pressure — a weak flame gives a weak signal.',
        ifFail: 'Repair the ground path and re-read the microamps.',
        hazardIds: ['electrical-shock', 'natural-gas'],
      },
    ],
    repairNotes:
      'A flame sensor that fouls every season is a symptom. Check burner condition, combustion air and manifold pressure before writing it off as routine maintenance.',
    linkedHypotheses: ['flame-sensor-fault', 'poor-burner-ground', 'gas-valve-fault', 'gas-supply-pressure'],
  },
  {
    code: '13',
    displayCode: '1 flash, pause, 3 flashes',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Limit circuit lockout',
    meaning:
      'The limit circuit has stayed open long enough that the control has locked out rather than continuing to retry. This is the escalation of a limit fault, not a separate failure.',
    triggerConditions:
      'The limit circuit remained open beyond the control\'s retry window.',
    possibleCauses: [
      { cause: 'Persistent airflow restriction that has not been corrected', likelihood: 'COMMON', hypothesisId: 'dirty-filter' },
      { cause: 'Blower not running', likelihood: 'COMMON', hypothesisId: 'blower-motor-failure' },
      { cause: 'Open limit switch', likelihood: 'OCCASIONAL', hypothesisId: 'limit-circuit-open' },
      { cause: 'Open rollout switch in the same string', likelihood: 'OCCASIONAL', hypothesisId: 'rollout-tripped' },
    ],
    safetyIds: [...GAS, 'hot-surfaces'],
    testSequence: [
      {
        step: 1,
        action:
          'Identify WHICH device in the string is open before resetting anything. Check each limit and each rollout switch for continuity with the furnace cool.',
        expected: 'All devices closed at room temperature.',
        ifPass: 'Diagnose it as a limit fault — go to the airflow checks.',
        ifFail:
          'If a ROLLOUT switch is the open device, stop. A tripped rollout means flame left the burner box, which is a combustion or heat-exchanger problem and a CO hazard. Do not reset it and walk away.',
        hazardIds: ['co-exposure', 'combustion'],
      },
    ],
    repairNotes:
      'Clearing the lockout without finding what opened the limit just resets the clock. Establish the cause, correct it, and verify temperature rise is inside the rating plate range before you leave.',
    linkedHypotheses: ['limit-circuit-open', 'dirty-filter', 'blower-motor-failure', 'rollout-tripped'],
  },
  {
    code: '24',
    displayCode: '2 flashes, pause, 4 flashes',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Secondary voltage fuse open',
    meaning:
      'The low-voltage fuse on the control board has opened. Something in the 24 V circuit drew more current than the fuse allows — nearly always a short.',
    triggerConditions: 'The control detects loss of secondary voltage through the fuse.',
    possibleCauses: [
      {
        cause: 'Short in the field thermostat wiring — commonly rubbed through at a sheet-metal edge',
        likelihood: 'COMMON',
        hypothesisId: 'low-voltage-short',
      },
      { cause: 'Shorted or failed 24 V load — contactor coil, gas valve, humidifier, damper motor', likelihood: 'COMMON', hypothesisId: 'low-voltage-short' },
      { cause: 'Wire pinched during a previous service or equipment change', likelihood: 'OCCASIONAL', hypothesisId: 'low-voltage-short' },
      { cause: 'Failed control transformer', likelihood: 'RARE', hypothesisId: 'transformer-fault' },
    ],
    safetyIds: ELEC,
    testSequence: [
      {
        step: 1,
        action:
          'Do not simply replace the fuse. Disconnect the field thermostat wiring at the board, fit a new fuse, and see whether it holds.',
        expected: 'The fuse holds with the field wiring disconnected.',
        ifPass: 'The short is in the field wiring or a load it feeds. Go to step 2.',
        ifFail: 'The short is inside the furnace. Isolate the internal 24 V loads one at a time.',
        hazardIds: ['electrical-shock'],
      },
      {
        step: 2,
        action:
          'Reconnect one conductor at a time. Watch the thermostat cable where it passes through sheet metal, at the outdoor unit, and at any accessory wired into the circuit.',
        expected: 'The fuse holds until the shorted conductor is reconnected.',
        ifPass: 'The conductor that blows the fuse carries the short — trace and repair it.',
        ifFail: 'Recheck the accessories and the outdoor unit contactor coil.',
        hazardIds: ['electrical-shock'],
      },
    ],
    repairNotes:
      'Replacing the fuse without finding the short destroys the new fuse and wastes the trip. Find the short first.',
    linkedHypotheses: ['low-voltage-short', 'transformer-fault'],
  },
  {
    code: '41',
    displayCode: '4 flashes, pause, 1 flash',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Blower motor fault',
    meaning:
      'The control commanded the blower and did not get the response it expected — no rotation, or a speed that does not match the command.',
    triggerConditions:
      'The blower did not start, or did not reach the commanded speed, within the control\'s window.',
    possibleCauses: [
      { cause: 'Failed blower motor or, on an ECM, a failed control module', likelihood: 'COMMON', hypothesisId: 'blower-motor-failure' },
      { cause: 'Failed run capacitor on a PSC blower', likelihood: 'COMMON', hypothesisId: 'run-capacitor-failed' },
      { cause: 'Blower wheel jammed or bearings seized', likelihood: 'OCCASIONAL', hypothesisId: 'blower-motor-failure' },
      { cause: 'Loose or corroded blower harness connection', likelihood: 'OCCASIONAL' },
      { cause: 'Excessive static pressure driving an ECM past its torque limit', likelihood: 'OCCASIONAL', hypothesisId: 'duct-restriction' },
      { cause: 'Control board blower relay failure', likelihood: 'RARE', hypothesisId: 'control-board-fault' },
    ],
    safetyIds: [...ELEC, 'moving-parts'],
    testSequence: [
      {
        step: 1,
        action:
          'With power off and locked out, confirm the blower wheel turns freely by hand and the wheel is not loaded with debris.',
        expected: 'Wheel spins freely.',
        ifPass: 'Move to step 2.',
        ifFail: 'Free or replace the blower assembly.',
        hazardIds: ['moving-parts', 'electrical-shock'],
      },
      {
        step: 2,
        action:
          'On a call, measure at the board blower terminal. On a PSC blower look for line voltage on the commanded speed tap; on an ECM confirm the board is sending the control signal the motor expects.',
        expected: 'The command is present whenever the blower should run.',
        ifPass: 'Command present and no rotation means the motor or module. On a PSC, test the run capacitor first.',
        ifFail: 'No command from the board — check the board and any interlock ahead of it.',
        hazardIds: ['electrical-shock', 'moving-parts'],
      },
      {
        step: 3,
        action: 'Measure total external static pressure before fitting a replacement ECM module.',
        expected: 'At or below the blower table maximum.',
        ifPass: 'Fit the replacement.',
        ifFail:
          'Correct the duct restriction first. High static is a leading cause of repeat ECM module failure — a new module in the same duct system fails the same way.',
        hazardIds: ['moving-parts'],
      },
    ],
    linkedHypotheses: ['blower-motor-failure', 'run-capacitor-failed', 'duct-restriction', 'control-board-fault'],
  },
  {
    code: '12',
    displayCode: '1 flash, pause, 2 flashes',
    equipmentType: 'GAS_FURNACE',
    board: 'HK42FZ',
    title: 'Blower on after power up',
    meaning:
      'The control found the limit circuit open when power was restored and ran the blower to clear residual heat. On its own this is informational — it tells you the furnace lost power while hot, or that a limit was open at power-up.',
    triggerConditions: 'Limit circuit open at the moment power was applied.',
    possibleCauses: [
      { cause: 'Power interruption while the furnace was running', likelihood: 'COMMON' },
      { cause: 'A limit genuinely open at power-up — see the limit-fault code', likelihood: 'OCCASIONAL', hypothesisId: 'limit-circuit-open' },
    ],
    safetyIds: ['electrical-shock', 'moving-parts'],
    testSequence: [
      {
        step: 1,
        action: 'Check whether any other status code is stored, and whether the furnace now runs a normal cycle.',
        expected: 'A normal cycle with no further codes.',
        ifPass: 'Informational only. Note it and move on.',
        ifFail: 'Diagnose the accompanying code — that is the real fault.',
      },
    ],
    linkedHypotheses: [],
  },

  // =========================================================================
  // Infinity / Evolution board — SAME NUMBER, DIFFERENT MEANING
  // =========================================================================
  {
    code: '31',
    displayCode: '31 on the seven-segment display',
    equipmentType: 'GAS_FURNACE',
    board: 'CESO130035',
    series: '59MN7',
    title: 'High-heat pressure switch fault (modulating/multi-stage control)',
    meaning:
      'On this control the code identifies the HIGH-HEAT stage pressure switch specifically, rather than the pressure switch circuit generally. A modulating furnace has more than one pressure switch or a switch with more than one setpoint, and the control distinguishes which stage failed to prove.',
    triggerConditions:
      'The control called for high-heat operation and the corresponding pressure switch did not prove at the higher inducer speed.',
    possibleCauses: [
      { cause: 'Inducer not reaching the higher speed required for the high-heat stage', likelihood: 'COMMON', hypothesisId: 'inducer-motor-fault' },
      { cause: 'Partial vent restriction that passes on low heat and fails on high', likelihood: 'COMMON', hypothesisId: 'blocked-flue' },
      { cause: 'Condensate backing up in the collector box at the higher firing rate', likelihood: 'COMMON', hypothesisId: 'condensate-blockage' },
      { cause: 'High-heat pressure switch failed', likelihood: 'OCCASIONAL', hypothesisId: 'pressure-switch-fault' },
      { cause: 'Hose to the high-heat switch cracked, kinked or wet', likelihood: 'OCCASIONAL', hypothesisId: 'pressure-switch-fault' },
    ],
    safetyIds: GAS,
    testSequence: [
      {
        step: 1,
        action:
          'Confirm which stage the furnace was calling for when it faulted, and whether it runs normally on low heat.',
        expected: 'A furnace that runs low heat and fails only on high heat.',
        ifPass:
          'A restriction that passes at the low firing rate and fails at the high one is the signature here — go to step 2.',
        ifFail: 'If it fails on low heat too, treat it as a general pressure-switch circuit fault.',
        hazardIds: ['co-exposure'],
      },
      {
        step: 2,
        action:
          'Tee a manometer into the high-heat switch hose and read the draft with the furnace commanded to high heat. Compare to that switch\'s setpoint.',
        expected: 'Measured draft meets the high-heat switch setpoint.',
        ifPass: 'Draft is adequate and the switch is not closing — the switch has failed.',
        ifFail:
          'The restriction is real. Check the vent and intake over the full run, the collector box drains, and whether the inducer reaches high speed.',
        hazardIds: ['co-exposure', 'natural-gas'],
      },
    ],
    repairNotes:
      'The code number here is the same as the general pressure-switch code on other Carrier boards, but it means something narrower. Confirm the board part number before applying either meaning.',
    linkedHypotheses: ['inducer-motor-fault', 'blocked-flue', 'condensate-blockage', 'pressure-switch-fault'],
  },
  {
    code: '45',
    displayCode: '4 flashes, pause, 5 flashes',
    equipmentType: 'GAS_FURNACE',
    board: 'CESO110057',
    series: '58MVC',
    title: 'Control circuitry lockout',
    meaning:
      'The control has detected an internal fault, or a condition it cannot resolve, and has locked itself out. On some revisions this also covers a gas-valve relay or flame-sense circuit fault detected by the board\'s self-check.',
    triggerConditions:
      'The control\'s internal self-check failed, or a hardware fault was detected on a monitored circuit.',
    possibleCauses: [
      { cause: 'Line voltage supply problem — low voltage or a miswired/reversed polarity supply', likelihood: 'COMMON' },
      { cause: 'Poor chassis ground at the furnace', likelihood: 'COMMON', hypothesisId: 'poor-burner-ground' },
      { cause: 'Moisture or corrosion on the control board', likelihood: 'OCCASIONAL' },
      { cause: 'Genuine control board failure', likelihood: 'OCCASIONAL', hypothesisId: 'control-board-fault' },
    ],
    safetyIds: [...ELEC, 'natural-gas'],
    testSequence: [
      {
        step: 1,
        action:
          'Before ordering a board: check incoming line voltage and confirm correct polarity and a solid chassis ground. Cycle power and see whether the lockout clears.',
        expected: 'Correct voltage, correct polarity, solid ground, and the lockout clears on a power cycle.',
        ifPass: 'Watch it through a full cycle before calling it resolved.',
        ifFail: 'Correct the supply or ground problem first — both produce this code on a healthy board.',
        hazardIds: ['electrical-shock'],
      },
      {
        step: 2,
        action: 'Inspect the board for moisture, corrosion, scorched traces and swollen components.',
        expected: 'A clean, dry board.',
        ifPass:
          'With supply, polarity, ground and the board itself all confirmed good and the lockout persisting, replace the board.',
        ifFail:
          'Replace the board — and find where the moisture came from, or the replacement goes the same way.',
        hazardIds: ['electrical-shock'],
      },
    ],
    repairNotes:
      'Control boards are the most over-replaced part in the trade. Reversed line polarity and a missing chassis ground both produce lockouts on a perfectly good board — check them first, every time.',
    linkedHypotheses: ['control-board-fault', 'poor-burner-ground'],
  },

  // =========================================================================
  // Brand-level entry, deliberately unscoped. The resolver returns this as
  // BRAND_FALLBACK and asks for the model and board before it is relied on.
  // =========================================================================
  {
    code: '22',
    equipmentType: 'GAS_FURNACE',
    title: 'Abnormal flame signal — flame sensed when it should not be present',
    meaning:
      'The control is reading a flame signal at a point in the sequence where the gas valve should be closed. This is a safety-significant condition: the control cannot confirm that gas flow has actually stopped.',
    triggerConditions:
      'A flame signal is present with the gas valve de-energized, typically detected during the post-purge or between cycles.',
    possibleCauses: [
      { cause: 'Gas valve leaking through and not fully closing', likelihood: 'OCCASIONAL', hypothesisId: 'gas-valve-fault' },
      { cause: 'Flame sensor lead shorted to ground or damaged insulation', likelihood: 'OCCASIONAL' },
      { cause: 'Control board flame-sense circuit fault', likelihood: 'OCCASIONAL', hypothesisId: 'control-board-fault' },
      { cause: 'Residual flame from delayed shutdown or a lingering ember on a dirty burner', likelihood: 'RARE' },
    ],
    safetyIds: [...GAS, 'burns'],
    testSequence: [
      {
        step: 1,
        action:
          'Watch the burners through a shutdown. Confirm the flame goes out promptly when the valve de-energizes.',
        expected: 'Flame extinguishes promptly at valve shutoff.',
        ifPass:
          'Check the flame sensor lead for damaged insulation or a short to the chassis.',
        ifFail:
          'A burner still carrying flame with the valve commanded closed means the valve is passing gas. Shut off the manual gas valve and do not leave the appliance in service until the gas valve is replaced.',
        hazardIds: ['natural-gas', 'combustion', 'co-exposure'],
      },
    ],
    repairNotes:
      'Treat this as safety-significant until proven otherwise. A gas valve that does not fully close is not something to leave running over a weekend while a part ships.',
    linkedHypotheses: ['gas-valve-fault', 'control-board-fault'],
  },

  // =========================================================================
  // Cooling-side codes
  // =========================================================================
  {
    code: '84',
    equipmentType: 'HEAT_PUMP',
    series: '25VNA',
    title: 'Outdoor unit — inverter/drive fault reported to the system control',
    meaning:
      'The variable-speed outdoor drive has reported a fault to the system control. The number identifies the fault family; the drive itself usually holds a more specific sub-code readable at the outdoor board.',
    triggerConditions:
      'The inverter drive signalled a fault condition — over-current, over-temperature, DC bus, or a compressor start failure.',
    possibleCauses: [
      { cause: 'High head pressure from a dirty condenser or a failing outdoor fan', likelihood: 'COMMON', hypothesisId: 'dirty-condenser' },
      { cause: 'Supply voltage out of range or unstable', likelihood: 'OCCASIONAL', hypothesisId: 'no-power-to-unit' },
      { cause: 'Compressor winding or start problem', likelihood: 'OCCASIONAL', hypothesisId: 'compressor-electrical-failure' },
      { cause: 'Drive/inverter board failure', likelihood: 'OCCASIONAL' },
      { cause: 'Communication fault between the system control and the outdoor unit', likelihood: 'OCCASIONAL' },
    ],
    safetyIds: [...ELEC, 'arc-flash', 'refrigerant-handling'],
    testSequence: [
      {
        step: 1,
        action:
          'Read the specific fault at the OUTDOOR unit board, not just the code shown at the thermostat. The system control shows a family; the drive shows the actual fault.',
        expected: 'A specific drive fault code from the outdoor board.',
        ifPass: 'Look that specific code up before going further — it determines the whole path.',
        ifFail: 'If nothing is readable at the outdoor unit, verify the unit has power and the communication link is intact.',
        hazardIds: ['electrical-shock', 'arc-flash'],
      },
      {
        step: 2,
        action:
          'Check supply voltage under load and inspect the condenser coil and outdoor fan before assuming a drive failure.',
        expected: 'Supply within ±10% and a clean coil with a fan moving rated air.',
        ifPass: 'With supply and heat rejection confirmed, the drive or compressor is the next suspect.',
        ifFail: 'Correct the supply or heat-rejection problem — inverter drives fault out to protect themselves from both.',
        hazardIds: ['electrical-shock', 'moving-parts'],
      },
    ],
    repairNotes:
      'Inverter drives fault out to protect themselves. A drive fault is frequently a symptom of high head pressure or bad supply voltage rather than a failed drive.',
    linkedHypotheses: ['dirty-condenser', 'condenser-fan-failure', 'compressor-electrical-failure', 'no-power-to-unit'],
  },
];
