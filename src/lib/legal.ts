/**
 * Who is publishing this deployment.
 *
 * The legal pages name a real operator and a real contact address, and both
 * have to come from whoever runs the deployment — this codebase does not know
 * them and must not invent them. An unset value renders as a visible
 * placeholder rather than a plausible-looking fake, so a missing entry is
 * caught before it reaches App Store review rather than after.
 */

export interface Operator {
  name: string;
  supportEmail: string;
  /** Blank when not configured; the pages then omit the postal address block. */
  address: string;
  configured: boolean;
}

const PLACEHOLDER = '[not configured]';

export function operator(): Operator {
  const name = process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim();
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const address = process.env.NEXT_PUBLIC_OPERATOR_ADDRESS?.trim() ?? '';

  return {
    name: name || PLACEHOLDER,
    supportEmail: supportEmail || PLACEHOLDER,
    address,
    configured: Boolean(name && supportEmail),
  };
}

/** The date the policy text itself last changed, not the deploy date. */
export const POLICY_UPDATED = '27 August 2026';
