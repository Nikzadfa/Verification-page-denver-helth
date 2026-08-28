/**
 * Apple In-App Purchase verification.
 *
 * App Store Review Guideline 3.1.1 requires that a subscription unlocking
 * features inside an iOS app is sold through In-App Purchase. Stripe stays for
 * the web; this is the iOS path.
 *
 * StoreKit 2 hands the app a *signed transaction* — a JWS whose x5c header
 * carries the certificate chain Apple signed it with. Verifying it means
 * checking that chain up to Apple's root, then checking the signature, then
 * checking the payload says what we think it says.
 *
 * FAIL CLOSED. Every failure path here refuses the grant. A receipt we cannot
 * verify is worth exactly as much as no receipt at all, and the alternative —
 * trusting a client-supplied JSON blob — is a free subscription for anyone who
 * can use a proxy. That is also why the Apple root certificate has to be
 * configured explicitly rather than defaulted: silently skipping chain
 * validation because a file is missing is the same bug with better manners.
 */

import { X509Certificate, createPublicKey } from 'node:crypto';
import { compactVerify, decodeProtectedHeader } from 'jose';

export class AppleVerificationError extends Error {}

/** The fields we act on. StoreKit sends more; these are the ones that matter. */
export interface AppleTransaction {
  bundleId: string;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  /** Milliseconds since epoch. Absent on a non-renewing product. */
  expiresDate: number | null;
  purchaseDate: number;
  /** Set when Apple refunded or revoked the purchase. */
  revocationDate: number | null;
  environment: string;
  type: string;
}

/**
 * The Apple Root CA - G3 certificate, DER encoded and base64'd, from
 * https://www.apple.com/certificateauthority/
 *
 * Supplied through the environment rather than committed: pinning a root in
 * source means a rotation needs a release, and a stale pin fails every
 * purchase at once.
 */
function appleRoot(): X509Certificate {
  const raw = process.env.APPLE_ROOT_CA_G3_B64;
  if (!raw) {
    throw new AppleVerificationError(
      'APPLE_ROOT_CA_G3_B64 is not set, so an App Store receipt cannot be verified. ' +
        'Download “Apple Root CA - G3” from https://www.apple.com/certificateauthority/, ' +
        'base64 the .cer file, and set it in the environment. Refusing to grant a ' +
        'subscription on an unverified receipt.',
    );
  }
  try {
    return new X509Certificate(Buffer.from(raw.replace(/\s+/g, ''), 'base64'));
  } catch {
    throw new AppleVerificationError(
      'APPLE_ROOT_CA_G3_B64 is not a readable certificate. It should be the base64 of the DER (.cer) file.',
    );
  }
}

/**
 * Verify the x5c chain: leaf ← intermediate ← root, with the root matching
 * Apple's byte for byte.
 */
function verifyChain(x5c: string[]): X509Certificate {
  if (x5c.length < 2) {
    throw new AppleVerificationError('The receipt carries no certificate chain.');
  }

  // Resolved first so a deployment that never configured the root gets the
  // message that tells it so, rather than a confusing complaint about the
  // certificate Apple sent.
  const root = appleRoot();

  const chain = x5c.map((b64, index) => {
    try {
      return new X509Certificate(Buffer.from(b64, 'base64'));
    } catch {
      throw new AppleVerificationError(`Certificate ${index} in the receipt chain is unreadable.`);
    }
  });

  const now = Date.now();
  for (const cert of chain) {
    if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) {
      throw new AppleVerificationError('A certificate in the receipt chain is outside its validity window.');
    }
  }

  const last = chain[chain.length - 1]!;
  if (!last.raw.equals(root.raw)) {
    throw new AppleVerificationError('The receipt does not chain to the Apple root certificate.');
  }

  for (let i = 0; i < chain.length - 1; i += 1) {
    const child = chain[i]!;
    const parent = chain[i + 1]!;
    if (!child.verify(parent.publicKey)) {
      throw new AppleVerificationError('The receipt certificate chain does not verify.');
    }
  }

  return chain[0]!;
}

