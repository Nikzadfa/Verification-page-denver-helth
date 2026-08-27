import type { Metadata } from 'next';
import { POLICY_UPDATED, operator } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy policy — ThermoRivet',
  description: 'What ThermoRivet collects, why, who it goes to, and how to have it deleted.',
};

export default function PrivacyPage() {
  const op = operator();

  return (
    <>
      <h1>Privacy policy</h1>
      <p className="tr-updated">Last updated {POLICY_UPDATED}</p>

      {!op.configured && (
        <p
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--color-warn-500)',
            color: 'var(--color-warn-400)',
          }}
        >
          This deployment has not set <strong>NEXT_PUBLIC_OPERATOR_NAME</strong> and{' '}
          <strong>NEXT_PUBLIC_SUPPORT_EMAIL</strong>. Both are required before submitting to the
          App Store — a policy that does not name its operator is not a policy.
        </p>
      )}

      <p>
        ThermoRivet is a diagnostic tool for HVAC service technicians, operated by{' '}
        <strong>{op.name}</strong> (&ldquo;we&rdquo;). This page describes what the app records,
        why, and what you can do about it. It is written to be read, not to be survived.
      </p>

      <h2>What we hold</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Name, email address, password (stored only as a bcrypt
          hash — we cannot read it), and optionally your phone number, license number, EPA
          certification and years of experience.
        </li>
        <li>
          <strong>Your work.</strong> Diagnoses you run, the measurements and answers you enter,
          equipment details, jobs, and service reports you generate.
        </li>
        <li>
          <strong>Your customers.</strong> Names, phone numbers, email addresses, service
          addresses and any site notes you enter. This is information about other people that you
          have chosen to store here; see &ldquo;Your customers&rsquo; information&rdquo; below.
        </li>
        <li>
          <strong>Photographs</strong> you upload of equipment, rating plates and fault displays.
        </li>
        <li>
          <strong>Sessions.</strong> A session token, the browser or device that signed in, and
          the IP address it signed in from, so you can be shown active sessions and so we can
          revoke one.
        </li>
      </ul>

      <h2>What we do not hold</h2>
      <p>
        No advertising identifiers, no third-party analytics or tracking SDKs, no location
        tracking, and no contacts, calendar or photo library access beyond the individual images
        you choose to upload. We do not sell or share personal information for advertising, and
        nothing here is used to build a profile of you across other apps or websites.
      </p>

      <h2>Who else sees it</h2>
      <p>Only the providers needed to run the product, and only the part each one needs:</p>
      <ul>
        <li>
          <strong>Our hosting and database provider</strong> stores everything above, encrypted in
          transit.
        </li>
        <li>
          <strong>Anthropic</strong> receives the text of a diagnosis and any photograph you
          submit for analysis, in order to generate the response. It is not used to train models.
          If the deployment has no AI key configured, nothing is sent at all — the diagnostic
          engine runs entirely on our own servers.
        </li>
        <li>
          <strong>Stripe</strong> handles payment on the web. We never receive or store your card
          number.
        </li>
        <li>
          <strong>Apple</strong> handles payment for subscriptions bought in the iOS app. We
          receive a signed transaction identifier and an expiry date — not your Apple Account
          details and not your payment method.
        </li>
      </ul>
      <p>
        We disclose information otherwise only where the law requires it, and we will tell you
        when we are permitted to.
      </p>

      <h2>Your customers&rsquo; information</h2>
      <p>
        When you enter a customer&rsquo;s name and address, you are the one deciding to record
        it; we hold it on your behalf. Enter only what you need to do the work, keep it accurate,
        and delete a record when you no longer have a reason to keep it. If a customer asks you
        what you hold about them, everything is on their customer screen in the app.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. Sign-in sessions expire after thirty days by default.
        Deleting your account removes your diagnoses, jobs, reports and photographs immediately;
        if you work without a company, your customer records go with it. If you belong to a
        company, customer records belong to that company and remain with it.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Open <strong>Account</strong> in the app and choose <strong>Delete my account</strong>.
        You will be asked for your password. Deletion is immediate and permanent — we keep no
        backup copy for you to recover from, and support cannot undo it.
      </p>
      <p>
        Cancelling a paid subscription is separate. An App Store subscription is cancelled in your
        Apple Account settings; a web subscription is cancelled from the billing portal. Deleting
        your account here does not stop either one.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export or delete
        your personal information, and to object to certain processing. Access and correction are
        built into the app; for an export or anything else, write to us and we will respond within
        thirty days.
      </p>

      <h2>Children</h2>
      <p>
        ThermoRivet is a professional tool and is not directed to children. We do not knowingly
        collect information from anyone under 16.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed with bcrypt. Session tokens are stored as hashes, so a database copy
        does not yield a working session. Uploaded photographs are private and served through
        time-limited links. No system is perfect; if we ever discover a breach affecting you, we
        will tell you.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially we will say so in the app before the change takes
        effect. The date at the top always reflects the current version.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${op.supportEmail}`}>{op.supportEmail}</a>
        {op.address && (
          <>
            <br />
            {op.address}
          </>
        )}
      </p>
    </>
  );
}
