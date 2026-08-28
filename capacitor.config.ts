import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS shell configuration.
 *
 * ThermoRivet is a Next.js app with server components, API routes and a
 * database behind it, so there is no static bundle to ship inside the binary.
 * The shell loads the deployed app instead, and the native side contributes
 * what a browser cannot: StoreKit purchases, the status bar, and the launch
 * screen.
 *
 * `CAPACITOR_SERVER_URL` must be an https origin you control. A build without
 * it fails here rather than silently shipping a shell that loads nothing —
 * finding that out from App Store review is an expensive way to learn it.
 */

const serverUrl = process.env.CAPACITOR_SERVER_URL;

if (!serverUrl && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'CAPACITOR_SERVER_URL is not set. Point it at your deployed ThermoRivet origin ' +
      '(for example https://thermorivet.example.com) before running `npx cap sync ios`.',
  );
}

if (serverUrl && !serverUrl.startsWith('https://')) {
  throw new Error(
    `CAPACITOR_SERVER_URL must be https. App Transport Security blocks plain http in a shipped app, ` +
      `and "${serverUrl}" would load a blank screen on a reviewer's device.`,
  );
}

const config: CapacitorConfig = {
  appId: process.env.APPLE_BUNDLE_ID ?? 'com.example.thermorivet',
  appName: 'ThermoRivet',
  // Unused for a server-loaded app, but the CLI insists on a real directory.
  webDir: 'public',

  server: {
    url: serverUrl,
    // The app is served over TLS; nothing here should ever fall back to http.
    cleartext: false,
  },

  ios: {
    // Matches --bg so there is no white flash between the launch screen and
    // the first paint. Dark is the app's default.
    backgroundColor: '#0b1116',
    contentInset: 'always',
    // Links to anywhere other than our own origin open in Safari rather than
    // inside the app's web view.
    limitsNavigationsToAppBoundDomains: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0b1116',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b1116',
    },
  },
};

export default config;
