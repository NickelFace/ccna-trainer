---
title: Physical Interfaces, Cabling, and the Errors That Show Up on Them
lead: Copper vs. fiber, single-mode vs. multimode, full duplex vs. half duplex — and how to read interface counters to tell exactly what broke.
---

## What you're actually choosing at Layer 1

Three questions decide the choice of medium: **how far**, **how fast**, and **what's nearby
to interfere**.

| | Copper (UTP) | Multimode (MMF) | Single-mode (SMF) |
|---|---|---|---|
| Range | up to 100 m | hundreds of meters (up to ~550 m at 1G) | tens of kilometers |
| Light source | — | LED/VCSEL, 850 nm | laser, 1310/1550 nm |
| Core diameter | — | 50 or 62.5 µm | ~9 µm |
| Interference (EMI) | susceptible | immune | immune |
| Eavesdropping | possible via induction | practically none | practically none |
| Cost | low | medium | higher — the fiber and the receiver optics both cost more |

Hence the standard "two facts that differentiate fiber from copper," asked outright: **fiber
goes farther** and **it isn't affected by electromagnetic interference**. On top of that —
higher throughput and less attenuation over distance.

Within fiber itself the distinction is simple: **single-mode for long distances, multimode
for short ones**; the smaller the core, the less modal dispersion, and the farther the signal
reaches.

> [!key] Remember
> If the question says "between campus buildings," "through an area with high-voltage
> equipment," or "more than 100 meters" — the answer is fiber. Inside a single floor, under
> 100 m — twisted pair, since it's cheaper.

## Twisted-pair categories and Ethernet standards

| Standard | Speed | Medium | Range |
|---|---|---|---|
| 10BASE-T | 10 Mbps | Cat3+ | 100 m |
| 100BASE-TX | 100 Mbps | Cat5 | 100 m |
| 1000BASE-T | 1 Gbps | Cat5e | 100 m |
| 10GBASE-T | 10 Gbps | Cat6a | 100 m (Cat6 — 55 m) |
| 1000BASE-SX | 1 Gbps | multimode | ~550 m |
| 1000BASE-LX | 1 Gbps | single-mode | up to 10 km |

1000BASE-T uses **all four pairs** of the twisted-pair cable simultaneously in both
directions; 100BASE-TX uses two pairs (one to transmit, one to receive). The practical
consequence: a cable with one broken pair can bring up a link at 100 Mbps and fail to bring
it up at gigabit.

## Straight-through and crossover cables

- **Straight-through** — connects unlike device types: PC↔switch, router↔switch.
- **Crossover** — connects like device types: switch↔switch, PC↔PC, PC↔router,
  router↔router.

An easier way to remember the rule: **a router and a PC belong to the same class** (both are
"end" devices, transmitting on 1–2 pairs), while a switch and a hub belong to a different
class. Same class → crossover.

Modern equipment supports **Auto-MDIX**: the port itself detects which pair arrived and
swaps its own transmitter and receiver accordingly. So in practice almost any cable will
work — but the exam asks about the wiring scheme, not about Auto-MDIX, and Auto-MDIX
requires speed/duplex negotiation to be enabled.

A **console cable** (rollover, RJ-45 → DB9 or USB) is a different story entirely: it's not
about networking at all — it's about accessing a device's CLI with no network involved, at
9600 baud, 8-N-1, no flow control.

## Duplex, speed, and what happens on a mismatch

Autonegotiation (802.3u autonegotiation) is an exchange of "pages" describing supported
modes. If both sides are set to auto, they agree on the best mode both support. Problems
start when **one side is fixed manually while the other is in auto**: the auto side can't
hear the negotiation, and by the rule of parallel detection it falls back to **guessing the
speed and assuming half duplex**.

The result is the classic **duplex mismatch**: one side full, the other half.

