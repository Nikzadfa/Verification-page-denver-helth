/**
 * Test catalogue — everything the engine can ask a technician to do.
 *
 * `costMinutes` and `riskFactor` are what stop the engine from opening with
 * "recover the charge and weigh it in". A test that takes 60 seconds and
 * separates two hypotheses beats a test that takes an hour and separates three.
 *
 * `yields` must list every finding the test can produce, including the
 * negative ones. The planner computes expected information gain over exactly
 * this set, so a test that omits its negative outcomes will be under-valued
 * and never chosen.
 */

import type { DiagnosticTest } from '../types';

export const TESTS: DiagnosticTest[] = [
  // =========================================================================
  // Intake questions — cheap, high yield, always first
  // =========================================================================
  {
    id: 'confirm-unit-running',
    label: 'Is the equipment running right now?',
    kind: 'QUESTION',
    category: 'controls',
    instruction:
      'With the thermostat calling, tell me what is actually running: the indoor blower, the outdoor fan, the compressor — or nothing at all.',
    expected:
      'On a cooling call, all three run together. On a heating call, the inducer starts first and the blower follows after the on-delay.',
    yields: [
      'outdoor_unit_not_running',
      'compressor_running',
      'condenser_fan_not_running',
      'condenser_fan_running',
      'blower_not_running',
      'blower_running',
    ],
    collects: [],
    options: [
      { value: 'all_running', label: 'Everything is running', findings: ['compressor_running', 'condenser_fan_running', 'blower_running'] },
      { value: 'nothing', label: 'Nothing runs at all', findings: ['outdoor_unit_not_running', 'blower_not_running'] },
      { value: 'indoor_only', label: 'Blower runs, outdoor unit does not', findings: ['blower_running', 'outdoor_unit_not_running'] },
      { value: 'outdoor_only', label: 'Outdoor unit runs, blower does not', findings: ['blower_not_running', 'compressor_running'] },
      { value: 'fan_no_compressor', label: 'Outdoor fan runs, compressor does not', findings: ['condenser_fan_running', 'outdoor_unit_not_running'] },
      { value: 'compressor_no_fan', label: 'Compressor runs, outdoor fan does not', findings: ['compressor_running', 'condenser_fan_not_running'] },
    ],
    // Heat-only equipment has no outdoor unit to ask about; the ignition
    // sequence observation is the equivalent first step there.
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 1,
    riskFactor: 1,
    hazardIds: ['moving-parts'],
  },
  {
    id: 'inspect-filter',
    label: 'Check the air filter',
    kind: 'INSPECTION',
    category: 'airflow',
    instruction:
      'Pull the filter and hold it up to a light. Note the size, the MERV rating, and whether light passes through it.',
    expected:
      'A serviceable filter passes light across its whole face. If you cannot see light through it, it is restricting.',
    yields: ['filter_dirty', 'filter_clean'],
    collects: ['filter_condition'],
    options: [
      { value: 'clean', label: 'Clean — light passes through', findings: ['filter_clean'] },
      { value: 'dirty', label: 'Loaded — light barely passes', findings: ['filter_dirty'] },
      { value: 'blocked', label: 'Completely blocked / collapsed', findings: ['filter_dirty'] },
      { value: 'missing', label: 'No filter installed', findings: ['filter_clean'] },
    ],
    equipmentTypes: 'ANY',
    costMinutes: 2,
    riskFactor: 1,
    hazardIds: ['moving-parts'],
    procedureSlug: 'filter-inspection',
  },
  {
    id: 'inspect-condenser-coil',
    label: 'Inspect the condenser coil',
    kind: 'INSPECTION',
    category: 'refrigeration',
    instruction:
      'Look at the outdoor coil from the inside out, not just the outer face. Check for dirt packed between the fin rows, cottonwood on the intake side, bent or crushed fins, and anything blocking airflow around the unit.',
    expected: 'A clean coil you can see daylight through, with clear space around the unit.',
    yields: ['condenser_coil_dirty', 'condenser_coil_clean'],
    collects: ['condenser_coil_condition'],
    options: [
      { value: 'clean', label: 'Clean, unobstructed', findings: ['condenser_coil_clean'] },
      { value: 'dirty', label: 'Dirty or packed with debris', findings: ['condenser_coil_dirty'] },
      { value: 'obstructed', label: 'Clean but blocked by shrubs/fence/recirculation', findings: ['condenser_coil_dirty'] },
    ],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 3,
    riskFactor: 1,
    hazardIds: ['electrical-shock', 'moving-parts'],
    procedureSlug: 'condenser-coil-inspection',
  },
  {
    id: 'inspect-evaporator',
    label: 'Inspect the evaporator coil',
    kind: 'INSPECTION',
    category: 'airflow',
    instruction:
      'Open the coil access and look at the UPSTREAM face of the coil — the side the return air hits first. Dirt collects there and is invisible from the downstream side. Note any ice.',
    expected: 'Clean fins with no matting and no ice.',
    yields: ['evaporator_dirty', 'evaporator_iced'],
    collects: ['evaporator_condition'],
    options: [
      { value: 'clean', label: 'Clean', findings: [] },
      { value: 'dirty', label: 'Dirty on the upstream face', findings: ['evaporator_dirty'] },
      { value: 'iced', label: 'Iced over', findings: ['evaporator_iced'] },
    ],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 8,
    riskFactor: 1,
    hazardIds: ['electrical-shock', 'moving-parts'],
    procedureSlug: 'evaporator-inspection',
  },

  // =========================================================================
  // Refrigeration measurements
  // =========================================================================
  {
    id: 'measure-superheat',
    label: 'Measure superheat',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'Connect to the suction service port. Record the suction pressure (or the saturation temperature straight off a digital manifold — that is preferred, it avoids a chart conversion) and the suction line temperature taken on a clean, insulated section within about 6 inches of the service valve. Let the system run at least 15 minutes at steady state first.',
    expected:
      'On a TXV/EEV, roughly 8–14 °F. On a fixed orifice, whatever the charge chart gives for the current indoor wet bulb and outdoor dry bulb.',
    yields: ['superheat_high', 'superheat_low', 'superheat_normal', 'superheat_negative', 'floodback_risk'],
    collects: ['suction_pressure', 'suction_sat_temp', 'suction_line_temp', 'refrigerant', 'metering_device'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 12,
    riskFactor: 1.2,
    hazardIds: ['refrigerant-handling', 'frostbite', 'high-pressure-system', 'epa-608'],
    procedureSlug: 'measure-superheat',
  },
  {
    id: 'measure-subcooling',
    label: 'Measure subcooling',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'The manifold is already connected from the superheat reading, so this is the other half of the same hookup. Record the liquid pressure (or liquid saturation temperature) and the liquid line temperature at the service valve. On a zeotropic blend the saturation temperature for subcooling is the BUBBLE point — using the dew point instead throws the reading off by the full glide.',
    expected:
      'Whatever the nameplate or charging chart specifies for this unit — commonly 8–13 °F, but read the label rather than assuming.',
    yields: [
      'subcooling_high',
      'subcooling_low',
      'subcooling_normal',
      'pattern_high_sh_low_sc',
      'pattern_high_sh_high_sc',
      'pattern_low_sh_high_sc',
      'pattern_low_sh_low_sc',
      'pattern_charge_normal',
    ],
    collects: ['liquid_pressure', 'liquid_sat_temp', 'liquid_line_temp', 'target_subcooling'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 8,
    riskFactor: 1.2,
    hazardIds: ['refrigerant-handling', 'frostbite', 'high-pressure-system', 'epa-608'],
    // Nobody connects a manifold twice. Superheat is the more informative half
    // and comes first; subcooling is read off the same hookup, which is why it
    // is cheap here and why it must not be reachable without it.
    prerequisiteTestIds: ['measure-superheat'],
    procedureSlug: 'measure-subcooling',
  },
  {
    id: 'measure-condenser-split',
    label: 'Measure condenser split',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'Take the outdoor dry-bulb temperature in the shade at the coil intake, not in the sun and not in the discharge stream. Compare it to the liquid saturation temperature.',
    expected:
      'Roughly 15–30 °F on a standard-efficiency condenser, 10–20 °F on a high-efficiency one.',
    yields: ['condenser_split_high', 'condenser_split_low', 'noncondensables_suspected'],
    collects: ['outdoor_db', 'liquid_pressure'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 4,
    riskFactor: 1,
    hazardIds: ['refrigerant-handling'],
    procedureSlug: 'condenser-split',
  },
  {
    id: 'drier-temperature-drop',
    label: 'Check for a temperature drop across the filter drier',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'With the system running, feel or measure the inlet and outlet of the liquid line filter drier. Any measurable temperature drop across it — or frost or condensation on the outlet — means it is restricting.',
    expected:
      'Inlet and outlet within about 2 °F of each other, with no sweating or frost on the outlet.',
    yields: ['restriction_across_drier'],
    collects: ['drier_inlet_temp', 'drier_outlet_temp'],
    options: [
      { value: 'no_drop', label: 'No measurable drop', findings: [] },
      { value: 'drop', label: 'Measurable drop / sweating / frost at the outlet', findings: ['restriction_across_drier'] },
    ],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 3,
    riskFactor: 1,
    hazardIds: ['refrigerant-handling', 'hot-surfaces'],
    procedureSlug: 'drier-restriction-check',
  },
  {
    id: 'leak-search',
    label: 'Perform a leak search',
    kind: 'INSPECTION',
    category: 'refrigeration',
    instruction:
      'Work the system methodically with an electronic leak detector: the evaporator, all brazed joints, the service valves and cores, the condenser coil, and the compressor terminals. Confirm any hit with bubbles or a second method.',
    expected: 'No sustained detector response anywhere on the circuit.',
    yields: ['leak_found', 'leak_not_found'],
    collects: ['leak_location'],
    options: [
      { value: 'found', label: 'Leak located', findings: ['leak_found'] },
      { value: 'not_found', label: 'No leak found on a full search', findings: ['leak_not_found'] },
    ],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 45,
    riskFactor: 1,
    hazardIds: ['refrigerant-handling', 'epa-608', 'fall-hazard'],
    requires: ['subcooling_low'],
    procedureSlug: 'leak-search',
  },
  {
    id: 'weigh-in-charge',
    label: 'Recover, evacuate and weigh in the nameplate charge',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'Recover the existing charge and record the weight. Replace the liquid line drier, evacuate to 500 microns and hold a decay test, then weigh in the nameplate charge adjusted for the actual line-set length.',
    expected:
      'Recovered weight materially below the nameplate charge confirms the system was short.',
    yields: ['pattern_charge_normal'],
    collects: ['recovered_weight', 'nameplate_charge', 'line_set_length'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 90,
    riskFactor: 2.5,
    hazardIds: ['refrigerant-handling', 'epa-608', 'frostbite', 'high-pressure-system'],
    requires: ['leak_found'],
    procedureSlug: 'weigh-in-charge',
  },
  {
    id: 'compressor-pump-down-test',
    label: 'Compressor pressure differential test',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'With gauges connected and the system running, observe how far the compressor can pull the suction down and how much head it can build. Follow the manufacturer procedure for this equipment — do not close a service valve on a scroll compressor without confirming the procedure allows it.',
    expected:
      'A healthy compressor develops a substantial differential. One that cannot is not pumping.',
    yields: ['compressor_amps_low', 'condenser_split_low'],
    collects: ['suction_pressure', 'liquid_pressure'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 20,
    riskFactor: 2.2,
    hazardIds: ['refrigerant-handling', 'high-pressure-system', 'electrical-shock'],
    prerequisiteTestIds: ['capacitor-test'],
    procedureSlug: 'compressor-differential',
  },
  {
    id: 'standing-pressure-vs-ambient',
    label: 'Standing pressure versus ambient check',
    kind: 'MEASUREMENT',
    category: 'refrigeration',
    instruction:
      'With the system off long enough to equalize and reach ambient (several hours, ideally overnight), read the standing pressure and the ambient temperature. Convert the pressure to a saturation temperature.',
    expected:
      'Saturation temperature equal to ambient. A saturation temperature meaningfully ABOVE ambient with the system at rest indicates non-condensables.',
    yields: ['noncondensables_suspected'],
    collects: ['standing_pressure', 'outdoor_db'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 5,
    riskFactor: 1,
    hazardIds: ['refrigerant-handling'],
    procedureSlug: 'standing-pressure-check',
  },
  {
    id: 'txv-bulb-test',
    label: 'Test the expansion valve sensing bulb',
    kind: 'OBSERVATION',
    category: 'refrigeration',
    instruction:
      'First verify the bulb is clean, tight on the suction line at the correct clock position, and insulated. Then, with gauges on, warm the bulb in your hand and watch the suction pressure — it should rise. Cool it with a wet rag and it should fall.',
    expected: 'Suction pressure responds within a minute in both directions.',
    yields: ['pattern_high_sh_high_sc', 'pattern_low_sh_low_sc'],
    collects: ['txv_response'],
    options: [
      { value: 'responds', label: 'Valve responds to bulb temperature', findings: [] },
      { value: 'no_response_closed', label: 'No response, valve stays closed', findings: ['pattern_high_sh_high_sc'] },
      { value: 'no_response_open', label: 'No response, valve stays open', findings: ['pattern_low_sh_low_sc'] },
      { value: 'bulb_loose', label: 'Bulb was loose or uninsulated', findings: [] },
    ],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 10,
    riskFactor: 1,
    hazardIds: ['refrigerant-handling', 'hot-surfaces'],
    procedureSlug: 'txv-bulb-test',
  },
  {
    id: 'reversing-valve-temperature-check',
    label: 'Check reversing valve port temperatures',
    kind: 'MEASUREMENT',
    category: 'controls',
    instruction:
      'With the heat pump running, measure the temperature of each tube at the reversing valve. Compare the suction tube leaving the valve to the suction line at the compressor.',
    expected:
      'The suction tube leaving the valve should be at suction temperature. A suction tube that is noticeably warm means hot gas is bypassing internally through the valve.',
    yields: ['reversing_valve_not_shifting'],
    collects: ['rv_suction_temp', 'rv_discharge_temp'],
    options: [
      { value: 'normal', label: 'Port temperatures normal', findings: [] },
      { value: 'bypassing', label: 'Suction tube warm — internal bypass', findings: ['reversing_valve_not_shifting'] },
      { value: 'no_shift', label: 'Valve does not shift on command', findings: ['reversing_valve_not_shifting'] },
    ],
    equipmentTypes: ['HEAT_PUMP', 'DUAL_FUEL', 'MINI_SPLIT', 'PACKAGE_UNIT', 'GEOTHERMAL', 'VRF'],
    costMinutes: 8,
    riskFactor: 1,
    hazardIds: ['hot-surfaces', 'refrigerant-handling', 'electrical-shock'],
    procedureSlug: 'reversing-valve-check',
  },
  {
    id: 'defrost-cycle-test',
    label: 'Force and observe a defrost cycle',
    kind: 'OBSERVATION',
    category: 'controls',
    instruction:
      'Force a defrost per the board procedure for this control. Watch that the reversing valve shifts, the outdoor fan stops, supplemental heat energizes, and the cycle terminates on the defrost sensor rather than on time.',
    expected: 'Defrost initiates, clears the coil, and terminates on temperature.',
    yields: ['defrost_not_initiating', 'defrost_not_terminating', 'outdoor_coil_iced'],
    collects: ['defrost_observation'],
    options: [
      { value: 'normal', label: 'Full cycle runs and terminates correctly', findings: [] },
      { value: 'no_initiate', label: 'Will not initiate', findings: ['defrost_not_initiating'] },
      { value: 'no_terminate', label: 'Runs but will not terminate on temperature', findings: ['defrost_not_terminating'] },
    ],
    equipmentTypes: ['HEAT_PUMP', 'DUAL_FUEL', 'MINI_SPLIT', 'PACKAGE_UNIT', 'GEOTHERMAL'],
    costMinutes: 20,
    riskFactor: 1.2,
    hazardIds: ['electrical-shock', 'moving-parts'],
    procedureSlug: 'defrost-test',
  },

  // =========================================================================
  // Airflow
  // =========================================================================
  {
    id: 'total-external-static',
    label: 'Measure total external static pressure',
    kind: 'MEASUREMENT',
    category: 'airflow',
    instruction:
      'Put a probe on the return side between the filter and the blower, and one on the supply side downstream of the blower and the indoor coil. Read each with the blower at the speed used for the failing mode, then add the magnitudes.',
    expected:
      'At or below the maximum external static on this unit\'s blower table — commonly 0.5 in. w.c., but read the table for this equipment.',
    yields: ['static_pressure_high', 'static_pressure_normal', 'cfm_per_ton_low'],
    collects: ['return_static', 'supply_static', 'total_static', 'rated_max_static'],
    equipmentTypes: 'ANY',
    costMinutes: 12,
    riskFactor: 1,
    hazardIds: ['moving-parts', 'electrical-shock'],
    procedureSlug: 'total-external-static',
  },
  {
    id: 'split-static-pressure',
    label: 'Split the static pressure across the filter and the coil',
    kind: 'MEASUREMENT',
    category: 'airflow',
    instruction:
      'Read the pressure drop across the filter alone and across the indoor coil alone. Whichever is disproportionate is where the restriction is; if neither accounts for the total, the duct system does.',
    expected:
      'A clean 1-inch filter in a correctly sized grille drops under about 0.1 in. w.c.; a clean A-coil drops roughly 0.15–0.30 in. w.c. at rated airflow.',
    yields: ['filter_restriction', 'coil_restriction', 'return_undersized'],
    collects: ['filter_drop', 'coil_drop'],
    equipmentTypes: 'ANY',
    costMinutes: 10,
    riskFactor: 1,
    hazardIds: ['moving-parts', 'electrical-shock'],
    requires: ['static_pressure_high'],
    procedureSlug: 'split-static-pressure',
  },
  {
    id: 'measure-delta-t',
    label: 'Measure air-side ΔT',
    kind: 'MEASUREMENT',
    category: 'airflow',
    instruction:
      'Take the return dry bulb in the return plenum ahead of any bypass, and the supply dry bulb in the supply plenum out of the line of sight of the coil. Take the return wet bulb (or dry bulb plus RH) as well — the ΔT target moves with humidity.',
    expected:
      'A range determined by the return-air dry-bulb/wet-bulb spread, typically 16–22 °F. This is a screening check, not proof of anything on its own.',
    yields: ['delta_t_high', 'delta_t_low'],
    collects: ['return_db', 'return_wb', 'return_rh', 'supply_db'],
    equipmentTypes: 'ANY',
    costMinutes: 6,
    riskFactor: 1,
    hazardIds: [],
    procedureSlug: 'measure-delta-t',
  },
  {
    id: 'blower-operation-check',
    label: 'Verify blower operation',
    kind: 'OBSERVATION',
    category: 'electrical',
    instruction:
      'With a call active, confirm the blower runs and comes up to speed. On an ECM, confirm it reaches the commanded speed rather than hunting or ramping and stalling.',
    expected: 'Blower starts within its programmed delay and runs steadily.',
    yields: ['blower_not_running', 'blower_running', 'blower_wheel_dirty'],
    collects: ['blower_condition'],
    options: [
      { value: 'normal', label: 'Runs normally', findings: ['blower_running'] },
      { value: 'not_running', label: 'Does not run', findings: ['blower_not_running'] },
      { value: 'slow', label: 'Runs but slow / hunting / stalling', findings: ['blower_running'] },
      { value: 'dirty_wheel', label: 'Runs, but the wheel is loaded with debris', findings: ['blower_running', 'blower_wheel_dirty'] },
    ],
    blockedBy: ['blower_running'],
    equipmentTypes: 'ANY',
    costMinutes: 3,
    riskFactor: 1,
    hazardIds: ['moving-parts', 'electrical-shock'],
  },
  {
    id: 'blower-voltage-at-board',
    label: 'Verify the board is commanding the blower',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Measure at the board blower terminal with a call active. On a PSC blower, look for line voltage on the commanded speed tap. On an ECM, confirm the board is sending the control signal the motor expects for this system.',
    expected: 'Command present at the board whenever the blower should be running.',
    yields: ['blower_not_running'],
    collects: ['blower_command_voltage'],
    options: [
      { value: 'command_present', label: 'Command present, motor does not run', findings: ['blower_not_running'] },
      { value: 'no_command', label: 'No command from the board', findings: [] },
    ],
    requires: ['blower_not_running'],
    equipmentTypes: 'ANY',
    costMinutes: 6,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'moving-parts'],
  },

  // =========================================================================
  // Electrical
  // =========================================================================
  {
    id: 'line-voltage-check',
    label: 'Verify line voltage at the unit',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Check for supply voltage at the load side of the disconnect and at the contactor line terminals. Verify the breaker is on and not tripped, and check fuses in the disconnect if fitted.',
    expected: 'Rated supply voltage within ±10% at the equipment.',
    yields: ['breaker_tripped', 'disconnect_open', 'fuse_open', 'supply_voltage_out_of_range'],
    collects: ['supply_voltage', 'rated_voltage'],
    equipmentTypes: 'ANY',
    costMinutes: 5,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'arc-flash'],
    procedureSlug: 'line-voltage-check',
  },
  {
    id: 'control-voltage-test',
    label: 'Measure 24 V control voltage',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Measure across the transformer secondary (R to C) with the call energized. Check the low-voltage fuse on the board while you are there.',
    expected: 'Roughly 24–28 V under load.',
    yields: ['control_voltage_absent', 'control_voltage_low', 'control_voltage_ok', 'fuse_open'],
    collects: ['control_voltage', 'control_voltage_loaded'],
    equipmentTypes: 'ANY',
    costMinutes: 5,
    riskFactor: 1.0,
    hazardIds: ['electrical-shock'],
    procedureSlug: 'control-voltage-test',
  },
  {
    id: 'low-voltage-isolation',
    label: 'Isolate the low-voltage circuit',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Disconnect the field thermostat wiring at the board and re-measure the secondary voltage. Then reconnect one leg at a time until the voltage collapses — that leg carries the short.',
    expected:
      'Voltage that returns with the field wiring removed means the transformer is good and the fault is in the field wiring or a load.',
    yields: ['control_voltage_ok', 'control_voltage_absent', 'control_voltage_low'],
    collects: ['isolated_control_voltage'],
    options: [
      { value: 'returns', label: 'Voltage returns with the load removed', findings: ['control_voltage_ok'] },
      { value: 'still_low', label: 'Still low or absent with everything disconnected', findings: ['control_voltage_low'] },
    ],
    equipmentTypes: 'ANY',
    costMinutes: 15,
    riskFactor: 1.3,
    hazardIds: ['electrical-shock'],
    requires: ['control_voltage_absent'],
  },
  {
    id: 'capacitor-test',
    label: 'Test the run capacitor',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Kill power, DISCHARGE the capacitor through a resistor, verify 0 V across every terminal pair, disconnect at least one lead, and measure capacitance on each side of a dual round.',
    expected:
      'Within the tolerance printed on the can — usually ±6% of the rated µF.',
    yields: ['capacitor_failed', 'capacitor_out_of_tolerance', 'capacitor_ok'],
    collects: ['capacitor_rated_uf', 'capacitor_measured_uf', 'capacitor_physical'],
    equipmentTypes: 'ANY',
    costMinutes: 6,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'capacitor-stored-charge'],
    procedureSlug: 'capacitor-test',
  },
  {
    id: 'compressor-amp-draw',
    label: 'Measure compressor amp draw',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Clamp the common leg with the compressor running and compare to the RLA on the nameplate. Note the LRA as well so a stalled rotor is obvious.',
    expected: 'Somewhere near RLA for the operating conditions — not at LRA, and not far below RLA.',
    yields: ['motor_locked_rotor', 'motor_amps_high', 'compressor_amps_low', 'compressor_amps_normal'],
    collects: ['compressor_amps', 'compressor_rla', 'compressor_lra'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 6,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'arc-flash', 'capacitor-stored-charge'],
    procedureSlug: 'compressor-amp-draw',
  },
  {
    id: 'compressor-winding-test',
    label: 'Test compressor windings',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'With power off and locked out and all leads removed from the compressor terminals, read common-to-start, common-to-run, and start-to-run. Then check each terminal to ground with a megohmmeter.',
    expected:
      'Common-to-start plus common-to-run equals start-to-run, and better than 1 MΩ to ground.',
    yields: ['winding_grounded', 'winding_open', 'winding_shorted', 'winding_ok'],
    collects: ['winding_c_s', 'winding_c_r', 'winding_s_r', 'megohm_to_ground'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 15,
    riskFactor: 1.4,
    hazardIds: ['electrical-shock', 'capacitor-stored-charge'],
    prerequisiteTestIds: ['capacitor-test'],
    procedureSlug: 'compressor-winding-test',
  },
  {
    id: 'contactor-test',
    label: 'Test the contactor',
    kind: 'MEASUREMENT',
    category: 'electrical',
    instruction:
      'Check for 24 V at the contactor coil on a call, confirm the contactor pulls in, then measure the voltage drop across the closed contacts under load. Inspect the contact faces.',
    expected:
      'Coil energized, contactor pulled in, and a negligible voltage drop across closed contacts.',
    yields: ['contactor_not_pulling_in', 'contactor_pitted', 'control_voltage_absent'],
    collects: ['contactor_coil_voltage', 'contact_voltage_drop'],
    options: [
      { value: 'ok', label: 'Pulls in, contacts clean, no drop', findings: [] },
      { value: 'no_pull_in', label: 'Coil energized but will not pull in', findings: ['contactor_not_pulling_in'] },
      { value: 'no_coil_voltage', label: 'No 24 V at the coil', findings: ['control_voltage_absent'] },
      { value: 'pitted', label: 'Pulls in, but contacts pitted / measurable drop', findings: ['contactor_pitted'] },
    ],
    equipmentTypes: 'ANY',
    costMinutes: 7,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'arc-flash'],
    procedureSlug: 'contactor-test',
  },
  {
    id: 'thermostat-jumper-test',
    label: 'Jumper the call at the equipment',
    kind: 'OBSERVATION',
    category: 'controls',
    instruction:
      'At the equipment low-voltage terminal strip, jumper R to the terminal for the failing mode (Y for cooling, W for heat). This tests the equipment independently of the thermostat and its wiring. This is a diagnostic jumper across a control terminal, not a bypass of any safety device — remove it as soon as the test is done.',
    expected: 'The equipment runs when jumpered if the equipment side is sound.',
    yields: ['thermostat_not_calling', 'no_24v_at_w'],
    collects: ['jumper_result'],
    options: [
      { value: 'runs', label: 'Runs when jumpered — thermostat/wiring at fault', findings: ['thermostat_not_calling'] },
      { value: 'no_run', label: 'Still does not run when jumpered', findings: [] },
    ],
    equipmentTypes: 'ANY',
    costMinutes: 5,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'moving-parts'],
  },
  {
    id: 'safety-switch-check',
    label: 'Check the safety switch string',
    kind: 'INSPECTION',
    category: 'controls',
    instruction:
      'Check each safety in the string for continuity with power off: condensate float switch, high- and low-pressure switches, and any service disconnect switch in the circuit.',
    expected: 'All safeties closed with the system in a normal state.',
    yields: ['float_switch_open', 'high_pressure_switch_open', 'low_pressure_switch_open'],
    collects: ['safety_string_result'],
    options: [
      { value: 'all_closed', label: 'All closed', findings: [] },
      { value: 'float', label: 'Condensate float switch open', findings: ['float_switch_open'] },
      { value: 'high_pressure', label: 'High-pressure switch open', findings: ['high_pressure_switch_open'] },
      { value: 'low_pressure', label: 'Low-pressure switch open', findings: ['low_pressure_switch_open'] },
    ],
    equipmentTypes: 'ANY',
    costMinutes: 6,
    riskFactor: 1.2,
    hazardIds: ['electrical-shock', 'water-damage'],
  },
  {
    id: 'condensate-inspection',
    label: 'Inspect the condensate drain and trap',
    kind: 'INSPECTION',
    category: 'controls',
    instruction:
      'Check the drain pan for standing water, pull and inspect the trap, and verify the drain line flows. On a condensing furnace, check the collector box drain ports too.',
    expected: 'A dry pan and a drain that flows freely.',
    yields: ['float_switch_open', 'condensate_blocked'],
    collects: ['condensate_condition'],
    options: [
      { value: 'clear', label: 'Clear and flowing', findings: [] },
      { value: 'blocked', label: 'Blocked / standing water', findings: ['condensate_blocked', 'float_switch_open'] },
    ],
    equipmentTypes: 'ANY',
    costMinutes: 8,
    riskFactor: 1,
    hazardIds: ['water-damage', 'electrical-shock'],
  },

  // =========================================================================
  // Gas heating — the sequence of operations, in order
  // =========================================================================
  {
    id: 'observe-ignition-sequence',
    label: 'Watch the full ignition sequence',
    kind: 'OBSERVATION',
    category: 'heating',
    instruction:
      'Start a call for heat and watch the sequence from a safe position. Tell me the LAST stage that completed: inducer starts, pressure switch closes, ignitor glows, burners light, flame stays lit, blower starts.',
    expected:
      'Inducer → pressure switch closes → ignitor warms → gas valve opens → burners light → flame proves → blower on delay.',
    yields: [
      'inducer_not_running',
      'inducer_running',
      'pressure_switch_not_closing',
      'ignitor_not_glowing',
      'ignitor_glows',
      'burners_not_lighting',
      'burners_light',
      'flame_drops_out',
      'blower_not_running',
    ],
    collects: ['last_completed_stage'],
    // The sequence is cumulative: reaching a later stage proves every earlier
    // stage happened. Each option therefore declares the FULL implied set.
    // Anything a test yields but does not list is recorded as established
    // ABSENT, so an incomplete list tells the engine the inducer never ran on a
    // furnace whose burners just lit.
    options: [
      { value: 'nothing', label: 'Nothing happens at all', findings: ['inducer_not_running'] },
      { value: 'inducer_only', label: 'Inducer runs, then it stops there', findings: ['inducer_running', 'pressure_switch_not_closing'] },
      {
        value: 'no_ignitor',
        label: 'Pressure switch closes, ignitor never glows',
        findings: ['inducer_running', 'ignitor_not_glowing'],
      },
      {
        value: 'no_light',
        label: 'Ignitor glows, burners never light',
        findings: ['inducer_running', 'ignitor_glows', 'burners_not_lighting'],
      },
      {
        value: 'drops_out',
        label: 'Burners light, then drop out after a few seconds',
        findings: ['inducer_running', 'ignitor_glows', 'burners_light', 'flame_drops_out'],
      },
      {
        value: 'no_blower',
        label: 'Burners stay lit, blower never starts',
        findings: ['inducer_running', 'ignitor_glows', 'burners_light', 'blower_not_running'],
      },
      {
        value: 'full_cycle',
        label: 'Full cycle completes normally',
        findings: ['inducer_running', 'ignitor_glows', 'burners_light', 'blower_running'],
      },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    costMinutes: 6,
    riskFactor: 1.2,
    hazardIds: ['natural-gas', 'combustion', 'co-exposure', 'hot-surfaces'],
    procedureSlug: 'ignition-sequence',
  },
  {
    id: 'pressure-switch-draft-test',
    label: 'Measure draft at the pressure switch',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'Tee a manometer into the pressure switch hose and read the negative pressure with the inducer running. Compare it to the setpoint printed on the switch body. Do NOT jumper the switch to run the furnace — measure the input it is supposed to see instead.',
    expected:
      'Measured negative pressure at or beyond the switch setpoint, and the switch closing when it is reached.',
    yields: ['draft_adequate_switch_open', 'draft_inadequate', 'pressure_switch_not_closing'],
    collects: ['measured_draft_iwc', 'switch_setpoint_iwc'],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    costMinutes: 10,
    riskFactor: 1.2,
    hazardIds: ['co-exposure', 'natural-gas', 'electrical-shock'],
    procedureSlug: 'pressure-switch-draft-test',
  },
  {
    id: 'flame-current-test',
    label: 'Measure flame rectification current',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'Put a meter set to DC microamps in series with the flame sensor lead and read the current with the burners lit. Compare it to the minimum in this board\'s literature.',
    expected:
      'Above the board\'s stated minimum — typically around 0.5–1.0 µA minimum with 2–6 µA usual, but the actual number is board specific.',
    yields: ['flame_current_low', 'flame_current_ok', 'burner_ground_poor'],
    collects: ['flame_current_ua', 'board_minimum_ua'],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    costMinutes: 8,
    riskFactor: 1.2,
    hazardIds: ['natural-gas', 'combustion', 'hot-surfaces', 'electrical-shock'],
    requires: ['flame_drops_out'],
    procedureSlug: 'flame-current-test',
  },
  {
    id: 'burner-ground-test',
    label: 'Check the burner ground path',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'With the sensor cleaned and reading low, check resistance from the burner assembly to the board common, and verify the chassis ground and the neutral/ground bond at the furnace.',
    expected: 'Near-zero resistance from the burner assembly to the board common.',
    yields: ['burner_ground_poor'],
    collects: ['burner_ground_ohms'],
    options: [
      { value: 'good', label: 'Solid ground path', findings: [] },
      { value: 'poor', label: 'High resistance / no bond', findings: ['burner_ground_poor'] },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    costMinutes: 8,
    riskFactor: 1.2,
    hazardIds: ['electrical-shock', 'natural-gas'],
    requires: ['flame_current_low'],
  },
  {
    id: 'ignitor-test',
    label: 'Test the hot surface ignitor',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'Check for line voltage at the ignitor during the warm-up period. With power off, read the ignitor resistance and compare it to the value for the part actually installed — silicon nitride and silicon carbide elements read very differently.',
    expected:
      'Voltage present during warm-up, and a resistance within the range for this ignitor type.',
    yields: ['ignitor_open', 'ignitor_not_glowing'],
    collects: ['ignitor_voltage', 'ignitor_ohms'],
    options: [
      { value: 'ok', label: 'Voltage present, resistance in range, glows', findings: [] },
      { value: 'open', label: 'Reads open', findings: ['ignitor_open'] },
      { value: 'no_voltage', label: 'No voltage during warm-up', findings: ['ignitor_not_glowing'] },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    costMinutes: 8,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'hot-surfaces'],
    requires: ['ignitor_not_glowing'],
  },
  {
    id: 'gas-valve-voltage-test',
    label: 'Check for 24 V at the gas valve',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'Measure across the gas valve terminals during the trial for ignition. This distinguishes a valve that is not being told to open from a valve that will not open.',
    expected: 'Roughly 24 V at the valve during the trial for ignition.',
    yields: ['gas_valve_voltage_present', 'gas_valve_no_voltage'],
    collects: ['gas_valve_voltage'],
    options: [
      { value: 'present', label: '24 V present, no gas flow', findings: ['gas_valve_voltage_present'] },
      { value: 'absent', label: 'No voltage at the valve', findings: ['gas_valve_no_voltage'] },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    costMinutes: 6,
    riskFactor: 1.2,
    hazardIds: ['natural-gas', 'electrical-shock', 'combustion'],
    requires: ['burners_not_lighting'],
  },
  {
    id: 'manifold-pressure-test',
    label: 'Measure inlet and manifold gas pressure',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'With a manometer on the inlet tap, read the supply pressure with every gas appliance in the building firing. Then read manifold pressure at the outlet tap while the furnace runs, and compare both to the rating plate.',
    expected: 'Inlet and manifold pressures within the ranges on the rating plate.',
    yields: ['gas_pressure_low', 'gas_overfired', 'gas_underfired'],
    collects: ['inlet_gas_pressure', 'manifold_pressure', 'rated_manifold_pressure'],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    costMinutes: 15,
    riskFactor: 2,
    hazardIds: ['natural-gas', 'combustion', 'burns'],
    procedureSlug: 'manifold-pressure-test',
  },
  {
    id: 'gas-meter-clock',
    label: 'Clock the gas meter',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'Shut off every other gas appliance. Time one full revolution of the smallest dial on the meter with only this furnace firing, and note the dial size.',
    expected: 'Calculated input within about 5% of the rating plate, derated for altitude if applicable.',
    yields: ['gas_overfired', 'gas_underfired'],
    collects: ['dial_size', 'seconds_per_revolution', 'rated_input_btuh'],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    costMinutes: 12,
    riskFactor: 1.2,
    hazardIds: ['natural-gas', 'co-exposure'],
    procedureSlug: 'gas-meter-clock',
  },
  {
    id: 'temperature-rise-test',
    label: 'Measure furnace temperature rise',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'Run the furnace at steady state for at least 10 minutes. Take return and supply dry-bulb temperatures, with the supply probe out of the line of sight of the heat exchanger. Compare to the rise range on the rating plate.',
    expected: 'Inside the range printed on this furnace\'s rating plate.',
    yields: ['temp_rise_high', 'temp_rise_low', 'limit_open'],
    collects: ['return_db', 'supply_db', 'rated_rise_min', 'rated_rise_max'],
    equipmentTypes: ['GAS_FURNACE', 'ELECTRIC_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    costMinutes: 12,
    riskFactor: 1.2,
    hazardIds: ['hot-surfaces', 'co-exposure'],
    procedureSlug: 'temperature-rise',
  },
  {
    id: 'flue-inspection',
    label: 'Inspect the flue and combustion air intake',
    kind: 'INSPECTION',
    category: 'heating',
    instruction:
      'Inspect the full vent run and the intake, inside and outside. Look for nests, ice, sagging or disconnected sections, screening blocked by snow, and any sign of condensation or corrosion.',
    expected: 'A clear, correctly pitched, intact vent and a clear intake.',
    yields: ['flue_blocked'],
    collects: ['flue_condition'],
    options: [
      { value: 'clear', label: 'Clear and intact', findings: [] },
      { value: 'blocked', label: 'Obstructed', findings: ['flue_blocked'] },
      { value: 'damaged', label: 'Disconnected or damaged', findings: ['flue_blocked'] },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER', 'WATER_HEATER'],
    costMinutes: 15,
    riskFactor: 1.3,
    hazardIds: ['co-exposure', 'combustion', 'fall-hazard'],
  },
  {
    id: 'heat-exchanger-inspection',
    label: 'Inspect the heat exchanger',
    kind: 'INSPECTION',
    category: 'heating',
    instruction:
      'Follow the manufacturer\'s inspection procedure for this furnace, with a combustion analyzer and a CO measurement in the supply air. Look for flame disturbance when the blower starts, and inspect visually with a camera where the design allows.',
    expected: 'No flame disturbance on blower start, and no CO in the supply air.',
    yields: ['heat_exchanger_visual_defect'],
    collects: ['co_supply_ppm', 'hx_inspection_result'],
    options: [
      { value: 'sound', label: 'No defect found', findings: [] },
      { value: 'defect', label: 'Defect found / CO in supply air', findings: ['heat_exchanger_visual_defect'] },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL'],
    costMinutes: 45,
    riskFactor: 1.5,
    hazardIds: ['co-exposure', 'combustion', 'natural-gas'],
    procedureSlug: 'heat-exchanger-inspection',
  },
  {
    id: 'inducer-operation-check',
    label: 'Verify inducer operation',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'On a call, check for line voltage at the inducer and confirm it comes up to speed. Listen for bearing noise and check the wheel and housing for debris or corrosion.',
    expected: 'Voltage present and the inducer at full speed within a few seconds.',
    yields: ['inducer_not_running', 'inducer_running', 'draft_inadequate'],
    collects: ['inducer_voltage'],
    options: [
      { value: 'normal', label: 'Runs at full speed', findings: ['inducer_running'] },
      { value: 'no_voltage', label: 'No voltage at the inducer', findings: ['inducer_not_running'] },
      { value: 'voltage_no_run', label: 'Voltage present, motor does not run', findings: ['inducer_not_running'] },
      { value: 'slow', label: 'Runs but slow or noisy', findings: ['inducer_running', 'draft_inadequate'] },
    ],
    equipmentTypes: ['GAS_FURNACE', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'DUAL_FUEL', 'BOILER'],
    costMinutes: 6,
    riskFactor: 1.4,
    hazardIds: ['electrical-shock', 'moving-parts', 'co-exposure'],
  },
  {
    id: 'electric-heat-amp-draw',
    label: 'Measure electric heat amp draw',
    kind: 'MEASUREMENT',
    category: 'heating',
    instruction:
      'With a call for heat, clamp each heater leg in turn and record the amps. Compare the total to the nameplate kW.',
    expected: 'Every stage drawing its rated current.',
    yields: ['electric_element_open', 'temp_rise_low'],
    collects: ['heater_amps_per_leg', 'rated_kw'],
    equipmentTypes: ['ELECTRIC_FURNACE', 'AIR_HANDLER', 'HEAT_PUMP', 'PACKAGE_UNIT'],
    costMinutes: 10,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock', 'arc-flash'],
  },
  {
    id: 'board-output-verification',
    label: 'Verify the board output at the terminal',
    kind: 'MEASUREMENT',
    category: 'controls',
    instruction:
      'With every input the board needs confirmed present and correct, measure at the board terminal for the output that is missing. A board is only condemned when its inputs are satisfied and the commanded output is absent at its own terminal.',
    expected: 'The commanded output present at the board terminal.',
    yields: ['gas_valve_no_voltage', 'inducer_not_running', 'ignitor_not_glowing'],
    collects: ['board_output_voltage'],
    equipmentTypes: 'ANY',
    costMinutes: 12,
    riskFactor: 1.1,
    hazardIds: ['electrical-shock'],
  },

  // =========================================================================
  // Context
  // =========================================================================
  {
    id: 'load-context-questions',
    label: 'Establish the load context',
    kind: 'QUESTION',
    category: 'refrigeration',
    instruction:
      'How far off is the space from setpoint, how long has it been running, and what is the outdoor temperature? Has anything changed — added rooms, a new attic setup, a filter upgrade, work on the ducts?',
    expected: 'Enough context to judge whether the equipment is being asked to do more than it can.',
    yields: ['cfm_per_ton_high', 'return_undersized'],
    collects: ['space_temp', 'setpoint', 'runtime_hours', 'recent_changes'],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 2,
    riskFactor: 1,
    hazardIds: [],
  },
  {
    id: 'service-history-question',
    label: 'Ask about recent service history',
    kind: 'QUESTION',
    category: 'refrigeration',
    instruction:
      'Has the system been opened, charged, or worked on recently? Who did it and what did they do?',
    expected:
      'A system opened recently and not properly evacuated is a strong candidate for non-condensables or moisture.',
    yields: ['system_previously_opened'],
    collects: ['service_history'],
    options: [
      { value: 'recent_work', label: 'Yes — opened or charged recently', findings: ['system_previously_opened'] },
      { value: 'none', label: 'No recent work', findings: [] },
      { value: 'unknown', label: 'Unknown', findings: [] },
    ],
    equipmentTypes: ['CENTRAL_AC', 'HEAT_PUMP', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'UNKNOWN'],
    costMinutes: 1,
    riskFactor: 1,
    hazardIds: [],
  },
];

export const TEST_MAP: Record<string, DiagnosticTest> = Object.fromEntries(
  TESTS.map((t) => [t.id, t]),
);

export function getTest(id: string): DiagnosticTest | undefined {
  return TEST_MAP[id];
}
