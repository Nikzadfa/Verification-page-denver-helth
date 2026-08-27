/**
 * Apple receipt verification.
 *
 * The property under test is that every failure path refuses. A receipt
 * verifier that falls open when something is missing hands a free Pro
 * subscription to anyone willing to POST JSON, and the failure is silent —
 * nothing looks wrong from the outside until the revenue does.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AppleVerificationError,
  isActive,
  isAppleIapConfigured,
  tierForProduct,
  verifySignedPayload,
  verifyTransaction,
} from '../src/lib/billing/apple';

const KEYS = [
  'APPLE_BUNDLE_ID',
  'APPLE_ROOT_CA_G3_B64',
  'APPLE_PRODUCT_PRO_MONTHLY',
  'APPLE_PRODUCT_PRO_YEARLY',
  'APPLE_PRODUCT_COMPANY_MONTHLY',
  'APPLE_PRODUCT_COMPANY_YEARLY',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** A syntactically valid JWS whose signature is meaningless. */
function fakeJws(header: object, payload: object): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64(header)}.${b64(payload)}.${Buffer.from('not-a-signature').toString('base64url')}`;
}

describe('verification refuses rather than falling open', () => {
  it('refuses when no Apple root certificate is configured', async () => {
    const jws = fakeJws({ alg: 'ES256', x5c: ['aaaa', 'bbbb'] }, { bundleId: 'com.example.app' });

    await expect(verifySignedPayload(jws)).rejects.toThrow(AppleVerificationError);
    await expect(verifySignedPayload(jws)).rejects.toThrow(/APPLE_ROOT_CA_G3_B64/);
  });

  it('refuses a payload with no certificate chain at all', async () => {
    process.env.APPLE_ROOT_CA_G3_B64 = Buffer.from('nonsense').toString('base64');
    const jws = fakeJws({ alg: 'ES256' }, { bundleId: 'com.example.app' });

    await expect(verifySignedPayload(jws)).rejects.toThrow(/no certificate chain/i);
  });

  it('refuses an algorithm other than ES256', async () => {
    // "alg": "none" is the classic JWT forgery. It must not reach the chain
    // check, let alone succeed.
    const jws = fakeJws({ alg: 'none', x5c: ['aaaa'] }, { bundleId: 'com.example.app' });
    await expect(verifySignedPayload(jws)).rejects.toThrow(/signature algorithm/i);
  });

  it('refuses something that is not a JWS', async () => {
    await expect(verifySignedPayload('hello')).rejects.toThrow(AppleVerificationError);
  });

  it('refuses a transaction when no bundle id is configured to compare against', async () => {
    process.env.APPLE_ROOT_CA_G3_B64 = Buffer.from('nonsense').toString('base64');
    const jws = fakeJws({ alg: 'ES256', x5c: ['aaaa', 'bbbb'] }, { bundleId: 'com.example.app' });

    await expect(verifyTransaction(jws)).rejects.toThrow(AppleVerificationError);
  });
});

describe('configuration gate', () => {
  it('reports unconfigured until bundle id, root cert and a product are all set', () => {
    expect(isAppleIapConfigured()).toBe(false);

    process.env.APPLE_BUNDLE_ID = 'com.example.thermorivet';
    expect(isAppleIapConfigured()).toBe(false);

    process.env.APPLE_ROOT_CA_G3_B64 = 'aaaa';
    expect(isAppleIapConfigured()).toBe(false);

    process.env.APPLE_PRODUCT_PRO_MONTHLY = 'pro.monthly';
    expect(isAppleIapConfigured()).toBe(true);
  });
});

describe('product mapping', () => {
  it('maps only the product ids that are configured', () => {
    process.env.APPLE_PRODUCT_PRO_MONTHLY = 'com.example.pro.monthly';
    process.env.APPLE_PRODUCT_COMPANY_YEARLY = 'com.example.company.yearly';

    expect(tierForProduct('com.example.pro.monthly')).toBe('PRO');
    expect(tierForProduct('com.example.company.yearly')).toBe('COMPANY');
    expect(tierForProduct('com.example.pro.yearly')).toBeNull();
  });

  it('does not match an unset product id against an empty environment variable', () => {
    // With APPLE_PRODUCT_* unset, an empty-string productId must not slip
    // through the includes() check and grant a plan.
    expect(tierForProduct('')).toBeNull();
  });
});

describe('entitlement window', () => {
  const base = {
    bundleId: 'com.example.thermorivet',
    productId: 'pro.monthly',
    transactionId: '1',
    originalTransactionId: '1',
    purchaseDate: 1_000,
    environment: 'Production',
    type: 'Auto-Renewable Subscription',
  };

  it('is entitled up to the expiry and not past it', () => {
    const t = { ...base, expiresDate: 2_000, revocationDate: null };
    expect(isActive(t, 1_999)).toBe(true);
    expect(isActive(t, 2_001)).toBe(false);
  });

  it('is not entitled once revoked, however far off the expiry is', () => {
    // A refund revokes the transaction while the expiry date stays in the
    // future. Reading the expiry alone would keep a refunded user on Pro.
    const t = { ...base, expiresDate: Number.MAX_SAFE_INTEGER, revocationDate: 1_500 };
    expect(isActive(t, 1_600)).toBe(false);
  });

  it('treats a non-expiring purchase as entitled', () => {
    const t = { ...base, expiresDate: null, revocationDate: null };
    expect(isActive(t, Date.now())).toBe(true);
  });
});
