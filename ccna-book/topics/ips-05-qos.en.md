---
title: "QoS: Classification, Marking, Queuing"
lead: Per-hop behavior, DSCP and CoS, EF and AF, policing vs. shaping, and what voice traffic requires from the network.
---

## Why QoS

Bandwidth isn't unlimited, and traffic isn't uniform: a backup copy job and a phone call
compete for the same queue. QoS doesn't create bandwidth — it **decides who gets served
first when there isn't enough to go around**.

Requirements worth memorizing (voice, one-way):

| Parameter | Voice | Video |
|---|---|---|
| Latency | ≤ 150 ms | ≤ 200–400 ms |
| Jitter | ≤ 30 ms | ≤ 30–50 ms |
| Loss | ≤ 1% | ≤ 0.1–1% |
| Bandwidth per call | 21–110 kbps depending on codec | depends on resolution |

## Service models

- **Best effort** — no QoS, everyone is equal. The default.
- **IntServ** — reserves resources per flow (RSVP), scales poorly.
- **DiffServ** — traffic is divided into classes, and each node applies its own
  behavior to a given class. This is exactly what **per-hop behavior** means, and
  DiffServ is what's actually used in practice.

> [!key] Remember
> **PHB means behavior at each node.** QoS isn't an end-to-end mechanism: every device
> along the path independently decides what to do with a marked packet. If even one node
> along the way ignores the marking, there's no guarantee.

## Classification and marking

**Classification** determines which class a packet belongs to (by ACL, by port, by
protocol via NBAR). **Marking** writes that decision into the header so downstream nodes
don't have to re-analyze the packet.

| Field | Where | Width | Values |
|---|---|---|---|
| **CoS** | 802.1Q tag, L2 trunk only | 3 bits | 0–7 |
| **DSCP** | ToS byte in the IP header | 6 bits | 0–63 |
| IP Precedence | the old 3 bits of the same byte | 3 bits | 0–7 |

Key DSCP values:

| Name | DSCP | For |
|---|---:|---|
| **EF** (Expedited Forwarding) | 46 | voice |
| AF41 | 34 | video conferencing |
| **CS3** | 24 | call signaling |
| AF21 | 18 | transactional data |
| CS0 / default | 0 | everything else |

In AFxy names, the first digit is the class (higher means higher priority), and the
second is the drop probability under congestion (higher means more likely to be
dropped).

CoS only lives inside the VLAN tag, so **it doesn't exist on an untagged access port** —
once traffic leaves L2, marking has to live in DSCP.

## Trust boundary

The **trust boundary** is where the network starts believing someone else's marking.
Rule of thumb: trust as close to the source as possible, but only sources you can trust.

- A Cisco IP phone is a trusted device: `mls qos trust cos` on the port.
- A regular PC's port isn't trusted: a user could mark torrent traffic as EF and get
  priority for it. Marking from such a port is either reset to zero or rewritten
  according to policy.

## Queue management

- **Congestion management** — what to do when a queue fills up: multiple queues and the
  order in which they're serviced.
  - **CBWFQ** — guarantees each class a share of bandwidth.
  - **LLQ** — a priority queue layered on top of CBWFQ; **mandatory for voice**, because
    it's the only mechanism that gives predictably low latency.
- **Congestion avoidance** — keeping a queue from filling up in the first place:
  **WRED** proactively drops some packets from less important classes so TCP sessions
  back off on their own. Without it you get **tail drop** — once the queue is full,
  everything gets dropped indiscriminately, voice included.

## Policing and shaping

| | Policing | Shaping |
|---|---|---|
| What it does with excess | **drops** it (or remarks it) | **buffers** it and releases it later |
| Effect on latency | none | increases it |
| Where it's applied | inbound, at the provider | outbound, toward the provider's link |
| Traffic shape | jagged, bursts get clipped | smoothed out |

Mnemonic: **police = an on-the-spot penalty (drop), shape = a queue with a scheduled
release.** For TCP, shaping is generally gentler: instead of loss and retransmissions,
you get a small added delay.

