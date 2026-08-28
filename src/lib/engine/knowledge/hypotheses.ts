/**
 * Hypothesis catalogue — the set of things that can actually be wrong.
 *
 * Adding a failure mode is a single self-contained entry: what it is, which
 * complaints it explains, how common it is, which findings argue for or
 * against it, what it is confused with and what separates them, and what the
 * repair actually involves.
 *
 * `confusedWith` is load-bearing. When the top two hypotheses are close the
 * engine reads these entries to tell the technician exactly which test
 * separates them, which is the difference between a diagnostic assistant and
 * a parts-swapping suggestion box.
 */

import type { Hypothesis } from '../types';

export const HYPOTHESES: Hypothesis[] = [
  // =========================================================================
  // Refrigerant circuit
  // =========================================================================
  {
    id: 'low-charge-leak',
    label: 'Low refrigerant charge (system has a leak)',
    category: 'refrigeration',
    statement:
      'The system is short of refrigerant. Refrigerant is not consumed, so a low charge means it leaked out and the leak has to be found and repaired.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'no_cooling', 'frozen_coil', 'insufficient_heat'],
    prior: 0.2,
    confirmedBy: ['leak-search', 'weigh-in-charge'],
    confusedWith: [
      {
        hypothesisId: 'liquid-line-restriction',
        separatedBy: 'measure-subcooling',
        how: 'Both starve the evaporator and read high superheat. An undercharge has LOW subcooling; a restriction has HIGH subcooling because liquid stacks behind the restriction.',
      },
      {
        hypothesisId: 'compressor-not-pumping',
        separatedBy: 'compressor-amp-draw',
        how: 'Both give low subcooling and a narrow condenser split. A failing compressor draws well below RLA and cannot pull the suction down; an undercharged system pulls suction down normally and the compressor draws near its expected amps for the conditions.',
      },
      {
        hypothesisId: 'dirty-filter',
        separatedBy: 'total-external-static',
        how: 'Low indoor airflow also raises superheat on a fixed orifice. Static pressure tells them apart before you touch the charge.',
      },
    ],
    safetyIds: ['refrigerant-handling', 'frostbite', 'epa-608'],
    repair: {
      summary:
        'Locate and repair the leak, then evacuate to 500 microns with a decay test and weigh in the nameplate charge adjusted for line-set length.',
      parts: ['Filter drier', 'Refrigerant (weighed charge)', 'Brazing/repair materials as found'],
      rootCauseWarning:
        'Adding refrigerant without finding the leak is not a repair — the system will be back, and venting refrigerant is illegal. If the customer declines the leak search, that decision belongs in the report.',
    },
    requiresEvidence: ['subcooling_low'],
    evidence: {
      pattern_high_sh_low_sc: 'STRONG_FOR',
      subcooling_low: 'STRONG_FOR',
      superheat_high: 'FOR',
      condenser_split_low: 'FOR',
      delta_t_low: 'WEAK_FOR',
      leak_found: 'PATHOGNOMONIC',
      low_pressure_switch_open: 'FOR',
      evaporator_iced: 'WEAK_FOR',
      subcooling_high: 'STRONG_AGAINST',
      // A starved evaporator with liquid stacking in the condenser is not a
      // system that is short of refrigerant — you cannot stack liquid you do
      // not have. This pattern is physically incompatible with an undercharge,
      // and it is the single most consequential discrimination on the
      // refrigerant side: adding refrigerant to a restricted system makes it
      // worse and costs the customer a charge they did not need.
      pattern_high_sh_high_sc: 'RULES_OUT',
      restriction_across_drier: 'STRONG_AGAINST',
      pattern_charge_normal: 'RULES_OUT',
      leak_not_found: 'WEAK_AGAINST',
      static_pressure_high: 'WEAK_AGAINST',
    },
  },
  {
    id: 'liquid-line-restriction',
    label: 'Liquid-line restriction (drier, line, or metering device inlet)',
    category: 'refrigeration',
    statement:
      'Something between the condenser outlet and the evaporator inlet is restricting flow — usually a plugged filter drier, sometimes a kinked line or a screen at the metering device.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'no_cooling', 'frozen_coil'],
    prior: 0.06,
    confirmedBy: ['drier-temperature-drop'],
    confusedWith: [
      {
        hypothesisId: 'low-charge-leak',
        separatedBy: 'measure-subcooling',
        how: 'Subcooling is the separator: a restriction stacks liquid and reads HIGH subcooling, an undercharge reads LOW.',
      },
      {
        hypothesisId: 'txv-starving',
        separatedBy: 'drier-temperature-drop',
        how: 'A restriction upstream of the valve produces a measurable temperature drop across the drier or at the restriction point. A failed valve does not — the liquid line stays at one temperature right up to the valve body.',
      },
    ],
    safetyIds: ['refrigerant-handling', 'frostbite', 'epa-608'],
    repair: {
      summary:
        'Recover, replace the restricted component, install a new liquid-line drier, evacuate to 500 microns with a decay test, and weigh in the charge.',
      parts: ['Liquid line filter drier', 'Refrigerant'],
      rootCauseWarning:
        'A plugged drier is usually downstream evidence of a burnout or of moisture in the system. Find out why it plugged, or the replacement plugs too.',
    },
    evidence: {
      pattern_high_sh_high_sc: 'PATHOGNOMONIC',
      restriction_across_drier: 'PATHOGNOMONIC',
      superheat_high: 'FOR',
      subcooling_high: 'STRONG_FOR',
      condenser_split_high: 'WEAK_FOR',
      sight_glass_bubbles: 'FOR',
      subcooling_low: 'STRONG_AGAINST',
      pattern_high_sh_low_sc: 'STRONG_AGAINST',
      pattern_charge_normal: 'RULES_OUT',
    },
  },
  {
    id: 'txv-starving',
    label: 'Metering device starving the evaporator (TXV/EEV not opening)',
    category: 'refrigeration',
    statement:
      'The expansion valve is not feeding the coil — stuck closed, lost its sensing-bulb charge, or the bulb has lost contact with the suction line.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'no_cooling', 'frozen_coil'],
    prior: 0.05,
    confirmedBy: ['txv-bulb-test'],
    confusedWith: [
      {
        hypothesisId: 'liquid-line-restriction',
        separatedBy: 'drier-temperature-drop',
        how: 'Check for a temperature split across the drier first — it is a 60-second test and it rules out the cheaper failure before you condemn a valve.',
      },
      {
        hypothesisId: 'low-charge-leak',
        separatedBy: 'measure-subcooling',
        how: 'A starving valve holds subcooling up because liquid backs up; an undercharge cannot.',
      },
    ],
    safetyIds: ['refrigerant-handling', 'frostbite', 'epa-608'],
    repair: {
      summary:
        'Verify the sensing bulb is clean, tight on the suction line at the correct clock position, and insulated. If the bulb mounting is correct and the valve still will not respond to warming or cooling the bulb, replace the valve.',
      parts: ['TXV/EEV', 'Liquid line filter drier'],
      rootCauseWarning:
        'A loose or uninsulated sensing bulb produces the same symptom as a failed valve and costs nothing to fix. Check the mounting before ordering the valve.',
    },
    requiresEvidence: ['pattern_high_sh_high_sc'],
    evidence: {
      pattern_high_sh_high_sc: 'STRONG_FOR',
      superheat_high: 'FOR',
      subcooling_high: 'FOR',
      restriction_across_drier: 'STRONG_AGAINST',
      pattern_high_sh_low_sc: 'AGAINST',
      pattern_charge_normal: 'RULES_OUT',
    },
  },
  {
    id: 'txv-overfeeding',
    label: 'Metering device overfeeding (TXV stuck open or bulb charge lost)',
    category: 'refrigeration',
    statement:
      'The valve is feeding too much refrigerant, driving superheat down and risking liquid return to the compressor.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'noise'],
    prior: 0.03,
    confirmedBy: ['txv-bulb-test'],
    confusedWith: [
      {
        hypothesisId: 'overcharge',
        separatedBy: 'measure-subcooling',
        how: 'An overcharge raises subcooling substantially; an overfeeding valve typically leaves subcooling near normal while superheat collapses.',
      },
    ],
    safetyIds: ['refrigerant-handling', 'frostbite'],
    repair: {
      summary:
        'Confirm the bulb is mounted correctly and insulated, then replace the valve if it will not respond to bulb temperature.',
      parts: ['TXV/EEV', 'Liquid line filter drier'],
      rootCauseWarning:
        'Sustained floodback washes oil out of the compressor bearings. Do not leave the system running while you source the part.',
    },
    evidence: {
      pattern_low_sh_low_sc: 'STRONG_FOR',
      superheat_low: 'FOR',
      floodback_risk: 'STRONG_FOR',
      superheat_negative: 'STRONG_FOR',
      subcooling_high: 'WEAK_AGAINST',
      pattern_charge_normal: 'RULES_OUT',
    },
  },
  {
    id: 'overcharge',
    label: 'Overcharge',
    category: 'refrigeration',
    statement: 'More refrigerant in the system than the circuit is designed to hold.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'high_bill', 'short_cycling'],
    prior: 0.07,
    confirmedBy: ['weigh-in-charge'],
    confusedWith: [
      {
        hypothesisId: 'dirty-condenser',
        separatedBy: 'inspect-condenser-coil',
        how: 'Both raise head pressure and condenser split. Look at the coil and check the fan before recovering refrigerant — a dirty coil with a correct charge reads high subcooling too.',
      },
      {
        hypothesisId: 'noncondensables',
        separatedBy: 'measure-subcooling',
        how: 'Non-condensables raise head pressure while leaving subcooling near normal. An overcharge raises both.',
      },
    ],
    safetyIds: ['refrigerant-handling', 'frostbite', 'epa-608'],
    repair: {
      summary:
        'Recover to the nameplate charge, adjusted for actual line-set length, and verify by subcooling on a TXV system or the charge chart on a fixed orifice.',
      parts: [],
      rootCauseWarning:
        'Find out why it was overcharged. If someone added refrigerant to chase a symptom, the original symptom is still there.',
    },
    evidence: {
      pattern_low_sh_high_sc: 'STRONG_FOR',
      subcooling_high: 'STRONG_FOR',
      superheat_low: 'FOR',
      condenser_split_high: 'FOR',
      compression_ratio_high: 'WEAK_FOR',
      high_pressure_switch_open: 'FOR',
      condenser_coil_clean: 'WEAK_FOR',
      subcooling_low: 'RULES_OUT',
      pattern_high_sh_low_sc: 'RULES_OUT',
      pattern_charge_normal: 'STRONG_AGAINST',
    },
  },
  {
    id: 'noncondensables',
    label: 'Non-condensables (air) in the system',
    category: 'refrigeration',
    statement:
      'Air or another non-condensable gas is occupying condenser volume, raising head pressure without adding refrigerant.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'high_bill'],
    prior: 0.03,
    confirmedBy: ['standing-pressure-vs-ambient'],
    confusedWith: [
      {
        hypothesisId: 'overcharge',
        separatedBy: 'measure-subcooling',
        how: 'Non-condensables leave subcooling roughly normal while head pressure climbs. Overcharge pushes subcooling up with it.',
      },
    ],
    safetyIds: ['refrigerant-handling', 'epa-608'],
    repair: {
      summary:
        'Recover the charge, replace the liquid line drier, evacuate to 500 microns and hold a decay test, then weigh in the nameplate charge.',
      parts: ['Liquid line filter drier', 'Refrigerant'],
      rootCauseWarning:
        'Air got in somehow — an improper evacuation, a leak on the low side that runs in a vacuum, or a system left open. Fix that too.',
    },
    evidence: {
      noncondensables_suspected: 'STRONG_FOR',
      condenser_split_high: 'STRONG_FOR',
      subcooling_normal: 'FOR',
      system_previously_opened: 'FOR',
      condenser_coil_clean: 'FOR',
      compression_ratio_high: 'WEAK_FOR',
      subcooling_high: 'WEAK_AGAINST',
      condenser_coil_dirty: 'AGAINST',
    },
  },
  {
    id: 'dirty-condenser',
    label: 'Dirty or obstructed condenser coil',
    category: 'refrigeration',
    statement:
      'The outdoor coil cannot reject heat — dirt, cottonwood, a crushed fin pack, or blocked airflow around the unit.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'high_bill', 'short_cycling', 'no_cooling'],
    prior: 0.14,
    confirmedBy: ['inspect-condenser-coil'],
    confusedWith: [
      {
        hypothesisId: 'condenser-fan-failure',
        separatedBy: 'observe-condenser-fan',
        how: 'Both raise head pressure. Look at the fan: not turning, turning slowly, or turning the wrong way is a fan problem, not a coil problem.',
      },
      {
        hypothesisId: 'overcharge',
        separatedBy: 'inspect-condenser-coil',
        how: 'Look at the coil before you recover refrigerant. Recovering charge to fix a dirty coil leaves the system undercharged once the coil is cleaned.',
      },
    ],
    safetyIds: ['electrical-shock', 'moving-parts'],
    repair: {
      summary:
        'Clean the coil from the inside out with an appropriate coil cleaner and low-pressure water, straighten fins, and clear obstructions around the unit.',
      parts: ['Coil cleaner'],
      rootCauseWarning:
        'Recheck the charge after cleaning. Readings taken on a dirty coil do not represent the system.',
    },
    evidence: {
      condenser_coil_dirty: 'PATHOGNOMONIC',
      condenser_split_high: 'STRONG_FOR',
      subcooling_high: 'WEAK_FOR',
      compression_ratio_high: 'FOR',
      high_pressure_switch_open: 'FOR',
      motor_amps_high: 'WEAK_FOR',
      condenser_coil_clean: 'RULES_OUT',
      condenser_split_low: 'STRONG_AGAINST',
    },
  },
  {
    id: 'condenser-fan-failure',
    label: 'Condenser fan motor failure',
    category: 'electrical',
    statement:
      'The outdoor fan motor itself has failed — an open winding or a seized bearing. As with the compressor, a failed run capacitor produces the same symptom on a healthy motor, so a bad capacitor argues against the motor being at fault.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'no_cooling', 'short_cycling'],
    prior: 0.09,
    confirmedBy: ['observe-condenser-fan'],
    confusedWith: [
      {
        hypothesisId: 'dirty-condenser',
        separatedBy: 'observe-condenser-fan',
        how: 'Watch the fan while the compressor runs. A stopped or slow fan is the fan; a clean-running fan with high head is the coil or the charge.',
      },
    ],
    safetyIds: ['electrical-shock', 'capacitor-stored-charge', 'moving-parts'],
    repair: {
      summary:
        'Test the run capacitor and the motor. Replace whichever failed, matching horsepower, RPM, rotation and capacitor rating.',
      parts: ['Condenser fan motor', 'Run capacitor'],
      rootCauseWarning:
        'A fan motor that failed from heat is often a symptom of a coil that was never cleaned. Check the coil while you are there.',
    },
    evidence: {
      condenser_fan_not_running: 'STRONG_FOR',
      // The capacitor is the cheaper explanation for a stopped fan, and it is
      // a separate hypothesis. A confirmed bad capacitor points there, not at
      // the motor.
      capacitor_failed: 'AGAINST',
      capacitor_out_of_tolerance: 'WEAK_AGAINST',
      capacitor_ok: 'FOR',
      condenser_split_high: 'FOR',
      high_pressure_switch_open: 'FOR',
      motor_locked_rotor: 'WEAK_FOR',
      condenser_fan_running: 'STRONG_AGAINST',
    },
  },
  {
    id: 'compressor-not-pumping',
    label: 'Compressor running but not pumping',
    category: 'refrigeration',
    statement:
      'The compressor turns but has lost its ability to compress — broken valves on a reciprocating compressor, or a damaged scroll set.',
    equipmentTypes: 'ANY',
    families: ['no_cooling', 'insufficient_cooling', 'insufficient_heat'],
    prior: 0.05,
    confirmedBy: ['compressor-pump-down-test', 'compressor-amp-draw'],
    confusedWith: [
      {
        hypothesisId: 'low-charge-leak',
        separatedBy: 'compressor-amp-draw',
        how: 'Both read low subcooling and a narrow split. A compressor that is not pumping draws well below RLA and cannot pull suction down; an undercharged system pulls suction down fine.',
      },
      {
        hypothesisId: 'reversing-valve-fault',
        separatedBy: 'reversing-valve-temperature-check',
        how: 'On a heat pump, a leaking reversing valve mimics a weak compressor exactly. Compare the temperatures of the valve\'s three tubes — a hot suction tube leaving the valve means internal bypass.',
      },
    ],
    safetyIds: ['electrical-shock', 'refrigerant-handling', 'capacitor-stored-charge'],
    repair: {
      summary:
        'Confirm with a pressure differential test before condemning. If the compressor is replaced, install a new liquid-line drier, evacuate to 500 microns and weigh in the charge.',
      parts: ['Compressor', 'Liquid line filter drier', 'Refrigerant', 'Run capacitor'],
      rootCauseWarning:
        'Compressors rarely fail on their own. Find what killed it — floodback, high head, low charge, a failing capacitor, voltage imbalance — or the replacement follows it.',
    },
    requiresEvidence: ['compressor_amps_low'],
    evidence: {
      compressor_amps_low: 'STRONG_FOR',
      condenser_split_low: 'STRONG_FOR',
      subcooling_low: 'FOR',
      superheat_high: 'WEAK_FOR',
      compressor_running: 'FOR',
      delta_t_low: 'FOR',
      // A compressor that is pumping normally is not a compressor that has
      // stopped pumping. Without these, normal readings leave the hypothesis
      // floating near the top on its prior alone.
      compressor_amps_normal: 'STRONG_AGAINST',
      superheat_normal: 'AGAINST',
      subcooling_normal: 'AGAINST',
      pattern_charge_normal: 'STRONG_AGAINST',
      motor_amps_high: 'AGAINST',
      leak_found: 'AGAINST',
    },
  },
  {
    id: 'compressor-electrical-failure',
    label: 'Compressor electrically failed (grounded, open, or shorted winding)',
    category: 'electrical',
    statement: 'The compressor motor windings have failed electrically.',
    equipmentTypes: 'ANY',
    families: ['no_cooling', 'unit_not_running', 'no_heat'],
    prior: 0.05,
    confirmedBy: ['compressor-winding-test'],
    confusedWith: [
      {
        hypothesisId: 'compressor-locked-rotor',
        separatedBy: 'compressor-winding-test',
        how: 'A locked rotor reads normal winding resistance and draws LRA; an electrically failed compressor reads open, shorted or grounded windings.',
      },
      {
        hypothesisId: 'run-capacitor-failed',
        separatedBy: 'capacitor-test',
        how: 'Test the capacitor first. It is a five-minute test and a cheap part, and a failed capacitor produces most of the same symptoms as a failed compressor.',
      },
    ],
    safetyIds: ['electrical-shock', 'capacitor-stored-charge'],
    repair: {
      summary:
        'Replace the compressor with a matching part, install a new liquid line drier (and a suction filter if the failure was a burnout), evacuate to 500 microns, and weigh in the charge.',
      parts: ['Compressor', 'Liquid line filter drier', 'Suction filter drier', 'Refrigerant', 'Contactor', 'Run capacitor'],
      rootCauseWarning:
        'Determine whether this was a burnout. An acid test on the oil decides whether the system needs a clean-up drier and a follow-up visit.',
    },
    requiresEvidence: ['winding_grounded', 'winding_open', 'winding_shorted'],
    evidence: {
      winding_grounded: 'PATHOGNOMONIC',
      winding_shorted: 'PATHOGNOMONIC',
      winding_open: 'STRONG_FOR',
      breaker_tripped: 'FOR',
      outdoor_unit_not_running: 'FOR',
      winding_ok: 'RULES_OUT',
      compressor_running: 'STRONG_AGAINST',
    },
  },
  {
    id: 'compressor-locked-rotor',
    label: 'Compressor mechanically seized',
    category: 'electrical',
    statement:
      'The compressor is being energized with good start components and the rotor still will not turn — it hums, draws LRA, and trips on its internal overload. This is the hypothesis for a mechanically seized compressor, which is why a failed run capacitor argues against it rather than for it: a bad capacitor produces the identical symptom on a compressor that is not seized at all.',
    equipmentTypes: 'ANY',
    families: ['no_cooling', 'unit_not_running'],
    prior: 0.04,
    confirmedBy: ['compressor-amp-draw', 'compressor-winding-test'],
    confusedWith: [
      {
        hypothesisId: 'run-capacitor-failed',
        separatedBy: 'capacitor-test',
        how: 'A failed run capacitor causes exactly this symptom on a single-phase compressor. Always test the capacitor before condemning a compressor for locked rotor.',
      },
    ],
    safetyIds: ['electrical-shock', 'capacitor-stored-charge'],
    repair: {
      summary:
        'Test the run capacitor first, then check for equalized pressures and whether a hard-start kit brings it around. A compressor that will not start with a good capacitor and equalized pressures is mechanically seized.',
      parts: ['Run capacitor', 'Hard start kit', 'Compressor'],
      rootCauseWarning:
        'A hard-start kit that gets a seized compressor running is a diagnostic step, not a repair. Say so in the report.',
    },
    requiresEvidence: ['motor_locked_rotor'],
    evidence: {
      motor_locked_rotor: 'STRONG_FOR',
      // A failed capacitor explains locked-rotor amps without the compressor
      // being seized, so it argues against seizure being the root cause. This
      // sign is the difference between a $30 part and a $2,000 one.
      capacitor_failed: 'STRONG_AGAINST',
      capacitor_out_of_tolerance: 'AGAINST',
      capacitor_ok: 'FOR',
      breaker_tripped: 'WEAK_FOR',
      outdoor_unit_not_running: 'WEAK_FOR',
      winding_ok: 'WEAK_FOR',
      compressor_running: 'RULES_OUT',
    },
  },
  {
    id: 'run-capacitor-failed',
    label: 'Run capacitor failed or out of tolerance',
    category: 'electrical',
    statement:
      'The run capacitor has lost capacitance, so the motor it serves cannot start or runs with high amp draw.',
    equipmentTypes: 'ANY',
    families: ['no_cooling', 'unit_not_running', 'insufficient_cooling', 'no_heat', 'no_airflow'],
    prior: 0.16,
    confirmedBy: ['capacitor-test'],
    confusedWith: [
      {
        hypothesisId: 'compressor-locked-rotor',
        separatedBy: 'capacitor-test',
        how: 'Measure the capacitor before touching the compressor. This is the single most common avoidable misdiagnosis in the trade.',
      },
      {
        hypothesisId: 'contactor-failure',
        separatedBy: 'contactor-test',
        how: 'A contactor that will not pull in gives no voltage to the motor at all; a bad capacitor gives voltage but no start.',
      },
    ],
    safetyIds: ['electrical-shock', 'capacitor-stored-charge'],
    repair: {
      summary:
        'Replace with a capacitor of the same µF rating and equal or higher voltage rating. Verify motor amp draw after replacement.',
      parts: ['Run capacitor'],
      rootCauseWarning:
        'Capacitors that fail repeatedly are usually a symptom of sustained high head pressure or a failing motor winding. If this is the second one, look further.',
    },
    requiresEvidence: ['capacitor_failed', 'capacitor_out_of_tolerance'],
    evidence: {
      capacitor_failed: 'PATHOGNOMONIC',
      capacitor_out_of_tolerance: 'STRONG_FOR',
      motor_locked_rotor: 'FOR',
      condenser_fan_not_running: 'FOR',
      motor_amps_high: 'FOR',
      outdoor_unit_not_running: 'WEAK_FOR',
      capacitor_ok: 'RULES_OUT',
    },
  },
  {
    id: 'contactor-failure',
    label: 'Contactor failure',
    category: 'electrical',
    statement:
      'The contactor is not closing, or its contacts are burned so badly that they cannot carry the load.',
    equipmentTypes: 'ANY',
    families: ['no_cooling', 'unit_not_running', 'short_cycling'],
    prior: 0.08,
    confirmedBy: ['contactor-test'],
    confusedWith: [
      {
        hypothesisId: 'low-voltage-short',
        separatedBy: 'control-voltage-test',
        how: 'If the coil is not getting 24 V, the contactor is fine and the problem is upstream in the control circuit.',
      },
    ],
    safetyIds: ['electrical-shock', 'arc-flash'],
    repair: {
      summary: 'Replace the contactor, matching pole count, coil voltage and contact rating.',
      parts: ['Contactor'],
      rootCauseWarning:
        'Pitted or welded contacts often come from short cycling or from high amp draw. Find out which before you leave.',
    },
    evidence: {
      contactor_not_pulling_in: 'PATHOGNOMONIC',
      contactor_pitted: 'STRONG_FOR',
      outdoor_unit_not_running: 'FOR',
      control_voltage_ok: 'WEAK_FOR',
      control_voltage_absent: 'STRONG_AGAINST',
      compressor_running: 'STRONG_AGAINST',
    },
  },

  // =========================================================================
  // Air side
  // =========================================================================
  {
    id: 'dirty-filter',
    label: 'Restricted air filter',
    category: 'airflow',
    statement: 'The filter is loaded or undersized and is choking the return air.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'frozen_coil', 'no_airflow', 'insufficient_heat', 'short_cycling'],
    prior: 0.18,
    confirmedBy: ['inspect-filter', 'total-external-static'],
    confusedWith: [
      {
        hypothesisId: 'dirty-evaporator',
        separatedBy: 'split-static-pressure',
        how: 'Read the pressure drop across the filter and across the coil separately. Whichever is disproportionate is the restriction.',
      },
      {
        hypothesisId: 'duct-restriction',
        separatedBy: 'split-static-pressure',
        how: 'If neither the filter nor the coil accounts for the total static, the duct system does.',
      },
    ],
    safetyIds: ['moving-parts'],
    repair: {
      summary:
        'Replace the filter and re-measure total external static. If a clean filter still drops more than about 0.1 in. w.c., the filter grille is undersized for the airflow.',
      parts: ['Air filter'],
      rootCauseWarning:
        'A filter that loads this fast in a properly sized grille suggests duct leakage pulling in unfiltered air, or a MERV rating the system was never designed for.',
    },
    evidence: {
      filter_restriction: 'PATHOGNOMONIC',
      filter_dirty: 'STRONG_FOR',
      static_pressure_high: 'STRONG_FOR',
      delta_t_high: 'FOR',
      evap_td_high: 'FOR',
      evaporator_iced: 'FOR',
      cfm_per_ton_low: 'FOR',
      superheat_high: 'WEAK_FOR',
      temp_rise_high: 'FOR',
      filter_clean: 'RULES_OUT',
      static_pressure_normal: 'STRONG_AGAINST',
    },
  },
  {
    id: 'dirty-evaporator',
    label: 'Dirty evaporator coil',
    category: 'airflow',
    statement:
      'The indoor coil is loaded with dirt on its upstream face, restricting air and insulating the fins.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'frozen_coil', 'no_airflow', 'high_bill'],
    prior: 0.1,
    confirmedBy: ['split-static-pressure', 'inspect-evaporator'],
    confusedWith: [
      {
        hypothesisId: 'dirty-filter',
        separatedBy: 'split-static-pressure',
        how: 'Measure the drop across each separately — they produce identical symptoms otherwise.',
      },
    ],
    safetyIds: ['moving-parts', 'electrical-shock'],
    repair: {
      summary:
        'Clean the coil from the upstream side with an appropriate cleaner, verify the drain pan and drain are clear afterward, then re-measure static pressure.',
      parts: ['Coil cleaner'],
      rootCauseWarning:
        'A coil this dirty means the filter has been bypassed or missing. Check the filter rack seal and the return plenum for leaks.',
    },
    evidence: {
      coil_restriction: 'PATHOGNOMONIC',
      evaporator_dirty: 'STRONG_FOR',
      static_pressure_high: 'FOR',
      delta_t_high: 'FOR',
      evaporator_iced: 'FOR',
      cfm_per_ton_low: 'FOR',
      filter_dirty: 'WEAK_FOR',
      filter_restriction: 'WEAK_AGAINST',
      static_pressure_normal: 'STRONG_AGAINST',
    },
  },
  {
    id: 'blower-motor-failure',
    label: 'Indoor blower motor or module failure',
    category: 'electrical',
    statement:
      'The indoor blower is not running, or an ECM module has failed so the motor will not come up to commanded speed.',
    equipmentTypes: 'ANY',
    families: ['no_airflow', 'no_cooling', 'no_heat', 'frozen_coil'],
    prior: 0.08,
    confirmedBy: ['blower-operation-check'],
    confusedWith: [
      {
        hypothesisId: 'run-capacitor-failed',
        separatedBy: 'capacitor-test',
        how: 'On a PSC blower, test the capacitor before the motor.',
      },
      {
        hypothesisId: 'control-board-fault',
        separatedBy: 'blower-voltage-at-board',
        how: 'Check whether the board is actually sending voltage (or a PWM/serial command on an ECM) to the blower. No command means the board; command present and no rotation means the motor.',
      },
    ],
    safetyIds: ['electrical-shock', 'capacitor-stored-charge', 'moving-parts'],
    repair: {
      summary:
        'Confirm the board is commanding the blower, then replace the failed motor or module with the correct part for this unit and re-verify airflow with static pressure.',
      parts: ['Blower motor', 'ECM control module', 'Run capacitor'],
      rootCauseWarning:
        'ECM modules commonly fail because of high static pressure. Measure static before installing the replacement or it fails again.',
    },
    evidence: {
      blower_not_running: 'PATHOGNOMONIC',
      evaporator_iced: 'FOR',
      capacitor_failed: 'FOR',
      temp_rise_high: 'FOR',
      limit_open: 'WEAK_FOR',
      blower_running: 'RULES_OUT',
    },
  },
  {
    id: 'duct-restriction',
    label: 'Duct system restriction or undersized ductwork',
    category: 'airflow',
    statement:
      'The duct system itself cannot pass the air the equipment needs — undersized trunks, crushed flex, closed dampers, or too little return.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'insufficient_heat', 'no_airflow', 'high_bill', 'noise'],
    prior: 0.1,
    confirmedBy: ['split-static-pressure'],
    confusedWith: [
      {
        hypothesisId: 'dirty-filter',
        separatedBy: 'split-static-pressure',
        how: 'A clean filter with high total static means the restriction is elsewhere.',
      },
    ],
    safetyIds: [],
    repair: {
      summary:
        'Correct the restriction: open dampers, replace crushed flex, add return area, or resize the trunk. This is a duct-modification quote, not a parts swap.',
      parts: [],
      rootCauseWarning:
        'Raising blower speed to mask high static increases noise and motor load without fixing the duct system, and on a PSC motor it may not increase airflow at all.',
    },
    evidence: {
      static_pressure_high: 'STRONG_FOR',
      return_undersized: 'STRONG_FOR',
      duct_damper_closed: 'FOR',
      filter_clean: 'FOR',
      coil_restriction: 'WEAK_AGAINST',
      filter_restriction: 'AGAINST',
      cfm_per_ton_low: 'FOR',
      static_pressure_normal: 'RULES_OUT',
    },
  },
  {
    id: 'frozen-evaporator',
    label: 'Frozen evaporator coil (symptom — the cause is upstream)',
    category: 'airflow',
    statement:
      'The indoor coil is iced. This is never the root cause; it is caused by low airflow or low refrigerant, and readings taken on an iced coil are meaningless.',
    equipmentTypes: 'ANY',
    families: ['frozen_coil', 'no_cooling', 'insufficient_cooling', 'water_leak'],
    prior: 0.1,
    confirmedBy: ['inspect-evaporator'],
    confusedWith: [],
    safetyIds: ['water-damage', 'electrical-shock'],
    repair: {
      summary:
        'Thaw the coil completely with the blower running and the compressor off, then diagnose the underlying airflow or charge problem before returning the system to service.',
      parts: [],
      rootCauseWarning:
        'Do not adjust the charge until the coil is fully thawed. Charging a frozen system reliably produces an overcharged one.',
    },
    evidence: {
      evaporator_iced: 'PATHOGNOMONIC',
      coil_below_freezing: 'STRONG_FOR',
      delta_t_high: 'FOR',
      static_pressure_high: 'FOR',
      superheat_high: 'WEAK_FOR',
    },
  },

  // =========================================================================
  // Controls / power
  // =========================================================================
  {
    id: 'no-power-to-unit',
    label: 'No power to the unit',
    category: 'electrical',
    statement:
      'The equipment is not being supplied — tripped breaker, pulled disconnect, blown fuse, or an open service switch.',
    equipmentTypes: 'ANY',
    families: ['unit_not_running', 'no_cooling', 'no_heat', 'no_airflow'],
    prior: 0.1,
    confirmedBy: ['line-voltage-check'],
    confusedWith: [
      {
        hypothesisId: 'compressor-electrical-failure',
        separatedBy: 'compressor-winding-test',
        how: 'A repeatedly tripping breaker with a grounded compressor is not a breaker problem. Check the windings before resetting it a second time.',
      },
    ],
    safetyIds: ['electrical-shock', 'arc-flash'],
    repair: {
      summary:
        'Restore power only after establishing why it was lost. A breaker that trips again on reset indicates a fault that must be found first.',
      parts: ['Fuses', 'Breaker', 'Disconnect'],
      rootCauseWarning:
        'Resetting a breaker without finding out why it tripped is not a repair and can be dangerous.',
    },
    evidence: {
      breaker_tripped: 'STRONG_FOR',
      disconnect_open: 'PATHOGNOMONIC',
      fuse_open: 'STRONG_FOR',
      outdoor_unit_not_running: 'FOR',
      blower_not_running: 'FOR',
      compressor_running: 'RULES_OUT',
    },
  },
  {
    id: 'low-voltage-short',
    label: 'Short in the low-voltage control wiring',
    category: 'electrical',
    statement:
      'A short in the 24 V circuit has opened the board fuse or is loading down the transformer.',
    equipmentTypes: 'ANY',
    families: ['unit_not_running', 'no_cooling', 'no_heat'],
    prior: 0.06,
    confirmedBy: ['control-voltage-test', 'low-voltage-isolation'],
    confusedWith: [
      {
        hypothesisId: 'transformer-fault',
        separatedBy: 'low-voltage-isolation',
        how: 'Disconnect the field wiring at the board. If the secondary voltage comes back with the load removed, the transformer is fine and the short is in the field wiring.',
      },
      {
        hypothesisId: 'control-board-fault',
        separatedBy: 'low-voltage-isolation',
        how: 'Same test. Voltage returning with everything disconnected points away from the board.',
      },
    ],
    safetyIds: ['electrical-shock'],
    repair: {
      summary:
        'Isolate the circuit section by section to find the short — the thermostat wire rubbed through at a sheet-metal edge is the classic — repair it, then replace the fuse.',
      parts: ['Low-voltage fuse', 'Thermostat wire'],
      rootCauseWarning:
        'Replacing the fuse without finding the short just destroys the new fuse. Find the short first.',
    },
    evidence: {
      fuse_open: 'STRONG_FOR',
      control_voltage_absent: 'STRONG_FOR',
      control_voltage_low: 'FOR',
      control_voltage_ok: 'STRONG_AGAINST',
    },
  },
  {
    id: 'transformer-fault',
    label: 'Control transformer failed',
    category: 'electrical',
    statement: 'The transformer is not producing rated secondary voltage.',
    equipmentTypes: 'ANY',
    families: ['unit_not_running', 'no_cooling', 'no_heat'],
    prior: 0.04,
    confirmedBy: ['control-voltage-test', 'low-voltage-isolation'],
    confusedWith: [
      {
        hypothesisId: 'low-voltage-short',
        separatedBy: 'low-voltage-isolation',
        how: 'Remove the secondary load. Voltage that returns means the transformer is good.',
      },
    ],
    safetyIds: ['electrical-shock'],
    repair: {
      summary:
        'Verify primary voltage and the correct primary tap, confirm the secondary stays low with the load removed, then replace with matching VA.',
      parts: ['Control transformer'],
      rootCauseWarning:
        'Transformers usually fail because of a short or an overload. Confirm the secondary circuit is sound before energizing the new one.',
    },
    evidence: {
      control_voltage_absent: 'STRONG_FOR',
      control_voltage_low: 'STRONG_FOR',
      fuse_open: 'WEAK_AGAINST',
      control_voltage_ok: 'RULES_OUT',
    },
  },
  {
    id: 'thermostat-fault',
    label: 'Thermostat or thermostat wiring fault',
    category: 'controls',
    statement: 'The thermostat is not sending the call, or the wiring between it and the equipment is open.',
    equipmentTypes: 'ANY',
    families: ['unit_not_running', 'no_cooling', 'no_heat', 'short_cycling'],
    prior: 0.09,
    confirmedBy: ['thermostat-jumper-test'],
    confusedWith: [
      {
        hypothesisId: 'control-board-fault',
        separatedBy: 'thermostat-jumper-test',
        how: 'Jumper R to the appropriate terminal at the equipment. If the unit runs, the equipment and board are fine and the problem is the thermostat or its wiring.',
      },
    ],
    safetyIds: ['electrical-shock'],
    repair: {
      summary:
        'Confirm by jumpering at the equipment, then repair the wiring or replace the thermostat. Verify the new thermostat is configured for the equipment type and staging.',
      parts: ['Thermostat', 'Thermostat wire'],
      rootCauseWarning:
        'A thermostat that lost its common wire or has a dead battery gives intermittent symptoms that look like an equipment fault.',
    },
    evidence: {
      thermostat_not_calling: 'PATHOGNOMONIC',
      no_24v_at_w: 'STRONG_FOR',
      outdoor_unit_not_running: 'WEAK_FOR',
      control_voltage_ok: 'WEAK_FOR',
      // Equipment that is running was told to run. A thermostat fault cannot
      // explain a system that is energized and operating.
      compressor_running: 'RULES_OUT',
      blower_running: 'AGAINST',
      condenser_fan_running: 'AGAINST',
    },
  },
  {
    id: 'condensate-float-open',
    label: 'Condensate float switch open',
    category: 'controls',
    statement:
      'A condensate safety switch has opened because the drain is blocked and the pan is holding water.',
    equipmentTypes: 'ANY',
    families: ['no_cooling', 'unit_not_running', 'water_leak'],
    prior: 0.07,
    confirmedBy: ['condensate-inspection'],
    confusedWith: [],
    safetyIds: ['water-damage', 'electrical-shock'],
    repair: {
      summary:
        'Clear the drain line and trap, flush the pan, verify the drain flows, and confirm the switch resets. Correct the trap and slope if the drain was never right.',
      parts: ['Condensate pan tablets', 'Drain fittings', 'Float switch'],
      rootCauseWarning:
        'Never bypass a float switch to keep a system running. It is the only thing standing between a plugged drain and a ceiling collapse.',
    },
    evidence: {
      float_switch_open: 'PATHOGNOMONIC',
      outdoor_unit_not_running: 'FOR',
      control_voltage_ok: 'WEAK_FOR',
    },
  },
  {
    id: 'control-board-fault',
    label: 'Control board failure',
    category: 'controls',
    statement: 'The integrated control board is not performing its sequence of operations correctly.',
    equipmentTypes: 'ANY',
    families: ['no_heat', 'no_cooling', 'unit_not_running', 'fault_code'],
    prior: 0.05,
    confirmedBy: ['board-output-verification'],
    confusedWith: [
      {
        hypothesisId: 'flame-sensor-fault',
        separatedBy: 'flame-current-test',
        how: 'A board is blamed for a great many flame-sense failures. Read the microamps before ordering a board.',
      },
      {
        hypothesisId: 'pressure-switch-fault',
        separatedBy: 'pressure-switch-draft-test',
        how: 'Boards will not proceed with an open pressure switch, which looks like a dead board. Measure the draft and the switch first.',
      },
    ],
    safetyIds: ['electrical-shock'],
    repair: {
      summary:
        'Condemn a board only after verifying that every input it needs is present and correct and that a commanded output is missing at the board terminal.',
      parts: ['Integrated control board'],
      rootCauseWarning:
        'Boards are the most over-replaced part in the trade. Prove the missing output at the board terminal with the input conditions satisfied before replacing it.',
    },
    requiresEvidence: ['gas_valve_no_voltage', 'inducer_not_running', 'ignitor_not_glowing'],
    evidence: {
      gas_valve_no_voltage: 'FOR',
      inducer_not_running: 'WEAK_FOR',
      ignitor_not_glowing: 'WEAK_FOR',
      unit_locked_out: 'WEAK_FOR',
      fault_code_present: 'WEAK_FOR',
      flame_current_low: 'STRONG_AGAINST',
      pressure_switch_not_closing: 'STRONG_AGAINST',
      draft_inadequate: 'STRONG_AGAINST',
      capacitor_failed: 'AGAINST',
    },
  },

  // =========================================================================
  // Gas heating
  // =========================================================================
  {
    id: 'flame-sensor-fault',
    label: 'Flame sensor dirty or failing to prove flame',
    category: 'heating',
    statement:
      'Burners light and then drop out because the control cannot read enough rectification current through the flame.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    families: ['no_heat', 'insufficient_heat', 'fault_code', 'short_cycling'],
    prior: 0.18,
    confirmedBy: ['flame-current-test'],
    confusedWith: [
      {
        hypothesisId: 'poor-burner-ground',
        separatedBy: 'flame-current-test',
        how: 'Rectification needs a solid ground path through the burner. If a clean sensor sitting properly in the flame still reads low, the ground is the next suspect, not the board.',
      },
      {
        hypothesisId: 'gas-valve-fault',
        separatedBy: 'flame-current-test',
        how: 'If the microamps are good and the flame still drops out, the control is dropping the valve for another reason.',
      },
    ],
    safetyIds: ['natural-gas', 'combustion', 'hot-surfaces', 'electrical-shock'],
    repair: {
      summary:
        'Clean the sensor with a non-abrasive pad, verify it sits in the flame, confirm the burner ground, and re-read the microamps. Replace the sensor if a clean one still reads below the board minimum.',
      parts: ['Flame sensor'],
      rootCauseWarning:
        'A sensor that fouls every season usually means the flame is not right — check burner condition and combustion air before writing it off as normal maintenance.',
    },
    requiresEvidence: ['flame_current_low', 'flame_drops_out'],
    evidence: {
      flame_drops_out: 'STRONG_FOR',
      flame_current_low: 'PATHOGNOMONIC',
      burners_light: 'FOR',
      unit_locked_out: 'WEAK_FOR',
      flame_current_ok: 'RULES_OUT',
      burners_not_lighting: 'STRONG_AGAINST',
      ignitor_not_glowing: 'RULES_OUT',
      pressure_switch_not_closing: 'RULES_OUT',
    },
  },
  {
    id: 'poor-burner-ground',
    label: 'Poor burner or chassis ground',
    category: 'heating',
    statement:
      'Flame rectification current is returning through a poor ground path, so the board sees a weak flame signal even with a clean sensor.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    families: ['no_heat', 'fault_code', 'short_cycling'],
    prior: 0.04,
    confirmedBy: ['burner-ground-test'],
    confusedWith: [
      {
        hypothesisId: 'flame-sensor-fault',
        separatedBy: 'burner-ground-test',
        how: 'Clean the sensor first — if microamps stay low with a clean sensor in a good flame, check the ground path from the burner assembly to the board common.',
      },
    ],
    safetyIds: ['natural-gas', 'combustion', 'electrical-shock'],
    repair: {
      summary:
        'Clean and tighten the burner assembly ground, verify the chassis ground and the neutral/ground bonding at the furnace, then re-read the microamps.',
      parts: ['Ground strap', 'Hardware'],
      rootCauseWarning:
        'Check the neutral-to-ground bond at the furnace disconnect. A furnace fed from a subpanel with a floating ground produces intermittent flame-sense failures that look exactly like a dirty sensor.',
    },
    evidence: {
      flame_current_low: 'STRONG_FOR',
      burner_ground_poor: 'PATHOGNOMONIC',
      flame_drops_out: 'FOR',
      flame_current_ok: 'RULES_OUT',
    },
  },
  {
    id: 'ignitor-fault',
    label: 'Hot surface ignitor failed',
    category: 'heating',
    statement: 'The ignitor is open or cracked and will not reach ignition temperature.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    families: ['no_heat', 'fault_code'],
    prior: 0.12,
    confirmedBy: ['ignitor-test'],
    confusedWith: [
      {
        hypothesisId: 'control-board-fault',
        separatedBy: 'ignitor-test',
        how: 'Check for line voltage at the ignitor during the warm-up period. Voltage with no glow is the ignitor; no voltage is the board (or an earlier interlock).',
      },
    ],
    safetyIds: ['electrical-shock', 'hot-surfaces', 'natural-gas'],
    repair: {
      summary:
        'Replace with the correct ignitor for this furnace and set the position per the manufacturer\'s dimension. Do not touch a silicon carbide element with bare fingers.',
      parts: ['Hot surface ignitor'],
      rootCauseWarning:
        'Repeated ignitor failure often comes from a cracked ignitor holder, a mis-set position, or a furnace short cycling on a limit. Look for the reason.',
    },
    requiresEvidence: ['ignitor_not_glowing', 'ignitor_open'],
    evidence: {
      ignitor_not_glowing: 'STRONG_FOR',
      ignitor_open: 'PATHOGNOMONIC',
      burners_not_lighting: 'FOR',
      inducer_running: 'WEAK_FOR',
      ignitor_glows: 'RULES_OUT',
      burners_light: 'RULES_OUT',
      flame_current_low: 'STRONG_AGAINST',
    },
  },
  {
    id: 'pressure-switch-fault',
    label: 'Pressure switch failed (draft is adequate)',
    category: 'heating',
    statement:
      'The inducer is producing the required draft but the pressure switch will not close.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    families: ['no_heat', 'fault_code'],
    prior: 0.06,
    confirmedBy: ['pressure-switch-draft-test'],
    confusedWith: [
      {
        hypothesisId: 'blocked-flue',
        separatedBy: 'pressure-switch-draft-test',
        how: 'Measure the actual negative pressure at the switch port. Draft below the setpoint means the switch is doing its job and the restriction is real — the switch is not the fault.',
      },
      {
        hypothesisId: 'condensate-blockage',
        separatedBy: 'condensate-inspection',
        how: 'On a condensing furnace, a plugged trap is a far more common reason the switch will not close than a failed switch.',
      },
      {
        hypothesisId: 'inducer-motor-fault',
        separatedBy: 'pressure-switch-draft-test',
        how: 'A weak inducer produces some draft but not enough. The manometer reading separates a weak inducer from a bad switch.',
      },
    ],
    safetyIds: ['co-exposure', 'natural-gas', 'electrical-shock'],
    repair: {
      summary:
        'Replace with a switch of the same setpoint and configuration. Never jumper a pressure switch to run the furnace — it is what proves the flue is clear.',
      parts: ['Pressure switch'],
      rootCauseWarning:
        'Only replace the switch after proving the draft is adequate. Most "bad pressure switch" calls are blocked flues, plugged traps, or cracked inducer housings.',
    },
    requiresEvidence: ['draft_adequate_switch_open'],
    evidence: {
      draft_adequate_switch_open: 'PATHOGNOMONIC',
      pressure_switch_not_closing: 'FOR',
      inducer_running: 'FOR',
      draft_inadequate: 'RULES_OUT',
      condensate_blocked: 'STRONG_AGAINST',
      flue_blocked: 'STRONG_AGAINST',
    },
  },
  {
    id: 'blocked-flue',
    label: 'Blocked flue, intake, or vent',
    category: 'heating',
    statement:
      'The vent or combustion air intake is obstructed, so the inducer cannot develop the required draft.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    families: ['no_heat', 'fault_code', 'odor'],
    prior: 0.06,
    confirmedBy: ['flue-inspection', 'pressure-switch-draft-test'],
    confusedWith: [
      {
        hypothesisId: 'pressure-switch-fault',
        separatedBy: 'pressure-switch-draft-test',
        how: 'The manometer decides. Inadequate draft means the restriction is real.',
      },
    ],
    safetyIds: ['co-exposure', 'combustion', 'natural-gas', 'fall-hazard'],
    repair: {
      summary:
        'Locate and clear the obstruction — bird nest, ice, collapsed liner, an intake screened by snow — and verify the draft afterward against the switch setpoint.',
      parts: ['Vent components as found'],
      rootCauseWarning:
        'A blocked flue is a carbon monoxide hazard. If the appliance has been running against a partial blockage, check ambient CO and inspect the heat exchanger before returning it to service.',
    },
    evidence: {
      flue_blocked: 'PATHOGNOMONIC',
      draft_inadequate: 'STRONG_FOR',
      pressure_switch_not_closing: 'FOR',
      inducer_running: 'FOR',
      draft_adequate_switch_open: 'RULES_OUT',
    },
  },
  {
    id: 'condensate-blockage',
    label: 'Condensate trap or drain blocked (condensing furnace)',
    category: 'heating',
    statement:
      'The condensate trap or drain is plugged, backing water into the inducer or collector box and opening the pressure switch.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    families: ['no_heat', 'fault_code', 'water_leak'],
    prior: 0.09,
    confirmedBy: ['condensate-inspection'],
    confusedWith: [
      {
        hypothesisId: 'pressure-switch-fault',
        separatedBy: 'condensate-inspection',
        how: 'Pull the trap and check it before condemning the switch. On a 90%+ furnace this is the most common reason the switch will not make.',
      },
    ],
    safetyIds: ['co-exposure', 'water-damage', 'electrical-shock'],
    repair: {
      summary:
        'Clean the trap, drain line, and collector box drain ports, then verify free flow and that the pressure switch makes on a call.',
      parts: ['Condensate trap', 'Drain tubing'],
      rootCauseWarning:
        'Condensate is acidic. Check the collector box and inducer housing for corrosion damage while the trap is off.',
    },
    evidence: {
      condensate_blocked: 'PATHOGNOMONIC',
      pressure_switch_not_closing: 'STRONG_FOR',
      draft_inadequate: 'FOR',
      inducer_running: 'FOR',
      draft_adequate_switch_open: 'STRONG_AGAINST',
    },
  },
  {
    id: 'inducer-motor-fault',
    label: 'Inducer motor failed or weak',
    category: 'heating',
    statement:
      'The draft inducer will not start, or spins too slowly to develop the required negative pressure.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    families: ['no_heat', 'fault_code', 'noise'],
    prior: 0.07,
    confirmedBy: ['inducer-operation-check', 'pressure-switch-draft-test'],
    confusedWith: [
      {
        hypothesisId: 'control-board-fault',
        separatedBy: 'inducer-operation-check',
        how: 'Verify line voltage at the inducer on a call. Voltage present and no rotation is the motor; no voltage is the board or an interlock ahead of it.',
      },
    ],
    safetyIds: ['electrical-shock', 'moving-parts', 'co-exposure'],
    repair: {
      summary:
        'Replace the inducer assembly, and inspect the housing and gasket — a cracked housing or a blown gasket loses draft with a perfectly good motor.',
      parts: ['Inducer motor assembly', 'Inducer gasket'],
      rootCauseWarning:
        'Check the wheel for corrosion or debris before assuming the motor is at fault.',
    },
    evidence: {
      inducer_not_running: 'PATHOGNOMONIC',
      draft_inadequate: 'STRONG_FOR',
      pressure_switch_not_closing: 'FOR',
      inducer_running: 'STRONG_AGAINST',
      draft_adequate_switch_open: 'RULES_OUT',
    },
  },
  {
    id: 'gas-valve-fault',
    label: 'Gas valve failed',
    category: 'heating',
    statement:
      'The valve is being commanded open but is not passing gas, or is not regulating manifold pressure.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    families: ['no_heat', 'fault_code'],
    prior: 0.05,
    confirmedBy: ['gas-valve-voltage-test', 'manifold-pressure-test'],
    confusedWith: [
      {
        hypothesisId: 'gas-supply-pressure',
        separatedBy: 'manifold-pressure-test',
        how: 'Read the inlet pressure under load. Low inlet pressure is a supply problem — the valve cannot regulate what it is not being given.',
      },
      {
        hypothesisId: 'control-board-fault',
        separatedBy: 'gas-valve-voltage-test',
        how: 'No 24 V at the valve when it should be commanded means the board or an interlock, not the valve.',
      },
    ],
    safetyIds: ['natural-gas', 'combustion', 'burns'],
    repair: {
      summary:
        'Confirm 24 V at the valve terminals during the trial for ignition and adequate inlet pressure, then replace the valve. Leak-test every joint and verify manifold pressure against the rating plate.',
      parts: ['Gas valve'],
      rootCauseWarning:
        'Set the manifold pressure to the rating plate after replacement and clock the meter. A valve installed without setting the pressure can overfire the furnace.',
    },
    requiresEvidence: ['gas_valve_voltage_present'],
    evidence: {
      gas_valve_voltage_present: 'FOR',
      burners_not_lighting: 'STRONG_FOR',
      ignitor_glows: 'FOR',
      gas_pressure_low: 'WEAK_AGAINST',
      gas_valve_no_voltage: 'RULES_OUT',
      burners_light: 'STRONG_AGAINST',
      flame_current_low: 'AGAINST',
    },
  },
  {
    id: 'gas-supply-pressure',
    label: 'Gas supply pressure low or piping undersized',
    category: 'heating',
    statement:
      'The appliance is not getting the inlet pressure it needs under load — regulator, meter, or undersized piping.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    families: ['no_heat', 'insufficient_heat', 'fault_code'],
    prior: 0.05,
    confirmedBy: ['manifold-pressure-test', 'gas-meter-clock'],
    confusedWith: [
      {
        hypothesisId: 'gas-valve-fault',
        separatedBy: 'manifold-pressure-test',
        how: 'Inlet pressure is the separator. Adequate inlet with low manifold points at the valve; low inlet points upstream.',
      },
    ],
    safetyIds: ['natural-gas', 'combustion'],
    repair: {
      summary:
        'Measure inlet pressure with every gas appliance firing. Refer undersized piping, a failing regulator, or an undersized meter to the gas utility or a licensed gas fitter as the scope requires.',
      parts: [],
      rootCauseWarning:
        'Do not raise manifold pressure to compensate for low inlet pressure. That overfires the burner as soon as supply is restored.',
    },
    evidence: {
      gas_pressure_low: 'PATHOGNOMONIC',
      gas_underfired: 'STRONG_FOR',
      burners_not_lighting: 'WEAK_FOR',
      flame_drops_out: 'WEAK_FOR',
      temp_rise_low: 'FOR',
      gas_overfired: 'RULES_OUT',
    },
  },
  {
    id: 'limit-circuit-open',
    label: 'Limit circuit open (furnace overheating)',
    category: 'heating',
    statement:
      'A high-limit switch has opened because the heat exchanger is running hotter than design — almost always an airflow problem.',
    equipmentTypes: ['GAS_FURNACE', 'ELECTRIC_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    families: ['no_heat', 'short_cycling', 'fault_code'],
    prior: 0.08,
    confirmedBy: ['temperature-rise-test', 'total-external-static'],
    confusedWith: [
      {
        hypothesisId: 'dirty-filter',
        separatedBy: 'total-external-static',
        how: 'The limit is the messenger. Static pressure and temperature rise tell you what is actually restricting the air.',
      },
      {
        hypothesisId: 'blower-motor-failure',
        separatedBy: 'blower-operation-check',
        how: 'A blower that is not running at all trips the limit within a minute or two of the burner firing.',
      },
    ],
    safetyIds: ['co-exposure', 'hot-surfaces', 'electrical-shock'],
    repair: {
      summary:
        'Find and correct the airflow restriction, then verify temperature rise falls inside the rating plate range. Replace the limit only if it opens with rise inside the rated range.',
      parts: ['High limit switch'],
      rootCauseWarning:
        'Never jumper or remove a limit switch. It is the control preventing the heat exchanger from being cooked, and defeating it can crack the exchanger and vent CO into the house.',
    },
    evidence: {
      limit_open: 'PATHOGNOMONIC',
      temp_rise_high: 'STRONG_FOR',
      static_pressure_high: 'STRONG_FOR',
      filter_restriction: 'FOR',
      blower_not_running: 'STRONG_FOR',
      coil_restriction: 'FOR',
      temp_rise_low: 'STRONG_AGAINST',
    },
  },
  {
    id: 'heat-exchanger-concern',
    label: 'Heat exchanger integrity concern',
    category: 'heating',
    statement:
      'Evidence suggests the heat exchanger may be compromised. This is a safety finding, not a routine repair.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    families: ['no_heat', 'odor', 'short_cycling', 'fault_code'],
    prior: 0.02,
    confirmedBy: ['heat-exchanger-inspection'],
    confusedWith: [],
    safetyIds: ['co-exposure', 'combustion', 'natural-gas'],
    repair: {
      summary:
        'Perform a documented heat exchanger inspection per the manufacturer\'s procedure, with combustion analysis and CO measurement in the supply air. A confirmed breach means the furnace is shut off and tagged, the customer is informed in writing, and the unit is not returned to service.',
      parts: ['Heat exchanger', 'Furnace replacement'],
      rootCauseWarning:
        'A suspected heat exchanger breach is a life-safety issue. Do not leave the appliance operating while parts are sourced, and put the finding and the customer notification in the report.',
    },
    requiresEvidence: ['heat_exchanger_visual_defect'],
    evidence: {
      heat_exchanger_visual_defect: 'PATHOGNOMONIC',
      rollout_tripped: 'FOR',
      flame_drops_out: 'WEAK_FOR',
      temp_rise_high: 'WEAK_FOR',
      limit_open: 'WEAK_FOR',
    },
  },
  {
    id: 'rollout-tripped',
    label: 'Flame rollout switch tripped',
    category: 'heating',
    statement:
      'Flame has left the burner box. The rollout switch has done its job; the cause must be found before resetting it.',
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    families: ['no_heat', 'fault_code', 'odor'],
    prior: 0.03,
    confirmedBy: ['flue-inspection', 'heat-exchanger-inspection'],
    confusedWith: [],
    safetyIds: ['co-exposure', 'combustion', 'natural-gas', 'burns'],
    repair: {
      summary:
        'Find why flame rolled out — blocked heat exchanger passages, a blocked flue, a cracked exchanger, or a failed inducer — correct it, then replace the rollout switch (rollouts are one-time devices on many furnaces).',
      parts: ['Rollout switch'],
      rootCauseWarning:
        'Never reset a rollout switch and leave. Flame outside the burner box means the combustion path is obstructed or the exchanger has failed, and both are CO hazards.',
    },
    evidence: {
      rollout_tripped: 'PATHOGNOMONIC',
      flue_blocked: 'FOR',
      heat_exchanger_visual_defect: 'FOR',
      inducer_not_running: 'FOR',
    },
  },
  {
    id: 'electric-heat-element-open',
    label: 'Electric heat element or sequencer open',
    category: 'heating',
    statement: 'One or more electric heat elements are not energizing.',
    equipmentTypes: ['ELECTRIC_FURNACE', 'AIR_HANDLER', 'HEAT_PUMP', 'PACKAGE_UNIT'],
    families: ['no_heat', 'insufficient_heat'],
    prior: 0.07,
    confirmedBy: ['electric-heat-amp-draw'],
    confusedWith: [
      {
        hypothesisId: 'aux-heat-not-energizing',
        separatedBy: 'thermostat-jumper-test',
        how: 'Confirm the thermostat is actually calling for W/auxiliary heat before testing elements — a heat pump that never calls aux looks identical.',
      },
    ],
    safetyIds: ['electrical-shock', 'arc-flash'],
    repair: {
      summary:
        'Measure amp draw on each heater leg. Replace the open element, sequencer, or fuse link, and find out why a fuse link opened before replacing it.',
      parts: ['Heating element', 'Sequencer', 'Thermal fuse link'],
      rootCauseWarning:
        'An open thermal fuse link almost always means the blower was not moving air. Fix the airflow or the new link opens too.',
    },
    evidence: {
      electric_element_open: 'PATHOGNOMONIC',
      temp_rise_low: 'STRONG_FOR',
      blower_running: 'WEAK_FOR',
      aux_heat_not_energizing: 'FOR',
    },
  },

  // =========================================================================
  // Heat pump specific
  // =========================================================================
  {
    id: 'reversing-valve-fault',
    label: 'Reversing valve not shifting or bypassing internally',
    category: 'controls',
    statement:
      'The reversing valve is stuck, not being energized, or leaking hot gas internally between ports.',
    equipmentTypes: ['HEAT_PUMP', 'DUAL_FUEL', 'MINI_SPLIT', 'PACKAGE_UNIT', 'GEOTHERMAL', 'VRF'],
    families: ['no_cooling', 'no_heat', 'insufficient_heat', 'insufficient_cooling'],
    prior: 0.05,
    confirmedBy: ['reversing-valve-temperature-check'],
    confusedWith: [
      {
        hypothesisId: 'compressor-not-pumping',
        separatedBy: 'reversing-valve-temperature-check',
        how: 'An internally bypassing valve mimics a weak compressor exactly. Compare the temperature of the three tubes at the valve: a suction tube that is warm leaving the valve means hot gas is bypassing internally.',
      },
    ],
    safetyIds: ['electrical-shock', 'refrigerant-handling', 'hot-surfaces'],
    repair: {
      summary:
        'Verify 24 V at the solenoid in the mode that energizes it, then check whether the valve shifts by feeling the port temperatures. Replace the solenoid coil first if it is open — it is a fraction of the cost of the valve.',
      parts: ['Reversing valve solenoid coil', 'Reversing valve', 'Liquid line filter drier', 'Refrigerant'],
      rootCauseWarning:
        'Test the solenoid coil before condemning the valve body. An open coil is a common and inexpensive failure that presents identically.',
    },
    evidence: {
      reversing_valve_not_shifting: 'PATHOGNOMONIC',
      condenser_split_low: 'WEAK_FOR',
      delta_t_low: 'FOR',
      compressor_running: 'FOR',
      compressor_amps_low: 'WEAK_FOR',
      pattern_charge_normal: 'WEAK_FOR',
    },
  },
  {
    id: 'defrost-control-fault',
    label: 'Defrost control or sensor fault',
    category: 'controls',
    statement:
      'The outdoor unit is not defrosting when it should, or is not terminating defrost properly.',
    equipmentTypes: ['HEAT_PUMP', 'DUAL_FUEL', 'MINI_SPLIT', 'PACKAGE_UNIT', 'GEOTHERMAL'],
    families: ['insufficient_heat', 'no_heat', 'fault_code'],
    prior: 0.06,
    confirmedBy: ['defrost-cycle-test'],
    confusedWith: [
      {
        hypothesisId: 'low-charge-leak',
        separatedBy: 'measure-subcooling',
        how: 'A low charge in heating mode also ices the outdoor coil. Check the charge before condemning the defrost board.',
      },
    ],
    safetyIds: ['electrical-shock', 'moving-parts'],
    repair: {
      summary:
        'Verify the defrost thermostat/sensor reads correctly at coil temperature, force a defrost per the board procedure, and confirm the cycle initiates, reverses, and terminates.',
      parts: ['Defrost board', 'Defrost thermostat/sensor'],
      rootCauseWarning:
        'An outdoor coil that ices heavily with a correct charge and a working defrost cycle may be sitting too low, drainage-blocked, or in standing water. Look at the installation.',
    },
    evidence: {
      defrost_not_initiating: 'STRONG_FOR',
      defrost_not_terminating: 'STRONG_FOR',
      outdoor_coil_iced: 'STRONG_FOR',
      fault_code_present: 'WEAK_FOR',
      subcooling_low: 'AGAINST',
      pattern_high_sh_low_sc: 'STRONG_AGAINST',
    },
  },
  {
    id: 'aux-heat-not-energizing',
    label: 'Auxiliary/emergency heat not energizing',
    category: 'controls',
    statement:
      'The heat pump is running but supplemental heat is not coming on when the thermostat calls for it.',
    equipmentTypes: ['HEAT_PUMP', 'DUAL_FUEL', 'AIR_HANDLER', 'PACKAGE_UNIT'],
    families: ['insufficient_heat', 'no_heat'],
    prior: 0.05,
    confirmedBy: ['thermostat-jumper-test', 'electric-heat-amp-draw'],
    confusedWith: [
      {
        hypothesisId: 'electric-heat-element-open',
        separatedBy: 'electric-heat-amp-draw',
        how: 'If W is energized at the air handler and the elements still draw no current, the elements or sequencers are the fault, not the control path.',
      },
    ],
    safetyIds: ['electrical-shock', 'arc-flash'],
    repair: {
      summary:
        'Verify the thermostat is configured for the correct equipment type and staging, that W/AUX is landed correctly, and that the outdoor thermostat lockout (if fitted) is not holding it off.',
      parts: ['Thermostat', 'Sequencer', 'Relay'],
      rootCauseWarning:
        'A thermostat configured as conventional rather than heat pump is a very common cause and costs nothing but configuration time.',
    },
    evidence: {
      aux_heat_not_energizing: 'PATHOGNOMONIC',
      electric_element_open: 'FOR',
      temp_rise_low: 'FOR',
      thermostat_not_calling: 'FOR',
    },
  },

  // =========================================================================
  // Not-a-failure explanations. The engine must be able to conclude that the
  // equipment is working and the complaint has a different explanation.
  // =========================================================================
  {
    id: 'capacity-vs-load',
    label: 'Equipment operating correctly but undersized for the load',
    category: 'refrigeration',
    statement:
      'Every measurement is in range. The system is doing what it was built to do and cannot keep up with the load it is being asked to carry.',
    equipmentTypes: 'ANY',
    families: ['insufficient_cooling', 'insufficient_heat', 'high_bill'],
    prior: 0.05,
    confirmedBy: ['load-context-questions'],
    confusedWith: [
      {
        hypothesisId: 'duct-restriction',
        separatedBy: 'total-external-static',
        how: 'Rule out the duct system before telling a customer their equipment is undersized — it is an expensive conclusion to get wrong.',
      },
    ],
    safetyIds: [],
    repair: {
      summary:
        'Document the measured performance, then address the load: envelope, insulation, duct leakage into unconditioned space, solar gain, or genuinely undersized equipment. A load calculation is the next step, not a part.',
      parts: [],
      rootCauseWarning:
        'Do not adjust a correct charge to chase a comfort complaint. If the readings are right, the answer is not in the refrigerant circuit.',
    },
    evidence: {
      pattern_charge_normal: 'STRONG_FOR',
      static_pressure_normal: 'FOR',
      superheat_normal: 'FOR',
      subcooling_normal: 'FOR',
      capacitor_ok: 'WEAK_FOR',
      condenser_coil_clean: 'WEAK_FOR',
      filter_clean: 'WEAK_FOR',
      delta_t_high: 'AGAINST',
      superheat_high: 'STRONG_AGAINST',
      subcooling_low: 'STRONG_AGAINST',
      static_pressure_high: 'STRONG_AGAINST',
    },
  },
];

export const HYPOTHESIS_MAP: Record<string, Hypothesis> = Object.fromEntries(
  HYPOTHESES.map((h) => [h.id, h]),
);

export function getHypothesis(id: string): Hypothesis | undefined {
  return HYPOTHESIS_MAP[id];
}
