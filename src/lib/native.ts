/**
 * Which shell is this running in?
 *
 * The same build serves a browser and the iOS app, and one rule differs
 * between them: App Store Review Guideline 3.1.1 forbids an iOS app from
 * selling a digital subscription through anything but In-App Purchase, or
 * linking out to a web checkout. So on iOS the Stripe button has to be gone —
 * not disabled, not hidden behind a hint, gone — and StoreKit takes its place.
 *
 * Capacitor injects `window.Capacitor` into the web view. Nothing else does,
 * and a browser therefore always reads as web.
 */

export type Shell = 'web' | 'ios' | 'android';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

function capacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  const found = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return found ?? null;
}

export function shell(): Shell {
  const cap = capacitor();
  if (!cap?.isNativePlatform?.()) return 'web';
  const platform = cap.getPlatform?.();
  return platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'web';
}

export function isIosApp(): boolean {
  return shell() === 'ios';
}

/**
 * The StoreKit bridge the native shell registers.
 *
 * Declared as an interface rather than imported so the web build carries no
 * native dependency: on the web this is simply never present, and the purchase
 * UI is never rendered there anyway.
 */
export interface StoreKitBridge {
  /** Product ids configured in App Store Connect. */
  getProducts(options: { productIds: string[] }): Promise<{
    products: Array<{ id: string; displayPrice: string; displayName: string }>;
  }>;
  /**
   * Runs the purchase sheet. Resolves with the signed JWS to verify
   * server-side, or a null transaction when the sheet was dismissed.
   */
  purchase(options: { productId: string }): Promise<{
    signedTransaction: string | null;
    transactionId?: string;
    pending?: boolean;
  }>;
  /** Re-reads current entitlements — "Restore purchases". */
  restore(): Promise<{ signedTransactions: string[] }>;
  /**
   * Marks a transaction complete with StoreKit.
   *
   * Called only after the server has recorded the purchase. Finishing earlier
   * would drop a transaction whose grant never landed; leaving it unfinished
   * means StoreKit re-delivers it on the next launch.
   */
  finish(options: { transactionId: string }): Promise<{ finished: boolean }>;
}

export function storeKit(): StoreKitBridge | null {
  const plugins = capacitor()?.Plugins;
  const bridge = plugins?.['ThermoRivetStoreKit'];
  return (bridge as StoreKitBridge | undefined) ?? null;
}
