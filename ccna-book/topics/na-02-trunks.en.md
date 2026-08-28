---
title: 802.1Q Trunks and the Native VLAN
lead: How multiple VLANs share one cable, what the tag actually does, why a mismatched native VLAN is dangerous, and why you should turn DTP off.
---

## Why Trunks Exist

An access port carries **one** VLAN. If ten VLANs need to travel between two switches,
running ten separate cables is wasteful — instead, one port is declared a **trunk**, and
it carries frames for every allowed VLAN.

For the receiving side to know which VLAN a frame belongs to, the sender adds an
**802.1Q tag** — 4 bytes inserted into the Ethernet header:

```txt
 untagged frame: | DA | SA |     Type | Payload | FCS |
 with .1Q tag:   | DA | SA | TPID VID | Type | Payload | FCS |
                           └ 4 bytes: 0x8100 + priority + VLAN ID
```

The tag holds the **VLAN ID** (12 bits, hence the 4094 limit) and a priority field,
**PCP/CoS** (3 bits), used by Layer 2 QoS. Because of the 4-byte insertion, a frame can
grow to 1522 bytes — switches allow for this (baby giant).

The tag exists **only inside the trunk**: before a switch forwards a frame out an access
port, it strips the tag. The end device usually has no idea VLANs exist at all.

## Native VLAN

In 802.1Q, one VLAN on the trunk travels **untagged** — this is the **native VLAN**,
VLAN 1 by default. Anything that arrives on the trunk without a tag is treated by the
switch as belonging to the native VLAN.

```cfg
interface GigabitEthernet0/1
 switchport trunk encapsulation dot1q   ! on switches that support both ISL and dot1q
 switchport mode trunk
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,99
 switchport nonegotiate
```

Rules exams like to test:

- **The native VLAN must match on both ends.** If it doesn't, traffic from one VLAN
  "leaks" into another, and CDP loudly complains in the log:
  `%CDP-4-NATIVE_VLAN_MISMATCH`.
- Good practice is to make the native VLAN a dedicated, unused one (e.g. 999) rather than
  leaving it at VLAN 1: this closes off the **VLAN hopping** attack via double tagging.
- You can also require a tag for everything: `vlan dot1q tag native`.

> [!trap] Trap
> A native VLAN mismatch **does not bring the trunk down** — it stays up, and the symptom
> looks like "some traffic ends up in the wrong place" or "broadcast from another VLAN
> shows up in two VLANs at once." Watch for this in questions where the link is up but
> connectivity is odd.

## The Allowed VLAN List

By default, a trunk carries **every** VLAN (1–4094). You restrict it explicitly:

```cfg
switchport trunk allowed vlan 10,20,99      ! exactly these
switchport trunk allowed vlan add 30        ! add to the list
switchport trunk allowed vlan remove 20     ! remove
switchport trunk allowed vlan all           ! restore all
```

A classic mistake is typing `allowed vlan 30` instead of `add 30`: the whole list gets
replaced, and everything else drops instantly. On troubleshooting questions, this shows
up as "after adding a new VLAN, the old ones stopped working."

A VLAN needs to be allowed **on every trunk along the path**, or connectivity between its
hosts on different switches will never come together.

## DTP: How Ports Negotiate

**DTP** (Dynamic Trunking Protocol) is a Cisco-proprietary protocol ports use to
negotiate their mode.

| Mode | What it does | Becomes a trunk with |
|---|---|---|
| `access` | always access | nothing |
| `trunk` | always trunk, sends DTP | trunk, desirable, auto |
| `dynamic desirable` | actively offers a trunk | trunk, desirable, auto |
| `dynamic auto` | waits for an offer | trunk, desirable |

Two ports both set to `dynamic auto` **will not** form a trunk — both are waiting for the
other to initiate. This is the most common calculation question built around this table.

Security practice: explicitly set the mode and add `switchport nonegotiate` so the port
doesn't send DTP frames at all. DTP on a user-facing port opens the door to switch
spoofing: an attacker pretends to be a switch and gets access to every VLAN.

## Verification

```cli
SW1# show interfaces trunk
Port        Mode         Encapsulation  Status        Native vlan
Gi0/1       on           802.1q         trunking      999

Port        Vlans allowed on trunk
Gi0/1       10,20,99

Port        Vlans allowed and active in management domain
Gi0/1       10,20,99

Port        Vlans in spanning tree forwarding state and not pruned
Gi0/1       10,20,99
```

Read the four blocks top to bottom as a funnel: what's allowed → what actually exists and
is active → what's really being forwarded (not blocked by STP). If a VLAN shows up in the
first block but not the last, its port is being blocked by spanning tree — that's not a
trunk problem.