```cli
SW1# show interfaces gigabitethernet0/1
GigabitEthernet0/1 is up, line protocol is up
  Half-duplex, 100Mb/s, media type is 10/100/1000BaseTX
  ...
  25634 packets input, 3459283 bytes, 0 no buffer
  Received 843 broadcasts (0 multicasts)
  15 runts, 0 giants, 0 throttles
  241 input errors, 190 CRC, 51 frame, 0 overrun, 0 ignored
  0 output errors, 3427 collisions, 0 interface resets
  512 late collisions
```

How to read this:

| Counter | What it tells you |
|---|---|
| **CRC** | the checksum didn't match: a bad cable, interference, a bad SFP, or, on the half-duplex side, the effect of collisions |
| **runts** | frames shorter than 64 bytes — usually cut off by a collision |
| **giants** | frames longer than the MTU — often "jumbo" on one side while the other uses a normal MTU |
| **late collisions** | a collision after the first 64 bytes — almost always a duplex mismatch or a segment that's too long |
| **input errors** | the sum of runts + giants + CRC + frame + overrun |
| **collisions** | normal only in half duplex; in full duplex there should be none at all |
| **interface resets** | the link kept re-establishing — a "flapping" link, a bad patch cable, a failing SFP |

> [!trap] Trap
> **Late collisions on a port mean duplex mismatch**, until proven otherwise. Ordinary
> collisions in half duplex are normal; late collisions never are.

The symptom of a duplex mismatch, from the user's point of view, is "the network works, but
it's really slow" — throughput drops by an order of magnitude, because the half-duplex side
treats every incoming frame arriving during its own transmission as a collision and backs
off.

## Interface states

The line `GigabitEthernet0/1 is X, line protocol is Y` reads as "physical layer, logical
layer":

| Line | What it means |
|---|---|
| `up / up` | everything's fine |
| `up / down` | the physical layer is fine, but the two sides can't agree: mismatched encapsulation, keepalives, or, on a trunk, mismatched trunking mode |
| `down / down` | no link: cable, the port disabled on the other end, a speed mismatch, a bad SFP |
| `administratively down / down` | `shutdown` has been applied locally |

```cli
SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     10.1.1.1        YES manual up                    up
GigabitEthernet0/1     unassigned      YES unset  administratively down down
```

`show interfaces status` on a switch gives the same information more compactly and adds a
reason: `notconnect`, `err-disabled` (a protection mechanism triggered — port security, BPDU
guard), `disabled`.

## Point-to-point vs. shared medium

- **Point-to-point** — two devices on a link, each in its own collision domain, full duplex.
  This describes the entire modern switched network.
- **Shared media** — a common medium where only one device can transmit at a time: a hub,
  coax, a wireless network. This needs arbitration — CSMA/CD on wired Ethernet, CSMA/CA on
  Wi-Fi.

CSMA/CD is **not used at all** on a full-duplex switched network — collisions simply can't
happen. This is a common correct answer in "what's true about full duplex" questions.

## How this gets fixed in practice

```cli
! Set both sides to match — or both to auto, there's no third option
SW1(config)# interface gigabitethernet0/1
SW1(config-if)# speed 100
SW1(config-if)# duplex full

! Clear counters before testing, or you're looking at history
SW1# clear counters gigabitethernet0/1

! Check what the optical module reports (levels, type, range)
SW1# show interfaces gigabitethernet0/1 transceiver
```

The order of operations for "slow / drops": look at `show interfaces` on both sides →
compare duplex and speed → clear counters → run traffic → check again which counter is
climbing. If CRC climbs while duplex matches on both sides, the problem is the cable or the
optics, not the configuration.

## CSMA/CD, and where the 64-byte minimum comes from

In half duplex, a station listens to the medium, starts transmitting, and keeps listening.
Hearing someone else's signal during its own transmission is a **collision**: both sides send
a jam signal, wait a random interval (**binary exponential backoff**), and try again.

Ethernet's minimum frame size — **64 bytes** — was chosen so that during the time it takes to
transmit the shortest possible frame, a signal has time to reach the far end of the maximum
segment length and come back. While the station is still transmitting, it's still able to
hear a collision and handle it correctly.