## What this looks like in configuration

```cfg
class-map match-all VOICE
 match ip dscp ef
class-map match-all SIGNALING
 match ip dscp cs3
!
policy-map WAN-OUT
 class VOICE
  priority percent 10               ! LLQ — strict priority
 class SIGNALING
  bandwidth percent 5
 class class-default
  fair-queue
  random-detect                     ! WRED
!
interface GigabitEthernet0/0
 service-policy output WAN-OUT
```

## Diagnosis: EF marking is set, but voice still breaks up at one segment

**Symptom.** The phone marks voice as DSCP EF, priority is honored on most switches, but
right behind one specific switch in the middle of the path, call quality is noticeably
worse than on every other segment.

**What to check.** The trust boundary on that specific device:

```cli
SW-CORE# show mls qos interface gi1/0/1 | include Trust
  Trust state: not trusted
```

**What was found.** This particular port **doesn't trust** incoming marking — the
switch receives a frame with DSCP 46 from the previous node, but resets (or remarks) it
before forwarding it onward, because the port is configured as untrusted. From that
point on, voice travels with ordinary priority, same as everything else, even though the
phone and every prior node correctly set the priority. PHB (per-hop behavior) literally
means this: **each node decides independently**, and a single untrusted port anywhere
along the path is enough to undo prioritization for every node after it — marking set at
the start doesn't guarantee it's honored at the end.

> [!key] Remember
> QoS is not an end-to-end mechanism with an edge-to-edge guarantee. One misconfigured
> node in the middle can zero out the effect of the entire chain — that's exactly why
> trust boundaries need to be configured on **every** device along the path, not just
> the first one.

## Worked problem: calculating bandwidth for voice traffic

An office of 50 employees, G.711 codec (~80 kbps per call including overhead), with up
to 20% of employees on calls at once.

```txt
   Maximum simultaneous calls: 50 × 0.20 = 10
   Bandwidth for voice: 10 × 80 kbps = 800 kbps
```

This is exactly the number you plug into `priority percent` or `priority <kbps>` for the
LLQ queue on the WAN interface — not "the whole link," not "whatever's left over," but a
calculated figure sized to the actual concurrent load with some margin. On a 10 Mbps
link, 800 kbps is 8% of bandwidth, and that (or slightly more, as margin) is the
sensible share to hand to the priority queue:

```cfg
policy-map WAN-OUT
 class VOICE
  priority percent 10
```

> [!trap] Trap
> "Give voice as much bandwidth as possible" is a tempting but wrong instinct. LLQ
> traffic is served **strictly ahead of the queue**, and if it's given an excessive
> share (say, 50% of the link "just in case"), at peak voice load everything else can
> start starving — this plays out in the next scenario.

## Diagnosis: voice is flawless, everything else crawls

**Symptom.** After configuring LLQ, voice call quality became excellent, but regular
data traffic (web, files, mail) got noticeably slower than before QoS was implemented.

**What to check.** The share of the link allocated to the priority queue, relative to
the actual voice load:

```cli
R1# show policy-map interface gi0/0 | include Class|priority
  Class-map: VOICE
    priority 50% (5000 kbps), burst bytes ...
```

**What was found.** The priority queue has been given 50% of the link, while the actual
voice load (by a calculation like the one above) needs far less. LLQ is served **strictly
first**, ahead of the queue, and the remaining classes get only what's left over: if the
priority queue is given an excessive share, class-default (regular traffic) is served
out of the remaining 50%, even at moments when the voice queue isn't actually using its
full allocation. The correct configuration is to give LLQ exactly the calculated voice
requirement plus a small margin (as in the example above — around 10%, not 50%), not
"as much as possible, just to be safe."

## Diagnosis: TCP sessions periodically drop in sync, all at once

**Symptom.** On a congested WAN link, for no obvious reason, many TCP sessions
periodically "sag" all at the same time, rather than one at a time gradually.

