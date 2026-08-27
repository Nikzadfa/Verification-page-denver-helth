import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'ThermoRivet — HVAC diagnostic assistant',
  description:
    'A diagnostic engine for HVAC service technicians. Systematic troubleshooting, manufacturer fault codes, measurement analysis and service reports.',
  applicationName: 'ThermoRivet',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ThermoRivet' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: a technician reading a model number off a photo needs
  // to pinch in, and locking that out to look tidy is a real accessibility
  // failure.
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b1116' },
    { media: '(prefers-color-scheme: light)', color: '#f7f9fb' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Applies the stored theme before first paint so a technician who
          // chose light mode does not get a flash of dark in bright sun.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tr-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
