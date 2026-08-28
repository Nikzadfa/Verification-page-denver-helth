# Wireless gauges

Pair a wireless probe set and its readings go straight into the diagnosis:
suction and liquid pressures, line temperatures, return and supply air. The
app computes superheat and subcooling live from those readings and hands them
to the engine in one tap, instead of six numbers typed from a manifold screen.

Open a diagnosis and tap **Gauges**.

---

## Which probes work today

| | Vendor | Products | Status |
|---|---|---|---|
| ✅ | **Any probe using the Bluetooth standard profile** | Environmental Sensing service (0x181A) | **Works now.** Temperature, humidity and pressure decode from the published Bluetooth SIG layout. |
| ⚠️ | Fieldpiece | JobLink — JL3KH2, JL3PR2, JL3RH, SM480V | Needs the protocol |
| ⚠️ | Testo | Smart Probes 549i, 605i, 115i, 405i | Needs the protocol |
| ⚠️ | Yellow Jacket | ManTooth P51-870, P51-TITAN | Needs the protocol |
| ⚠️ | Accutools / Navac / Elitech | BluVac, NMG, wireless probes | Not investigated |

### Why Fieldpiece does not work yet, stated plainly

JobLink probes speak Bluetooth Low Energy, but Fieldpiece uses a
vendor-specific GATT service and **does not publish the characteristic
layout**. There is no public SDK and no specification to implement from.

That is a genuine blocker, not a missing afternoon of work. A driver written
from guesswork would decode arbitrary bytes into plausible-looking pressures
and temperatures, and a technician would then adjust a charge from them. That
failure is silent and it is worse than having no wireless support at all, so
this codebase does not ship one.

Testo and Yellow Jacket are in exactly the same position.

### What would unblock it

Any one of these is enough, and each produces a driver in one file:

1. **A vendor agreement.** Fieldpiece and Testo both have partner programmes.
   An NDA and a protocol document is the clean route, and the only one that
   stays working when they ship new firmware.
2. **A probe on the bench.** With a JobLink probe and a BLE sniffer (nRF
   Connect on a phone is enough to start), the service and characteristic
   layout can be established directly. This is legal for hardware you own and
   is how most community integrations exist, but it is your call to make and
   it needs the hardware in hand.
3. **A probe that already speaks the standard.** Some manufacturers expose
   0x181A alongside their own service. If yours does, it works today with no
   new code — pair it and see.

Everything around the gap is built: transport, decoding, assignment, staleness,
live superheat and subcooling, and capture into the diagnosis. Adding a vendor
means implementing `ProbeDriver` in `src/lib/probes/drivers/` and returning
readings. See `environmentalSensing.ts` for the shape — it is about 100 lines.

---

## Trying it without hardware

The Gauges tab offers a **simulated probe set**: five scenarios (operating
correctly, low charge, liquid-line restriction, overcharge, dirty condenser)
built from the app's own P/T tables, so the pressures and line temperatures are
mutually consistent and the superheat you see is the superheat the scenario
says it is.

It even models the startup transient — superheat runs high and settles over
about a minute — because watching it settle is the thing a live gauge gives you
that a typed snapshot cannot.

**Simulated readings are never recorded.** The capture path refuses them, the
panel is banded in amber the whole time, and the send button says so. This must
not become a way to put generated numbers into a customer's service report.

---

## Platform support

| Platform | Works | Notes |
|---|---|---|
| Chrome / Edge on Android | ✅ | The main field case. |
| Chrome / Edge on Windows, macOS, ChromeOS | ✅ | |
| **Safari, any iOS browser** | ❌ | Apple has not shipped Web Bluetooth, and every iOS browser is WebKit underneath — Chrome on an iPhone will not help. |
| Firefox | ❌ | No Web Bluetooth. |

On iOS the probes have to be reached through a native plugin. The code is
shaped for it: everything above `ProbeTransport` is platform-independent, so
the iOS path is one more implementation of that interface (a Capacitor BLE
plugin) with nothing else changing. It is not written yet — see `IOS.md` for
why anything native needs a Mac.

The app says which of these you are on rather than failing silently. On an
iPhone it tells you to use the app or type the readings; it does not suggest
switching browsers, because that advice is wrong there.

---

## How a reading becomes a diagnosis

1. **Pair.** The device picker filters on the services the drivers know.
2. **Say where each probe is clamped.** This is the step that cannot be
   skipped or inferred: a pipe clamp reads the same on the suction line and
   the liquid line, and swapping them turns a healthy system into a diagnosis.
   Until a channel is assigned, it feeds nothing.
3. **Watch it settle.** Superheat and subcooling recompute on every packet,
   from the app's P/T tables — dew point on the low side, bubble point on the
   liquid line, which is what keeps a zeotropic blend honest.
4. **Send.** The readings go into the same path a typed reading takes, tagged
   `source: probe`, with the device name kept alongside each one.

### What is refused, and why

| Situation | What happens |
|---|---|
| Channel not assigned | Not sent. The panel says which probe needs a position. |
| Last packet over a minute old | Not sent. A probe that dropped off still shows its last value; writing that in as current is worse than no probe. |
| Packet 12–60 seconds old | Sent, and the record says the reading was not fresh. A dropped packet on a noisy site is normal; hiding it is not. |
| Two probes assigned to the same line | Only the first is sent. Two clamps both set to "suction" is a real manifold mistake, and silently overwriting one would hide it. |
| Simulated probe | Never sent, under any circumstances. |

Nothing is dropped quietly. Every exclusion is listed under **Not being sent**
with the reason.

---

## Provenance

A probe reading is stored with `source: 'probe'` rather than `'manual'`, and
the device it came from is kept with it. That distinction is worth carrying:
a reading taken straight off a gauge is more defensible than one transcribed
from memory in the van, and the service report can say which it was.

The transcript line reads **"From wireless probes — …"** so the diagnosis
history shows it too.

---

## One caveat on pressure

The Bluetooth standard reports **absolute** pressure; refrigeration gauges read
**gauge** pressure. Converting between them needs the local barometric
pressure, and the decoder assumes a sea-level atmosphere.

At altitude that assumption is wrong by roughly 1 psi per 2,000 ft — enough to
move a superheat calculation by a degree or so in Denver. The decoder reports
the assumption rather than hiding it, and the live panel already carries the
standing P/T warning. A vendor driver reading native gauge pressure has no such
problem.
