import type { Metadata } from 'next';
import { POLICY_UPDATED, operator } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of use — ThermoRivet',
  description: 'The agreement covering use of ThermoRivet, including subscriptions and the limits of what the app is for.',
};

export default function TermsPage() {
  const op = operator();

  return (
    <>
      <h1>Terms of use</h1>
      <p className="tr-updated">Last updated {POLICY_UPDATED}</p>

      <p>
        These terms cover your use of ThermoRivet, operated by <strong>{op.name}</strong>. Using
        the app means accepting them.
      </p>

      <h2>What ThermoRivet is</h2>
      <p>
        A diagnostic aid for qualified HVAC service technicians. It ranks likely causes from the
        evidence you give it, tells you which test would settle the question next, and records
        what you found.
      </p>

      <h2>What it is not</h2>
      <p>
        <strong>It does not replace a qualified technician, and it does not carry your
        judgement.</strong> Every conclusion it reaches rests on measurements and observations you
        supplied; a wrong reading produces a wrong answer. Manufacturer fault-code meanings vary
        by model and control board, and entries not confirmed against a manufacturer document are
        labelled as unverified in the app — treat them that way.
      </p>
      <p>
        You are responsible for working safely and lawfully: isolating power, following the
        manufacturer&rsquo;s procedures, complying with codes, and handling refrigerant under the
        certification you hold. The app will warn you about hazards it recognises. It cannot see
        the equipment in front of you.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself and tell us if you think someone else has it. You are
        responsible for what happens under your account. Do not share one account across a crew —
        the Company plan exists for that.
      </p>

      <h2>Subscriptions</h2>
      <p>
        The Free plan is limited. Paid plans unlock unlimited diagnoses, photo analysis, saved
        jobs, customer records and service reports. Current prices are shown on the Plans screen
        before you pay.
      </p>
      <p>
        A subscription bought in the iOS app is billed through your Apple Account, renews
        automatically, and is managed and cancelled in your Apple Account settings. Cancel at
        least 24 hours before a period ends to avoid the next charge. A subscription bought on the
        web is billed by Stripe and cancelled from the billing portal. Deleting your ThermoRivet
        account does not cancel either subscription.
      </p>
      <p>
        We may change prices. A change never applies to a period you have already paid for, and we
        will tell you before the next renewal.
      </p>

      <h2>Your content</h2>
      <p>
        Your diagnoses, jobs, reports, photographs and customer records remain yours. You grant us
        only the permission needed to store them, show them back to you, and process them to
        provide the features you use. We do not use your content to train models.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not upload other people&rsquo;s information you have no reason to hold.</li>
        <li>Do not attempt to bypass a safety control, and do not ask the app to help you do so.</li>
        <li>Do not scrape, resell or redistribute the fault-code and procedure data.</li>
        <li>Do not attack, overload or attempt to gain unauthorised access to the service.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We aim to keep the service up but do not promise uninterrupted availability. Maintenance,
        provider outages and things outside our control all happen. Nothing here is safety
        equipment; do not build a procedure that depends on the app being reachable.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential loss, for
        lost profit, or for damage arising from work performed on equipment. Our total liability
        is limited to what you paid us in the twelve months before the claim. Nothing here limits
        liability that cannot lawfully be limited.
      </p>

      <h2>Ending it</h2>
      <p>
        You can delete your account at any time from the Account screen. We may suspend or end an
        account that breaches these terms, and will say why unless the law prevents it.
      </p>

      <h2>Changes</h2>
      <p>
        We will give notice in the app before a material change takes effect. Continuing to use
        ThermoRivet afterwards means accepting the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${op.supportEmail}`}>{op.supportEmail}</a>
      </p>
    </>
  );
}