Hence the meaning of these counters:

- **collision** — detected within the first 64 bytes: a routine event in half duplex, the
  frame is simply retransmitted;
- **late collision** — after 64 bytes: the station has already "released" the frame and can't
  properly retransmit it. This happens with a duplex mismatch (the full-duplex side
  transmits whenever it wants) or with a segment that's too long, where the signal doesn't
  make it back in time;
- **runt** — a truncated frame shorter than 64 bytes, usually the result of a collision.

On a full-duplex switched network none of this exists: the medium isn't shared, and CSMA/CD
is turned off.

## Bandwidth, throughput, and latency

Terms that get distinguished in questions:

| Term | What it means |
|---|---|
| **Bandwidth** | the nominal speed of the link: 1 Gbps |
| **Throughput** | the actual achieved transfer rate, including all overhead |
| **Goodput** | useful application data, with headers and retransmissions excluded |
| **Latency** | one-way delivery delay |
| **Jitter** | variation in delay between packets |

Latency is made up of four parts: **serialization** (the time to push a frame onto the wire —
depends on port speed), **propagation** (the speed of light in the medium, ~5 µs per
kilometer), **processing** (handling by the device), and **queuing** (waiting in a queue
during congestion). In practice, only the last one can be managed — that's QoS's job.

Practical takeaway for questions: replacing a 100 Mbps link with a 1 Gbps link reduces
serialization delay, but does nothing to shorten the distance — latency to a remote site
stays the same.

## Structured cabling system

Terms that appear in wording about physical installation:

- **MDF** (main distribution frame) — the building's main cross-connect, usually where the
  core and the connection to the provider live too.
- **IDF** (intermediate distribution frame) — the floor closet with the access switches.
- **Backbone / vertical cabling** — the run between the MDF and IDFs, almost always fiber.
- **Horizontal cabling** — from the floor closet to the wall jack, copper, up to 90 meters.
- **Patch panel** — the panel where horizontal cabling terminates; short patch cords run from
  it into the switch.
- **Work area** — the wall jack and the patch cord to the user's device.

This explains the "100 meters" limit: 90 m of horizontal cabling plus patch cords on both
ends. And it explains why the vertical run is built with fiber — the distances between
floors and buildings exceed copper's limit, and risers are full of electrical interference.

## Transceivers and connectors

A switch port can be fixed (`10/100/1000BaseTX` built into the chassis) or **modular** — a
transceiver plugs in, and it's the transceiver that determines the medium and the range.

| Module | Speed | What plugs in |
|---|---|---|
| **SFP** | 1 Gbps | fiber (SX/LX/ZX) or copper (1000BASE-T) |
| **SFP+** | 10 Gbps | SR/LR/ER fiber, DAC cable |
| **SFP28** | 25 Gbps | fiber, DAC |
| **QSFP+ / QSFP28** | 40 / 100 Gbps | MPO fiber, DAC/AOC |

The letters in an optical module's name indicate range and fiber type: **SR/SX** —
multimode, short distances; **LR/LX** — single-mode, up to 10 km; **ER/ZX** — single-mode,
tens of kilometers. The module has to match the fiber: an LR module will "run" over
multimode, but not at its rated distance and not without errors.

**DAC** (direct attach copper) — a ready-made copper cable with connectors soldered on, 1–7
meters: cheaper than fiber, used inside a rack. **AOC** — the same idea, but optical, for
tens of meters.

Connector types named in questions: **RJ-45** for copper, **LC** (small duplex) and **SC**
(square) for fiber, **MPO/MTP** — multi-fiber, for 40G/100G, **ST** — the old bayonet-style
connector.

> [!key] Remember
> Fiber always uses **two strands**: one to transmit, one to receive. If a link won't come up
> on a new fiber run, the first hypothesis is **TX and RX are swapped** (check by swapping
> one strand). On copper, Auto-MDIX handles this automatically.

## Reading optical status

