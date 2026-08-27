# Shipping ThermoRivet on the App Store

Everything in this repository that can be done without a Mac is done. What is
left needs Xcode, an Apple Developer Program membership, and your own App Store
Connect account — none of which can be substituted for from a build server.

Read the honest assessment at the bottom before you spend the $99.

---

## What is already in place

| Requirement | Guideline | Where |
|---|---|---|
| In-app account deletion | 5.1.1(v) | `/account` → Delete my account, `src/lib/account/delete.ts` |
| Public privacy policy | 5.1.1 / App Privacy | `/legal/privacy` (reachable signed out) |
| Public support page | App Store Connect | `/legal/support` |
| Terms including auto-renew disclosure | 3.1.2 | `/legal/terms` |
| Purchases through IAP, not Stripe | 3.1.1 | `src/components/UpgradeButton.tsx`, `src/lib/native.ts` |
| No mention of outside payment on iOS | 3.1.1 | `src/components/WebOnly.tsx` |
| Restore purchases | 3.1.1 | Plans screen, iOS only |
| Server-side receipt verification | — | `src/lib/billing/apple.ts` (+ 11 tests) |
| Renewal and refund handling | — | `/api/iap/apple/notifications` |
| 1024×1024 opaque app icon | Asset spec | `npm run icons` → `resources/ios/AppIcon-1024.png` |
| Launch screen | — | `resources/ios/Splash-2732.png` |
| StoreKit 2 native bridge | — | `ios/plugin/ThermoRivetStoreKit.swift` |

---

## 1. Before you touch Xcode

Deploy the web app first and confirm it works in Mobile Safari. The iOS shell
loads your deployed origin; there is nothing to debug natively until the web
app is up. `DEPLOY.md` covers that.

Then set these in your deployment's environment:

```
NEXT_PUBLIC_OPERATOR_NAME="Your Company LLC"
NEXT_PUBLIC_SUPPORT_EMAIL="support@yourdomain.com"
NEXT_PUBLIC_OPERATOR_ADDRESS="123 Example St, Denver, CO"
```

Until you do, `/legal/privacy` renders a visible warning saying the operator is
not configured. That is deliberate — a policy that does not name who is
responsible is not a policy, and a reviewer will read that page.

---

## 2. Create the subscriptions in App Store Connect

Under **Monetization → Subscriptions**, make a subscription group
(“ThermoRivet”) and inside it:

| Reference name | Product ID | Price |
|---|---|---|
| Pro Monthly | `com.yourcompany.thermorivet.pro.monthly` | $29.00 |
| Pro Yearly | `com.yourcompany.thermorivet.pro.yearly` | $290.00 |

Each needs a display name, a description, and a localised price tier. Apple
will not review the app until the products are at least "Ready to Submit".

Set them in the environment:

```
APPLE_BUNDLE_ID="com.yourcompany.thermorivet"
APPLE_PRODUCT_PRO_MONTHLY="com.yourcompany.thermorivet.pro.monthly"
APPLE_PRODUCT_PRO_YEARLY="com.yourcompany.thermorivet.pro.yearly"
NEXT_PUBLIC_APPLE_PRODUCT_PRO_MONTHLY="com.yourcompany.thermorivet.pro.monthly"
```

Then the root certificate that receipts are verified against. Download **Apple
Root CA - G3** from <https://www.apple.com/certificateauthority/> and:

```bash
base64 -w0 AppleRootCA-G3.cer     # -i on macOS: base64 -i AppleRootCA-G3.cer
```

Paste the result into `APPLE_ROOT_CA_G3_B64`.

**Without that variable no purchase is ever granted.** Verification refuses
rather than trusting a receipt it cannot check — which is the correct
behaviour, and is covered by a test, but it does mean a missing variable looks
like "purchases silently do nothing".

Finally, under **App Information → App Store Server Notifications**, set the
production and sandbox URLs to:

```
https://your-domain.com/api/iap/apple/notifications
```

That is how renewals, cancellations and refunds reach the app. Without it a
refunded user keeps Pro until their period would have ended.

---

## 3. Generate the iOS project

On a Mac, with Xcode and CocoaPods installed:

```bash
npm ci
npm run icons
export CAPACITOR_SERVER_URL="https://your-domain.com"
export APPLE_BUNDLE_ID="com.yourcompany.thermorivet"
npx cap add ios
npm run ios:sync
npm run ios:open
```

`npx cap add ios` is run once; `npm run ios:sync` after every config change.
The `ios/` directory it creates is not committed here — it is generated, and it
carries signing settings specific to your developer account.

### Add the StoreKit plugin