/** Verify a StoreKit JWS and return its decoded payload. */
export async function verifySignedPayload<T>(jws: string): Promise<T> {
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(jws);
  } catch {
    throw new AppleVerificationError('That is not a signed App Store payload.');
  }

  if (header.alg !== 'ES256') {
    throw new AppleVerificationError(`Unexpected receipt signature algorithm: ${String(header.alg)}.`);
  }

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length === 0) {
    throw new AppleVerificationError('The receipt has no certificate chain to verify against.');
  }

  const leaf = verifyChain(x5c);
  const key = createPublicKey(leaf.publicKey);

  let payload: Uint8Array;
  try {
    ({ payload } = await compactVerify(jws, key));
  } catch {
    throw new AppleVerificationError('The receipt signature does not match its certificate.');
  }

  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    throw new AppleVerificationError('The receipt payload is not readable JSON.');
  }
}

interface RawTransaction {
  bundleId?: unknown;
  productId?: unknown;
  transactionId?: unknown;
  originalTransactionId?: unknown;
  expiresDate?: unknown;
  purchaseDate?: unknown;
  revocationDate?: unknown;
  environment?: unknown;
  type?: unknown;
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppleVerificationError(`The receipt is missing ${field}.`);
  }
  return value;
}

function ms(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Verify a signed transaction and confirm it is for this app.
 *
 * The bundle id check is not ceremony: without it, a validly signed receipt
 * from any other App Store app would unlock a subscription here.
 */
export async function verifyTransaction(jws: string): Promise<AppleTransaction> {
  const raw = await verifySignedPayload<RawTransaction>(jws);

  const expectedBundle = process.env.APPLE_BUNDLE_ID;
  if (!expectedBundle) {
    throw new AppleVerificationError(
      'APPLE_BUNDLE_ID is not set, so a receipt cannot be checked against this app.',
    );
  }

  const bundleId = str(raw.bundleId, 'a bundle id');
  if (bundleId !== expectedBundle) {
    throw new AppleVerificationError('That receipt belongs to a different app.');
  }

  return {
    bundleId,
    productId: str(raw.productId, 'a product id'),
    transactionId: str(raw.transactionId, 'a transaction id'),
    originalTransactionId: str(raw.originalTransactionId, 'an original transaction id'),
    expiresDate: ms(raw.expiresDate),
    purchaseDate: ms(raw.purchaseDate) ?? Date.now(),
    revocationDate: ms(raw.revocationDate),
    environment: typeof raw.environment === 'string' ? raw.environment : 'Unknown',
    type: typeof raw.type === 'string' ? raw.type : 'Unknown',
  };
}

/**
 * Map an App Store product id onto a plan tier.
 *
 * Configured rather than hard-coded, because the product ids are created in
 * App Store Connect by whoever owns the developer account.
 */
export function tierForProduct(productId: string): 'PRO' | 'COMPANY' | null {
  const pro = [process.env.APPLE_PRODUCT_PRO_MONTHLY, process.env.APPLE_PRODUCT_PRO_YEARLY].filter(
    Boolean,
  );
  const company = [
    process.env.APPLE_PRODUCT_COMPANY_MONTHLY,
    process.env.APPLE_PRODUCT_COMPANY_YEARLY,
  ].filter(Boolean);

  if (pro.includes(productId)) return 'PRO';
  if (company.includes(productId)) return 'COMPANY';
  return null;
}

/** True when the iOS purchase path is configured end to end. */
export function isAppleIapConfigured(): boolean {
  return Boolean(
    process.env.APPLE_BUNDLE_ID &&
      process.env.APPLE_ROOT_CA_G3_B64 &&
      process.env.APPLE_PRODUCT_PRO_MONTHLY,
  );
}

/** A transaction that is currently entitled: not expired, not revoked. */
export function isActive(transaction: AppleTransaction, now = Date.now()): boolean {
  if (transaction.revocationDate !== null) return false;
  if (transaction.expiresDate === null) return true;
  return transaction.expiresDate > now;
}