```cli
SW1# show interfaces gigabitethernet1/0/49 transceiver detail
                              Optical   Optical
           Temperature Voltage  Tx Power  Rx Power
Port       (Celsius)   (Volts)  (dBm)     (dBm)
Gi1/0/49   34.5        3.29     -2.5      -6.8

SW1# show interfaces gigabitethernet1/0/49 | include error|CRC|input
     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored
```

Optical power is measured in **dBm** and is always negative for a receiver. Rough
guidelines: receive power around −3…−15 dBm is normal for a typical gigabit SFP; near −20 and
below is "on the edge" — errors will show up the moment the connector picks up any dirt. Zero
or "N/A" in Rx Power on a link that's up means the module has no DOM (digital diagnostics),
not that it's broken.

Causes of falling receive power, roughly in order of how often they occur: a dirty or
scratched connector, too tight a fiber bend, extra patch panels in the path, a damaged patch
cord. You clean optics; you don't "force" them.

## Copper: length, category, interference

- The **100-meter** limit is 90 m of horizontal cabling plus up to 5 m of patch cords on each
  end. Exceeding it doesn't just mean "slower" — it means an unstable link with rising error
  counts.
- **Category** has to match the speed: Cat5e handles gigabit, Cat6a handles 10 Gbps at 100 m.
  Gigabit over an old Cat5 sometimes comes up and works with errors — the worst kind of
  failure, because it "technically works."
- **Shielding** (STP/FTP) is needed near power lines and industrial equipment, and it
  requires proper grounding; an improperly grounded shield makes things worse.
- **EMI** — sources: power cables in the same tray, fluorescent lights, motors, welding
  equipment. The symptom is CRC errors that appear periodically, "on the shop floor's
  schedule." The classic source of induction is the power wiring itself: AC current in an
  outlet runs at **60 Hz** (US/Canada) or 50 Hz (most of the rest of the world), and that
  exact frequency is what "hums" into an unshielded twisted pair run nearby.

Built-in cable test on Catalyst switches:

```cli
SW1# test cable-diagnostics tdr interface gigabitethernet1/0/5
SW1# show cable-diagnostics tdr interface gigabitethernet1/0/5
Interface Speed Local pair Pair length     Remote pair Pair status
Gi1/0/5   auto  Pair A     3    +/- 4  m   Pair A      Normal
                Pair B     3    +/- 4  m   Pair B      Normal
                Pair C     32   +/- 4  m   N/A         Open
                Pair D     3    +/- 4  m   Pair D      Normal
```

`Open` on pair C at 32 meters means a break at a specific point along the run. That's the
answer to "gigabit won't come up, but 100 Mbps works": 1000BASE-T needs all four pairs.

## Autonegotiation in detail

Both sides exchange FLP pulses announcing what they support: speeds, duplex, flow-control
support. The best mode both share gets chosen, with priority running from 1000-full down to
10-half.

What happens when negotiation doesn't succeed:

| Side A | Side B | Result |
|---|---|---|
| auto | auto | they agree, usually on 1000-full |
| 100-full | auto | B detects the 100 speed from the signal, assumes **half** duplex → mismatch |
| 100-full | 100-full | fine |
| 100-full | 100-half | mismatch, fixed manually |
| 1000-full | auto | gigabit **requires** autonegotiation — the link may not come up at all |

Hence the practical rule: **either both sides are set to auto, or both are fixed to the same
values**. It's not standard practice to manually fix gigabit and faster interfaces —
negotiation is required as part of the standard.

```cli
SW1# show interfaces gigabitethernet1/0/5 status
Port      Name    Status       Vlan  Duplex  Speed Type
Gi1/0/5   PC-12   connected    10    a-full  a-100 10/100/1000BaseTX
```

The `a-` prefix means "obtained through autonegotiation." Its absence (`full`, `100`) means
the value was set manually; you need to check **both** sides.

## Diagnosing by symptom: five scenarios