## The Link to Routing

A trunk to a router is the foundation of **router-on-a-stick**: a physical interface is
split into subinterfaces, one per VLAN. That's covered in its own chapter, but remember:
on the switch side this is just a regular trunk, while on the router each subinterface
gets `encapsulation dot1q <vlan>`, with the keyword `native` added for the native VLAN's
subinterface.

## Trunking to a Third-Party Switch

If the far end of the link isn't Cisco but a switch from another vendor, there's no one to
negotiate a mode with via DTP — DTP is proprietary. The fix is to **configure the trunk
manually and statically on both sides**: `switchport mode trunk` (or the equivalent in the
other vendor's CLI) with no reliance on auto-negotiation, and explicitly matching
`dot1Q` encapsulation (the same principle as mode `on` in the EtherChannel chapter —
static configuration replaces negotiation wherever there's no DTP-like protocol on the
other side).

## VXLAN: The Same Idea, But Over Layer 3

802.1Q solves "many VLANs on one cable" within a single Layer 2 segment. When segments
need to stretch between different buildings or data centers across a routed network,
tagging on top of Layer 2 doesn't work — that's where **VXLAN** comes in: an entire Layer
2 frame is wrapped inside a UDP packet and carried across an ordinary IP network, much
like GRE, but with a 24-bit identifier (VNI) instead of a 12-bit VLAN ID, so it supports
orders of magnitude more segments than the 4094 limit. This is exactly the protocol that
forms the **data plane of an SD-Access fabric** between edge nodes at different
sites — covered in more depth in the SDN chapter, but the connection is worth seeing here:
VXLAN is to a routed Layer 3 network roughly what 802.1Q is to a single switched segment.

## Walkthrough: Double Tagging Attack Step by Step

Setup: the trunk's native VLAN is VLAN 1, and the attacker's port has, by mistake, also
ended up in that same VLAN.

```txt
The attacker sends a frame with TWO tags:
   outer tag: VLAN 1 (native)
   inner tag: VLAN 20 (the target)
```

1. The frame arrives at the first switch on an access port in VLAN 1. The switch sees the
   outer tag matching the trunk's native VLAN, and by the rule "the native VLAN is sent
   out untagged," it **strips exactly that outer tag** without looking any deeper.
2. The frame, now carrying only its remaining inner tag (VLAN 20), continues along the
   trunk to the next switch.
3. The second switch receives a frame whose only visible tag is now VLAN 20, and forwards
   it as an ordinary frame of that VLAN — the attacker's traffic has landed in a VLAN it
   never should have reached, bypassing inter-VLAN routing entirely.

**Why this only works one way**, and only with the native VLAN: if the attacker weren't
in the native VLAN, the first switch would strip the tag matching the attacker's own
VLAN, not the forged outer one — the trick wouldn't work. That's the practical defense
already covered above: **the native VLAN should be a dedicated, unused VLAN**, not
assigned to any access port — then there'd be no "extra" outer tag to strip in the first
place.

> [!key] Remember
> Double tagging only works **in one direction** (a reply along the same path won't get
> through), and only if the attacker is physically sitting in the trunk's native VLAN.
> Both details are typical refinements in VLAN hopping questions.

## Troubleshooting: Traffic From One VLAN Shows Up in Another

**Symptom.** Broadcast traffic that logically has nothing to do with VLAN 20 suddenly
starts appearing there — it looks like a leak from a neighboring VLAN.

**What to check.** Whether the native VLAN matches on both ends of the trunk:

```cli
SW1# show interfaces gi0/1 trunk
Port        Mode         Encapsulation  Status        Native vlan
Gi0/1       on           802.1q         trunking      999

SW2# show interfaces gi0/1 trunk
Port        Mode         Encapsulation  Status        Native vlan
Gi0/1       on           802.1q         trunking      1

%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/1 (999), with SW2 GigabitEthernet0/1 (1).
```

**What we found.** SW1's native VLAN is 999, while SW2 was left at the default, 1. The
trunk **stays up** the whole time — a native VLAN mismatch doesn't formally block the
link, but a frame leaving SW1 untagged (because for SW1 that's native VLAN 999) arrives
at SW2 also untagged — and SW2 assigns it to **its own** native VLAN, VLAN 1. Traffic
that was VLAN 999 as far as SW1 is concerned quietly ends up in VLAN 1 on SW2. Fixed by
setting the native VLAN to the same value on both ends — CDP will loudly flag the
mismatch in the log on its own, as long as CDP isn't disabled.

## Troubleshooting: Trunk Won't Come Up Between Two New Switches

**Symptom.** Two brand-new switches are connected by a cable; one side is configured with
`switchport mode trunk`, the other is left at factory defaults, and there's no
connectivity across VLANs at all.

**What to check.** The DTP mode on both sides:

```cli
SW1# show interfaces gi0/1 switchport | include Administrative Mode
Administrative Mode: trunk

SW2# show interfaces gi0/1 switchport | include Administrative Mode
Administrative Mode: dynamic auto
```

**What we found.** On paper this should work fine: `trunk` on one side actively
negotiates the mode, and `dynamic auto` agrees. If the trunk still won't come up, the
next thing to check is **encapsulation**: on older switch models that support both ISL
and dot1q, both sides must explicitly agree on the encapsulation type
(`switchport trunk encapsulation dot1q`) — DTP itself doesn't choose the encapsulation.
A second common culprit is a physical mismatch (speed/duplex) or mismatched allowed-VLAN
lists, which lets the link come up while the VLANs that matter still don't pass — at
first glance indistinguishable from "the trunk isn't working."

## Walkthrough: Consequences of a Wrong `allowed vlan` Command

The current configuration:

```cfg
switchport trunk allowed vlan 10,20,99
```

The administrator wants to add VLAN 30 and runs:

```cfg
switchport trunk allowed vlan 30
```

**What happens.** The command without the `add` keyword doesn't add — it **replaces the
entire list**. It was `10,20,99`, and now it's exactly `30` — VLANs 10, 20, and 99 stop
passing over this trunk in the same instant, even though those VLANs still exist on the
switches and their access ports are still up. The symptom on the far end is "connectivity
just dropped for three VLANs at once, and nobody touched anything" — and the answer only
shows up by reading the command, not by examining the topology. The correct form:

```cfg
switchport trunk allowed vlan add 30
```

## What Gets Asked

- "Which two commands configure a trunk?" — `switchport mode trunk` (plus
  `encapsulation dot1q` on platforms where there's a choice).
- "What happens when native VLANs do not match?" — traffic from one side's native VLAN
  lands in the other side's VLAN; CDP reports an error, and the link stays up.
- "Two ports are set to dynamic auto. What is the result?" — both stay access ports.
- "Which VLANs traverse the trunk?" — read the last block of
  `show interfaces trunk`.
- "Why configure a dedicated native VLAN?" — protection against a double-tagging VLAN
  hopping attack.
- "An engineer added VLAN 30 with switchport trunk allowed vlan 30. What happened?" —
  the list got replaced, and the other VLANs stopped passing.
- "Under what condition can a double-tagging VLAN hopping attack succeed?" — the attacker
  is physically in the trunk's native VLAN; the attack only works in one direction, and a
  reply won't come back the same way.
- "Native VLAN mismatch is reported by CDP, but the trunk stays up. What is the actual
  effect on traffic?" — frames from one side's native VLAN land in the other side's
  native VLAN — traffic from two different VLANs quietly mixes together.
- "Two switches negotiate DTP successfully, but VLAN traffic still does not pass. What
  else should be checked?" — matching encapsulation (dot1q/ISL) on platforms where it
  isn't chosen automatically, and the allowed-VLAN lists on both ends.

## Check Yourself

```check
?? How many bytes does an 802.1Q tag add, and what's inside it?
!! Four bytes: TPID, CoS priority, and the VLAN ID (12 bits).
?? A frame arrives on a trunk with no tag. Which VLAN does the switch put it in?
!! The trunk's native VLAN.
?? Port A is dynamic desirable, port B is dynamic auto. Will a trunk form?
!! Yes: desirable actively offers, auto agrees.
?? How do you find out which VLANs are actually passing over a trunk right now?
!! show interfaces trunk, last block — "in spanning tree forwarding state and not pruned."
?? Why is it risky to let the native VLAN match a user VLAN?
!! Double tagging: a frame with two tags loses its outer tag at the first switch and ends up in a VLAN it shouldn't reach.
?? Why does double tagging only work when the attacker sits exactly in the trunk's native VLAN?
!! Only the native VLAN leaves the trunk untagged; the first switch strips the attacker's outer tag simply because it looks like the native VLAN marker, not because it inspected the contents — for any other VLAN the tag would stay in place and the trick would fail.
?? CDP reports NATIVE_VLAN_MISMATCH, but the trunk stays up. Is the trunk working normally?
!! No: the link is physically alive, but frames from one side's native VLAN land in the other side's native VLAN — traffic from two different VLANs mixes together with no obvious link failure.
?? A trunk between two switches is configured (one side trunk, the other dynamic auto), but VLANs still don't pass. DTP isn't the issue here — what do you check next?
!! Matching dot1q/ISL encapsulation on platforms where it isn't negotiated automatically, and the allowed-vlan lists on both ends of the trunk.
```
