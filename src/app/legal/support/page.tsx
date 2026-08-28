import type { Metadata } from 'next';
import { operator } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Support — ThermoRivet',
  description: 'How to get help with ThermoRivet, and answers to the questions that come up most.',
};

export default function SupportPage() {
  const op = operator();

  return (
    <>
      <h1>Support</h1>

      <p>
        Write to <a href={`mailto:${op.supportEmail}`}>{op.supportEmail}</a>. Include what you were
        diagnosing and what the app showed you — a screenshot is usually faster than a
        description. We answer within two business days.
      </p>

      <h2>The diagnosis reached the wrong conclusion</h2>
      <p>
        Send us the diagnosis. Every session records the whole walk — each reading, each answer,
        and how the ranking moved at every step — so a wrong conclusion is traceable to the step
        where it went wrong, rather than being a matter of opinion. That is how the engine gets
        fixed.
      </p>

      <h2>A fault code is wrong for my model</h2>
      <p>
        Tell us the manufacturer, the exact model number and the control board. Codes are stored
        per model and per board precisely because the same number means different things on
        different equipment, and a code we have not confirmed against a manufacturer document is
        marked unverified in the app.
      </p>

      <h2>Managing your subscription</h2>
      <p>
        If you subscribed in the iOS app, open <strong>Settings → your name → Subscriptions</strong>{' '}
        on your iPhone to change or cancel it. Apple, not us, handles the billing, and only you can
        cancel it there.
      </p>
      <p>
        If you subscribed on the web, open <strong>Account → Change plan</strong> and use the
        billing portal.
      </p>
      <p>
        Bought a subscription and the app still shows Free? On iOS, tap{' '}
        <strong>Restore purchases</strong> on the Plans screen. If that does not fix it, write to
        us with the date of purchase.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Open <strong>Account → Delete my account</strong>. It asks for your password and it is
        permanent. Cancel any subscription separately — deleting the account does not stop
        billing.
      </p>

      <h2>Using it in the field</h2>
      <ul>
        <li>
          Add ThermoRivet to your home screen and it opens full-screen, without the browser bar.
        </li>
        <li>
          Voice input uses your phone&rsquo;s own speech recognition. On iOS this needs Safari or
          the app, and permission the first time.
        </li>
        <li>
          Dark mode is the default because most service work happens in dark spaces. The sun icon
          in the header switches it.
        </li>
      </ul>

      <h2>Safety</h2>
      <p>
        ThermoRivet assists a qualified technician; it does not replace one. It will never tell
        you to bypass a safety control, and it refuses to help with that if asked. If a hazard
        banner appears above an instruction, it applies to the step underneath it.
      </p>
    </>
  );
}
