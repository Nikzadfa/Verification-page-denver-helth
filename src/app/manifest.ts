import type { MetadataRoute } from 'next';

/**
 * Installable on a phone home screen. Technicians open this between calls, in
 * a van or on a roof; a browser chrome bar costs vertical space they need for
 * the step they are reading.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ThermoRivet — HVAC diagnostic assistant',
    short_name: 'ThermoRivet',
    description:
      'Systematic HVAC troubleshooting, manufacturer fault codes, measurement analysis and service reports.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b1116',
    theme_color: '#0b1116',
    categories: ['productivity', 'utilities'],
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