Drag both files from `ios/plugin/` into the Xcode project under **App/App**,
ticking "Copy items if needed":

- `ThermoRivetStoreKit.swift`
- `ThermoRivetStoreKit.m`

Xcode will offer to create a bridging header — accept. Set the deployment
target to **iOS 15.0** or later; StoreKit 2 does not exist before that.

Verify it registered: run on a simulator, open the Plans screen, and the
button should say "Upgrade to Pro" with "Restore purchases" beneath it. If
"Restore purchases" is missing, the web layer did not find the plugin.

### Icons and launch screen

In Xcode, open `App/Assets.xcassets`:

- **AppIcon** ← `resources/ios/AppIcon-1024.png`
- **Splash** ← `resources/ios/Splash-2732.png`

The icon is generated opaque and un-rounded on purpose. Apple applies the mask
itself and rejects an icon with an alpha channel; `npm run icons` fails loudly
rather than producing one.

### Test purchases before submitting

Create a StoreKit configuration file in Xcode (**File → New → StoreKit
Configuration File**), sync it with App Store Connect, and buy a subscription
in the simulator. Confirm the plan changes in the app — that proves the whole
chain: plugin → `/api/iap/apple` → certificate verification → `Subscription`
row → entitlements.

---

## 4. App Store Connect listing

**App Privacy.** Answer it from what the app actually does, which is:

| Data | Collected | Linked to identity | Used for tracking |
|---|---|---|---|
| Name, email address | Yes | Yes | No |
| Phone number | Yes (optional) | Yes | No |
| Customer contact info you enter | Yes | Yes | No |
| Photos you upload | Yes | Yes | No |
| User content (diagnoses, notes) | Yes | Yes | No |
| Identifiers (session) | Yes | Yes | No |
| Usage data, diagnostics | No | — | — |
| Location, contacts, health | No | — | — |

There are no advertising SDKs and no third-party analytics, so "Used for
Tracking" is No throughout and no tracking permission prompt is required.

**Age rating.** 4+. There is no objectionable content; it is a trade tool.

**Review notes.** Give the reviewer a working account — they will not create
one, and an app they cannot get into is rejected within a day. Something like:

> ThermoRivet is a diagnostic assistant for HVAC service technicians.
>
> Test account: reviewer@yourdomain.com / (password)
> This account is on the Pro plan so every feature is reachable.
>
> To see the core feature: Diagnose → "AC is running but not cooling" →
> answer the questions it asks. The app asks one question at a time and
> explains why it is asking. It is not a chatbot; the diagnostic reasoning
> runs on our own server.
>
> Subscriptions are sold only through In-App Purchase on iOS.

**Screenshots.** 6.7" (1290×2796) and 6.5" (1242×2688) are required. Take them
on a simulator from: the home grid, a diagnosis mid-walk showing the confidence
ranking, a fault-code lookup, the customer list, and a service report.

---

## 5. The honest part: Guideline 4.2

**This shell loads a website in a web view, and Apple rejects apps that do
that.** Guideline 4.2 (Minimum Functionality) exists precisely for repackaged
websites, and a reviewer who concludes that is all this is will reject it.
Expect that conversation rather than being surprised by it.

What is in your favour:

- The app does something a website cannot: StoreKit purchases run natively.
- It is a professional tool with real subject-matter depth, not a storefront.
- The interface is built for a phone in a gloved hand, not a desktop site
  squeezed into a viewport.

What would make the case materially stronger, roughly in order of value:

1. **Native camera capture** for rating plates (`@capacitor/camera`), instead
   of a file picker. This is the single most convincing addition — reviewers
   respond to hardware access.
2. **Offline access** to saved jobs and the fault-code database. A technician
   in a basement has no signal, and this is a genuine feature rather than a
   compliance gesture.
3. **Push notifications** for job reminders.
4. **Haptics** on measurement entry and hazard banners.

None of these are wired up. They need native code and a Mac to build, and
pretending otherwise would waste your submission attempt.

If you would rather not fight 4.2, the honest alternative is worth saying: the
web app already installs to the home screen, runs full-screen, and costs
nothing to distribute. Many trade tools ship exactly that way.

---

## 6. What I could not do from here

- Build, sign, or upload an `.ipa` — needs Xcode and macOS.
- Enrol in the Apple Developer Program ($99/year) — needs your identity.
- Create the App Store Connect record or the subscription products — needs your
  account.
- Compile the StoreKit plugin. It is written and commented, but it has never
  been through a Swift compiler. Budget time for small fixes on the first
  build.
- Test a real purchase. The verification path has unit tests covering every
  refusal case; the success path needs a sandbox Apple Account.