**What to check.** Whether congestion avoidance is configured on the output queue, or
whether traffic is only handled once the queue actually fills up:

```cli
R1# show policy-map interface gi0/0
  Class-map: class-default (match-any)
    0 packets
    Total drops: 128340
    (no random-detect configured)
```

**What was found.** `random-detect` (WRED) isn't configured — the queue operates on
**tail drop**: everything gets accepted as long as there's room, and the moment it
fills up, everything gets dropped indiscriminately, regardless of which session each
packet belonged to. If segments from many TCP flows happen to be in the queue at that
moment, all of them detect loss at the same time and all of them shrink their congestion
window at the same time — this is **global synchronization**: instead of smoothly
absorbing load, the link synchronously "sags" and then synchronously ramps back up,
and the cycle repeats. WRED fixes this by starting to drop some packets **early**,
before the queue is actually full, and probabilistically — so different sessions react
at different times instead of all at once.

## What gets asked

- "Which DSCP value is used for voice?" — EF, 46.
- "What is the difference between policing and shaping?" — dropping vs. buffering.
- "What is a trust boundary?" — the point where someone else's marking starts being
  accepted.
- "Which queuing method should be used for voice?" — LLQ (priority queue).
- "What are the latency/jitter/loss requirements for voice?" — 150 ms / 30 ms / 1%.
- "Where does CoS marking exist?" — in the 802.1Q tag, meaning on a trunk only.
- "What does per-hop behavior mean?" — every device along the path applies its policy
  independently.
- "Voice traffic is correctly marked EF at the source but loses priority partway through
  the network. What should be checked?" — the trust boundary on the intermediate
  devices — a single untrusted port is enough to zero out marking for every node beyond
  it.
- "After enabling LLQ, voice quality is excellent but data traffic slows down noticeably.
  What is the likely misconfiguration?" — the priority queue has been given a much
  larger share of the link than the actual voice load requires — the rest of the traffic
  gets less than it had before QoS was introduced.
- "TCP sessions across a congested link drop in bandwidth simultaneously in cycles. What
  QoS mechanism prevents this, and what is the underlying cause?" — WRED vs. tail drop:
  without early probabilistic dropping, many sessions lose packets and shrink their
  window at the same time — global synchronization.

## Check yourself

```check
?? What DSCP value is used for voice traffic, and what is it called?
!! 46, Expedited Forwarding (EF).
?? A link is congested and traffic exceeds the contracted rate. How does policing differ from shaping here?
!! Policing drops the excess immediately; shaping buffers it and releases it later, adding delay.
?? Why doesn't CoS survive to the far end of the network through a router?
!! CoS lives in the 802.1Q tag; beyond Layer 2, only DSCP in the IP header remains.
?? Where should the trust boundary be placed for an IP phone versus a PC?
!! Trust the phone (trust cos); don't accept marking from a regular PC's port.
?? What are the latency and jitter requirements for voice?
!! No more than 150 ms of one-way latency and 30 ms of jitter, with up to 1% loss.
?? The phone marks voice as EF, but behind one specific switch in the middle of the path, call quality is worse. What should be checked on it?
!! The port's trust state — if it's untrusted, the switch resets or remarks incoming marking, and voice travels with ordinary priority from there on.
?? 50 employees, ~80 kbps per call, up to 20% on calls at once. How much bandwidth should the priority queue get?
!! About 800 kbps (50 × 0.2 × 80 kbps) plus a small margin — not "the whole link" and not an arbitrary large share.
?? After enabling LLQ, voice is flawless, but regular traffic slowed down more than before QoS. What's the likely mistake?
!! The priority queue was given a share of the link far larger than the calculated voice load — class-default is now served from a smaller remainder than before QoS was configured at all.
?? WRED isn't configured, and the queue runs on tail drop. What characteristic symptom does this produce across many TCP sessions at once?
!! Synchronized drops in throughput across many sessions at once (global synchronization) — when the queue fills up, everything is dropped indiscriminately, and every affected session shrinks its window at the same time.
```
