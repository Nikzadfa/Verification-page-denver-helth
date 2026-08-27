/**
 * Finding catalogue.
 *
 * `marginalPrior` is P(finding present) across all units that reach a test
 * which could produce it. The planner needs it to turn likelihood ratios into
 * outcome probabilities. These are rough field estimates; the planner only
 * uses them to rank tests, so being approximately right is sufficient.
 */

export interface FindingDef {
  key: string;
  label: string;
  category: string;
  marginalPrior: number;
  /** Rendered when the finding is present, if the producer supplies no detail. */
  defaultDetail?: string;
}

function f(
  key: string,
  label: string,
  category: string,
  marginalPrior = 0.3,
  defaultDetail?: string,
): FindingDef {
  return { key, label, category, marginalPrior, defaultDetail };
}

export const FINDINGS: FindingDef[] = [
  // --- Refrigeration circuit ------------------------------------------------
  f('superheat_high', 'Superheat above target', 'refrigeration', 0.3),
  f('superheat_low', 'Superheat below target', 'refrigeration', 0.2),
  f('superheat_normal', 'Superheat in range', 'refrigeration', 0.5),
  f('superheat_negative', 'Negative superheat', 'refrigeration', 0.03),
  f('subcooling_high', 'Subcooling above target', 'refrigeration', 0.2),
  f('subcooling_low', 'Subcooling below target', 'refrigeration', 0.3),
  f('subcooling_normal', 'Subcooling in range', 'refrigeration', 0.5),
  f('pattern_high_sh_low_sc', 'High superheat with low subcooling', 'refrigeration', 0.22),
  f('pattern_high_sh_high_sc', 'High superheat with high subcooling', 'refrigeration', 0.07),
  f('pattern_low_sh_high_sc', 'Low superheat with high subcooling', 'refrigeration', 0.1),
  f('pattern_low_sh_low_sc', 'Low superheat with low subcooling', 'refrigeration', 0.08),
  f('pattern_charge_normal', 'Charge indicators normal', 'refrigeration', 0.45),
  f('condenser_split_high', 'High condenser split', 'refrigeration', 0.25),
  f('condenser_split_low', 'Low condenser split', 'refrigeration', 0.18),
  f('evap_td_high', 'Wide evaporator TD', 'refrigeration', 0.25),
  f('compression_ratio_high', 'High compression ratio', 'refrigeration', 0.15),
  f('discharge_temp_high', 'Discharge temperature above limit', 'refrigeration', 0.1),
  f('floodback_risk', 'Liquid floodback indicators', 'refrigeration', 0.05),
  f('noncondensables_suspected', 'Non-condensables suspected', 'refrigeration', 0.06),
  f('restriction_across_drier', 'Temperature drop across the filter drier', 'refrigeration', 0.07),
  f('leak_found', 'Refrigerant leak located', 'refrigeration', 0.2),
  f('leak_not_found', 'No leak found on a full search', 'refrigeration', 0.2),
  f('system_previously_opened', 'System was opened for service recently', 'refrigeration', 0.15),
  f('coil_below_freezing', 'Evaporator operating below freezing', 'refrigeration', 0.15),
  f('sight_glass_bubbles', 'Bubbles in the sight glass at steady state', 'refrigeration', 0.1),

  // --- Air side -------------------------------------------------------------
  f('static_pressure_high', 'Total external static above rating', 'airflow', 0.35),
  f('static_pressure_normal', 'Total external static within rating', 'airflow', 0.5),
  f('filter_restriction', 'Excessive filter pressure drop', 'airflow', 0.3),
  f('coil_restriction', 'Excessive indoor coil pressure drop', 'airflow', 0.15),
  f('filter_dirty', 'Filter visibly loaded', 'airflow', 0.35),
  f('filter_clean', 'Filter clean', 'airflow', 0.5),
  f('evaporator_dirty', 'Evaporator coil dirty on the upstream face', 'airflow', 0.2),
  f('blower_wheel_dirty', 'Blower wheel loaded with debris', 'airflow', 0.18),
  f('cfm_per_ton_low', 'Airflow below design CFM per ton', 'airflow', 0.25),
  f('cfm_per_ton_high', 'Airflow above design CFM per ton', 'airflow', 0.08),
  f('blower_not_running', 'Indoor blower not running', 'airflow', 0.12),
  f('blower_running', 'Indoor blower running', 'airflow', 0.7),
  f('evaporator_iced', 'Evaporator coil iced', 'airflow', 0.15),
  f('delta_t_high', 'High air-side ΔT', 'airflow', 0.25),
  f('delta_t_low', 'Low air-side ΔT', 'airflow', 0.25),
  f('duct_damper_closed', 'Damper or register closed off', 'airflow', 0.08),
  f('return_undersized', 'Return path undersized or obstructed', 'airflow', 0.15),

  // --- Electrical -----------------------------------------------------------
  f('capacitor_failed', 'Run capacitor failed', 'electrical', 0.2),
  f('capacitor_out_of_tolerance', 'Run capacitor out of tolerance', 'electrical', 0.18),
  f('capacitor_ok', 'Run capacitor within tolerance', 'electrical', 0.6),
  f('contactor_not_pulling_in', 'Contactor not pulling in', 'electrical', 0.12),
  f('contactor_pitted', 'Contactor contacts pitted or welded', 'electrical', 0.1),
  f('motor_locked_rotor', 'Motor drawing locked-rotor amps', 'electrical', 0.07),
  f('motor_amps_high', 'Motor amp draw above rating', 'electrical', 0.15),
  f('compressor_amps_low', 'Compressor amps well below RLA', 'electrical', 0.1),
  f('compressor_amps_normal', 'Compressor amps in range', 'electrical', 0.5),
  f('control_voltage_absent', 'No 24 V control voltage', 'electrical', 0.1),
  f('control_voltage_low', 'Low 24 V control voltage', 'electrical', 0.08),
  f('control_voltage_ok', '24 V control voltage normal', 'electrical', 0.7),
  f('voltage_imbalance', 'Three-phase voltage imbalance', 'electrical', 0.05),
  f('supply_voltage_out_of_range', 'Supply voltage outside ±10%', 'electrical', 0.07),
  f('winding_grounded', 'Compressor winding grounded', 'electrical', 0.05),
  f('winding_open', 'Compressor winding open', 'electrical', 0.06),
  f('winding_shorted', 'Compressor winding shorted', 'electrical', 0.04),
  f('winding_ok', 'Compressor windings read normal', 'electrical', 0.6),
  f('breaker_tripped', 'Breaker tripped', 'electrical', 0.1),
  f('fuse_open', 'Fuse or low-voltage fuse open', 'electrical', 0.1),
  f('disconnect_open', 'Disconnect open or pulled', 'electrical', 0.05),
  f('condenser_fan_not_running', 'Condenser fan not running', 'electrical', 0.12),
  f('condenser_fan_running', 'Condenser fan running', 'electrical', 0.7),
  f('outdoor_unit_not_running', 'Outdoor unit not running', 'electrical', 0.25),
  f('compressor_running', 'Compressor running', 'electrical', 0.65),
  f('thermostat_not_calling', 'Thermostat not sending a call', 'controls', 0.1),
  f('float_switch_open', 'Condensate float switch open', 'controls', 0.08),
  f('high_pressure_switch_open', 'High-pressure switch open', 'controls', 0.07),
  f('low_pressure_switch_open', 'Low-pressure switch open', 'controls', 0.09),
  f('condenser_coil_dirty', 'Condenser coil dirty or obstructed', 'refrigeration', 0.3),
  f('condenser_coil_clean', 'Condenser coil clean', 'refrigeration', 0.5),

  // --- Gas heating ----------------------------------------------------------
  f('no_24v_at_w', 'No 24 V at W with a call for heat', 'heating', 0.08),
  f('inducer_not_running', 'Inducer not running on a call', 'heating', 0.12),
  f('inducer_running', 'Inducer runs and comes up to speed', 'heating', 0.7),
  f('pressure_switch_not_closing', 'Pressure switch not closing', 'heating', 0.2),
  f('draft_adequate_switch_open', 'Adequate draft present but switch stays open', 'heating', 0.07),
  f('draft_inadequate', 'Measured draft below the switch setpoint', 'heating', 0.15),
  f('ignitor_not_glowing', 'Ignitor does not glow', 'heating', 0.14),
  f('ignitor_glows', 'Ignitor glows normally', 'heating', 0.6),
  f('ignitor_open', 'Ignitor reads open', 'heating', 0.1),
  f('gas_valve_no_voltage', 'No 24 V at the gas valve when commanded', 'heating', 0.07),
  f('gas_valve_voltage_present', '24 V present at the gas valve', 'heating', 0.5),
  f('burners_not_lighting', 'Burners do not light', 'heating', 0.15),
  f('burners_light', 'Burners light normally', 'heating', 0.6),
  f('flame_drops_out', 'Flame drops out after a few seconds', 'heating', 0.2),
  f('flame_current_low', 'Flame rectification current below board minimum', 'heating', 0.18),
  f('flame_current_ok', 'Flame rectification current adequate', 'heating', 0.5),
  f('limit_open', 'Limit switch open', 'heating', 0.1),
  f('rollout_tripped', 'Rollout switch tripped', 'heating', 0.05),
  f('condensate_blocked', 'Condensate trap or drain blocked', 'heating', 0.12),
  f('flue_blocked', 'Flue or intake obstructed', 'heating', 0.08),
  f('gas_pressure_low', 'Gas supply or manifold pressure low', 'heating', 0.1),
  f('temp_rise_high', 'Temperature rise above the rating plate', 'heating', 0.2),
  f('temp_rise_low', 'Temperature rise below the rating plate', 'heating', 0.12),
  f('gas_overfired', 'Furnace overfired', 'heating', 0.06),
  f('gas_underfired', 'Furnace underfired', 'heating', 0.1),
  f('burner_ground_poor', 'Poor burner/chassis ground', 'heating', 0.08),
  f('heat_exchanger_visual_defect', 'Visible heat exchanger defect', 'heating', 0.04),
  f('electric_element_open', 'Electric heat element or sequencer open', 'heating', 0.1),

  // --- Heat pump / controls -------------------------------------------------
  f('reversing_valve_not_shifting', 'Reversing valve not shifting', 'controls', 0.07),
  f('defrost_not_initiating', 'Defrost cycle not initiating', 'controls', 0.08),
  f('defrost_not_terminating', 'Defrost cycle not terminating', 'controls', 0.05),
  f('outdoor_coil_iced', 'Outdoor coil iced over', 'controls', 0.12),
  f('aux_heat_not_energizing', 'Auxiliary heat not energizing', 'controls', 0.08),
  f('fault_code_present', 'Control reporting a fault code', 'controls', 0.3),
  f('unit_locked_out', 'Control in hard lockout', 'controls', 0.15),
];

export const FINDING_MAP: Record<string, FindingDef> = Object.fromEntries(
  FINDINGS.map((x) => [x.key, x]),
);

export function findingLabel(key: string): string {
  return FINDING_MAP[key]?.label ?? key;
}

export function marginalPrior(key: string): number {
  return FINDING_MAP[key]?.marginalPrior ?? 0.25;
}
