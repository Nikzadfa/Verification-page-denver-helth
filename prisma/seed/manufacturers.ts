/**
 * Manufacturer, model-series and control-board seed data.
 *
 * The point of this file is the SHAPE, not the volume. Adding a manufacturer
 * is one entry here plus fault-code rows scoped to its boards — no schema
 * change, no code change, no prompt change.
 */

import type { EquipmentType } from '@prisma/client';

export interface ManufacturerSeed {
  name: string;
  slug: string;
  parent?: string;
  notes?: string;
  models?: Array<{
    series: string;
    type: EquipmentType;
    description: string;
    refrigerant?: string;
    minYear?: number;
    maxYear?: number;
  }>;
  boards?: Array<{
    partNumber: string;
    aliases?: string[];
    description: string;
    signalStyle: string;
    series?: string;
  }>;
}

export const MANUFACTURERS: ManufacturerSeed[] = [
  {
    name: 'Carrier',
    slug: 'carrier',
    notes:
      'Carrier and Bryant share engineering and family codes. Status codes are specific to the control board fitted, not to the brand or even the series — two furnaces in the same series can carry different boards with different code tables.',
    models: [
      {
        series: '58MVC',
        type: 'GAS_FURNACE',
        description: 'Infinity/Evolution variable-capacity condensing gas furnace',
        minYear: 2003,
      },
      {
        series: '58MVB',
        type: 'GAS_FURNACE',
        description: 'Infinity variable-speed condensing gas furnace (earlier generation)',
        minYear: 1998,
        maxYear: 2008,
      },
      {
        series: '58TP',
        type: 'GAS_FURNACE',
        description: 'Performance two-stage condensing gas furnace',
      },
      {
        series: '58STA',
        type: 'GAS_FURNACE',
        description: 'Comfort single-stage 80% gas furnace',
      },
      {
        series: '59MN7',
        type: 'GAS_FURNACE',
        description: 'Infinity 98 modulating condensing gas furnace',
        minYear: 2012,
      },
      {
        series: '24ACC6',
        type: 'CENTRAL_AC',
        description: 'Comfort 16 SEER single-stage air conditioner',
        refrigerant: 'R-410A',
      },
      {
        series: '24ANB7',
        type: 'CENTRAL_AC',
        description: 'Infinity two-stage air conditioner',
        refrigerant: 'R-410A',
      },
      {
        series: '25HCB6',
        type: 'HEAT_PUMP',
        description: 'Comfort single-stage heat pump',
        refrigerant: 'R-410A',
      },
      {
        series: '25VNA',
        type: 'HEAT_PUMP',
        description: 'Infinity variable-speed heat pump with Greenspeed',
        refrigerant: 'R-410A',
      },
      {
        series: '48TC',
        type: 'ROOFTOP_UNIT',
        description: 'WeatherMaker packaged rooftop, gas heat / electric cooling',
      },
      {
        series: 'FV4C',
        type: 'AIR_HANDLER',
        description: 'Infinity fan coil with variable-speed ECM blower',
      },
    ],
    boards: [
      {
        partNumber: 'CESO110057',
        aliases: ['CES0110057'],
        description:
          'Carrier/Bryant integrated furnace control used across several 58-series condensing furnaces. Reports status as a two-digit LED flash sequence.',
        signalStyle: 'LED_FLASH',
        series: '58MVC',
      },
      {
        partNumber: 'HK42FZ',
        aliases: ['HK42FZ011', 'HK42FZ013', 'HK42FZ022'],
        description:
          'Widely used Carrier/Bryant furnace control family. Amber LED flashes a two-digit status code. Code tables differ across revisions in this family — check the label on the board itself.',
        signalStyle: 'LED_FLASH',
        series: '58STA',
      },
      {
        partNumber: 'CESO130035',
        description: 'Infinity/Evolution system control board with a seven-segment status display.',
        signalStyle: 'SEVEN_SEGMENT',
        series: '59MN7',
      },
    ],
  },
  {
    name: 'Bryant',
    slug: 'bryant',
    parent: 'Carrier',
    notes: 'Carrier sister brand. Shares family codes, control boards and status-code tables with Carrier.',
    models: [
      { series: '987M', type: 'GAS_FURNACE', description: 'Evolution variable-capacity condensing gas furnace' },
      { series: 'macro', type: 'CENTRAL_AC', description: 'Evolution air conditioner', refrigerant: 'R-410A' },
    ],
  },
  {
    name: 'Trane',
    slug: 'trane',
    notes: 'Trane and American Standard share engineering. Many controls report faults on a seven-segment display or via a diagnostic LED.',
    models: [
      { series: '4TTR6', type: 'CENTRAL_AC', description: 'XR16 single-stage air conditioner', refrigerant: 'R-410A' },
      { series: '4TWR6', type: 'HEAT_PUMP', description: 'XR16 heat pump', refrigerant: 'R-410A' },
      { series: 'S9V2', type: 'GAS_FURNACE', description: 'Two-stage condensing gas furnace' },
      { series: 'TAM9', type: 'AIR_HANDLER', description: 'Variable-speed air handler' },
    ],
  },
  { name: 'American Standard', slug: 'american-standard', parent: 'Trane', notes: 'Trane sister brand; shares engineering and controls.' },
  {
    name: 'Lennox',
    slug: 'lennox',
    models: [
      { series: 'XC16', type: 'CENTRAL_AC', description: 'Two-stage air conditioner', refrigerant: 'R-410A' },
      { series: 'XP16', type: 'HEAT_PUMP', description: 'Two-stage heat pump', refrigerant: 'R-410A' },
      { series: 'SLP98', type: 'GAS_FURNACE', description: 'Modulating condensing gas furnace' },
      { series: 'CBA38', type: 'AIR_HANDLER', description: 'Air handler' },
    ],
  },
  {
    name: 'Goodman',
    slug: 'goodman',
    notes: 'Goodman, Amana and Daikin North America share engineering on many product lines.',
    models: [
      { series: 'GSX16', type: 'CENTRAL_AC', description: 'Single-stage air conditioner', refrigerant: 'R-410A' },
      { series: 'GSZ16', type: 'HEAT_PUMP', description: 'Single-stage heat pump', refrigerant: 'R-410A' },
      { series: 'GMVC96', type: 'GAS_FURNACE', description: 'Variable-speed condensing gas furnace' },
      { series: 'GMES96', type: 'GAS_FURNACE', description: 'Multi-speed condensing gas furnace' },
    ],
  },
  { name: 'Amana', slug: 'amana', parent: 'Goodman' },
  {
    name: 'Rheem',
    slug: 'rheem',
    models: [
      { series: 'RA16', type: 'CENTRAL_AC', description: 'Classic single-stage air conditioner', refrigerant: 'R-410A' },
      { series: 'RP15', type: 'HEAT_PUMP', description: 'Classic heat pump', refrigerant: 'R-410A' },
      { series: 'R96V', type: 'GAS_FURNACE', description: 'Variable-speed condensing gas furnace' },
    ],
  },
  { name: 'Ruud', slug: 'ruud', parent: 'Rheem' },
  {
    name: 'York',
    slug: 'york',
    notes: 'York, Coleman and Luxaire are Johnson Controls brands sharing engineering across several lines.',
    models: [
      { series: 'YCJD', type: 'CENTRAL_AC', description: 'Split-system air conditioner', refrigerant: 'R-410A' },
      { series: 'YZV', type: 'HEAT_PUMP', description: 'Variable-capacity heat pump', refrigerant: 'R-410A' },
      { series: 'TM9V', type: 'GAS_FURNACE', description: 'Variable-speed 96% gas furnace' },
    ],
  },
  {
    name: 'Daikin',
    slug: 'daikin',
    notes: 'VRV/VRF systems report numeric-alpha fault codes on the outdoor unit board and on the controller. Codes are specific to the system generation.',
    models: [
      { series: 'FTX', type: 'MINI_SPLIT', description: 'Wall-mounted ductless indoor unit', refrigerant: 'R-410A' },
      { series: 'RXS', type: 'MINI_SPLIT', description: 'Ductless outdoor unit', refrigerant: 'R-410A' },
      { series: 'REYQ', type: 'VRF', description: 'VRV heat recovery outdoor unit', refrigerant: 'R-410A' },
    ],
  },
  {
    name: 'Mitsubishi Electric',
    slug: 'mitsubishi',
    notes: 'M-Series and City Multi report codes such as P- and E- prefixed faults; the meaning is specific to the system family.',
    models: [
      { series: 'MSZ', type: 'MINI_SPLIT', description: 'M-Series wall-mounted indoor unit', refrigerant: 'R-410A' },
      { series: 'MUZ', type: 'MINI_SPLIT', description: 'M-Series outdoor unit', refrigerant: 'R-410A' },
      { series: 'PUZ', type: 'DUCTLESS_MULTI', description: 'P-Series outdoor unit', refrigerant: 'R-410A' },
    ],
  },
];