**1. "The port flaps, the link keeps going up and down."**
`show interfaces` → `interface resets` climbs and `last input` keeps changing. Causes: a bad
patch cord or connector, a failing SFP, PoE power near the budget limit. Start by replacing
the patch cord and moving the module to a different port.

**2. "Everything works, but a copy runs at 3 MB/s."**
Duplex. Check both sides: `a-full` against `half` — a mismatch. On the half-duplex side,
late collisions climb; on the full-duplex side, CRC and runts climb. Fixed by setting both
sides to the same mode.

**3. "CRC is climbing, duplex matches."**
Physical layer: cable, connector, optics, interference. Clear counters (`clear counters`),
run traffic, watch how fast it climbs. Check TDR and optical levels, replace the patch cord,
check the run for length and proximity to power lines.

**4. "The link won't come up at all" (`down/down`).**
Check: whether the port is `shutdown` on the other side, whether the module types match,
whether TX/RX are wired correctly in the fiber, whether the cable checks out via TDR, and
whether the port has been disabled by a protection mechanism (`err-disabled` is a separate
state — `show interfaces status err-disabled`).

**5. "Giants are climbing."**
Someone is sending frames larger than the MTU: mismatched jumbo frame settings on one side
(for example, the server is set to 9000, the switch to 1500) or untagged frames colliding at
a boundary. Bring the MTU to a consistent value across the whole path.

```cli
SW1# clear counters gigabitethernet1/0/5
SW1# show interfaces gigabitethernet1/0/5 | include duplex|error|collision|resets
```

## What gets asked

- "What are two facts that differentiate optical-fiber cabling from copper cabling?" —
  greater range and immunity to EMI.
- "Which cable is used to connect switch to switch?" — crossover (unless there's a caveat
  about Auto-MDIX among the answer choices).
- "Which interface condition is occurring in this output?" — read it from the counters: late
  collisions → duplex mismatch; climbing CRC → physical layer (cable/SFP/interference);
  giants → an MTU mismatch.
- "What is the effect of a duplex mismatch?" — a sharp drop in performance on a link that's
  technically up.
- "Which state means the port is shut down locally?" — administratively down.
- On SMF/MMF: single-mode is longer range and more expensive, multimode is for inside a
  building/data center.

## Check yourself

```check
?? Late collisions are climbing on a port. What do you check first?
!! Duplex on both sides — this is almost certainly a duplex mismatch.
?? A link between two switches is stuck at 100 Mbps instead of gigabit. What could be wrong with the cable?
!! One of the pairs is broken: gigabit needs all four pairs, while 100BASE-TX only needs two.
?? An interface is in the up / down state. The physical layer is fine. What do you check?
!! The logical layer: encapsulation, keepalives, trunk negotiation — whatever is preventing the protocol from agreeing while the physical layer is up.
?? Two buildings are 400 meters apart, with a power line running nearby. Which medium?
!! Fiber — copper won't reach 100+ meters and would pick up interference; multimode is enough at that distance.
?? Why are there no collisions in full duplex?
!! Transmit and receive run on separate pairs at the same time — the medium isn't shared, so CSMA/CD isn't needed and is turned off.
?? A new fiber run: the link won't come up, and the modules match. First hypothesis?
!! TX and RX are swapped — unlike Auto-MDIX on copper, this doesn't fix itself on fiber.
?? What does a-full mean in show interfaces status output?
!! Full duplex obtained via autonegotiation; without the "a-" prefix the value was set manually.
?? Rx Power reads −21 dBm, the link is up, and CRC errors are occurring. What do you do?
!! The power level is on the edge: clean the connectors, check for tight bends and unnecessary splices in the run, and replace the patch cord.
?? TDR shows Open on pair C at 32 meters. What does this explain?
!! A break in one pair: 100 Mbps works on two pairs, while gigabit needs all four and won't come up.
?? One side is manually set to 100-full, the other is in auto. What's the result?
!! The auto side detects the speed correctly but assumes half duplex — a classic duplex mismatch.
```
