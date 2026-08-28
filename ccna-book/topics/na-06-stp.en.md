---
title: Spanning Tree and Rapid PVST+
lead: How the root, ports, and their roles get elected, why Rapid PVST+ converges faster than classic STP, and why PortFast, BPDU guard, and root guard matter.
---

## The problem STP solves

Redundant links between switches are mandatory — and they also create a Layer 2 loop.
A Layer 2 loop is catastrophic: frames have no TTL, a broadcast storm eats the CPU within
seconds, and the MAC table "flaps" between ports.

**STP builds a loop-free logical tree out of the physical mesh** by putting redundant
ports into blocking and bringing them back when the primary path fails.

## Who becomes the root

The election runs on **Bridge ID** = priority (2 bytes) + switch MAC address. Lower value
wins.

- The default priority is **32768**, configurable in increments of 4096.
- In Rapid PVST+, the VLAN number is added to the priority (**extended system ID**), which
  is why you see 32778 for VLAN 10 in the output.
- On a priority tie, the **lower MAC** wins. Hence the classic outcome: with no manual
  configuration, the oldest switch on the network becomes the root — usually the weakest
  one.

```cfg
Switch(config)# spanning-tree vlan 10 root primary      ! priority 24576
Switch(config)# spanning-tree vlan 10 root secondary    ! priority 28672
Switch(config)# spanning-tree vlan 10 priority 4096     ! manual
```

> [!key] Remember
> The root should sit where traffic converges — at distribution/core, not "wherever it
> happened to land." Setting this explicitly is a mandatory part of any correct design.

## Port roles

| Role | What it is | State |
|---|---|---|
| **Root port** | best path **to the root**, one per non-root switch | forwarding |
| **Designated port** | best port on a segment; on the root, **all** ports are designated | forwarding |
| **Non-designated / alternate** | the losing port | blocking (discarding in RSTP) |
| **Backup** (RSTP only) | backup to the same segment | discarding |

The election runs through a chain of criteria, and it's asked about in "which port will
block" questions:

1. Lowest **root path cost**.
2. Lowest **Bridge ID of the neighbor** (whoever is closer to the root).
3. Lowest neighbor **port priority**.
4. Lowest neighbor **port number**.

Cost by speed (IEEE standard, current values):

| Speed | Cost |
|---|---:|
| 10 Mbps | 100 |
| 100 Mbps | 19 |
| 1 Gbps | 4 |
| 10 Gbps | 2 |

Path cost is summed across the links to the root. Two 100 Mbps hops (19+19=38) are worse
than a single gigabit hop (4).

## States and timers

Classic 802.1D:

| State | What it does | Duration |
|---|---|---|
| Blocking | listens for BPDUs, doesn't forward | 20 s (max age) on failure |
| Listening | takes part in the election, doesn't learn MACs | 15 s (forward delay) |
| Learning | learns MACs, doesn't forward | 15 s |
| Forwarding | works normally | — |

That's up to 30–50 seconds for a transition — an eternity for a user. **Rapid PVST+
(802.1w)** cuts this to seconds by using:

- only three states: **discarding, learning, forwarding**;
- the **proposal/agreement** mechanism — neighbors negotiate directly instead of waiting
  on timers;
- **edge ports** (this is exactly what PortFast is) — they go straight to forwarding;
- every switch sends its own BPDUs, not just the root; missing three in a row (6 seconds)
  counts as a link failure.

Cisco defaults to **PVST+** — a separate tree per VLAN, which lets you load-balance: VLAN
10 rooted on SW1, VLAN 20 on SW2, so both links stay active.

```cfg
Switch(config)# spanning-tree mode rapid-pvst
```

## Protection mechanisms

| Mechanism | Where it's enabled | What it does |
|---|---|---|
| **PortFast** | ports to end devices | goes straight to forwarding, skipping the 30-second wait |
| **BPDU guard** | same ports | receives a BPDU → port goes `err-disabled` |
| **BPDU filter** | same ports (use with care) | doesn't send or process BPDUs |
| **Root guard** | downstream ports, toward neighbors | neighbor claims to be a better root → port goes `root-inconsistent` |
| **Loop guard** | root/alternate ports | BPDUs stop arriving → port doesn't open, goes `loop-inconsistent` instead |

```cfg
interface range gigabitethernet0/1 - 20
 spanning-tree portfast
 spanning-tree bpduguard enable
!
! or globally for all access ports
spanning-tree portfast default
spanning-tree portfast bpduguard default
```

The point of pairing PortFast with BPDU guard: a port to a user comes up instantly, but if
a switch (or a loop) gets plugged into it, the port shuts down immediately instead of
disrupting the tree.

Recovery after `err-disabled` is manual (`shutdown` / `no shutdown`) or automatic:

```cfg
errdisable recovery cause bpduguard
errdisable recovery interval 300
```

## Reading the output

```cli
SW2# show spanning-tree vlan 10

VLAN0010
  Spanning tree enabled protocol rstp
  Root ID    Priority    24586
             Address     aabb.cc00.0100
             Cost        4
             Port        1 (GigabitEthernet0/1)

  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)
             Address     aabb.cc00.0200

Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- --------
Gi0/1            Root FWD 4         128.1    P2p
Gi0/2            Altn BLK 4         128.2    P2p
Gi0/5            Desg FWD 19        128.5    P2p Edge
```

How to read this: the **Root ID** block describes the root (if its address matches the
Bridge ID, this switch *is* the root); **Cost 4** is the cost to the root; `Root FWD` is
the port toward the root; `Altn BLK` is the blocked backup; `Edge` marks PortFast.

## Topology changes

When a link drops, a switch sends a **TCN**, the tree recomputes, and MAC table entries
age out faster (15 seconds instead of 300) — otherwise frames would keep heading to a port
behind which the device no longer exists. A port that keeps flapping triggers a flood of
TCNs — one more reason to put PortFast on user-facing ports (an edge port doesn't generate
a TCN).

## Worked problem: full election across three switches

```txt
        SW1 (MAC ...0100)
       Gi0/1 │      │ Gi0/2
      1 Gbps │      │ 100 Mbps
        Gi0/1│      │Gi0/1
        SW2 ─┴─Gi0/2┴─ SW3
    (MAC ...0200) 100 Mbps (MAC ...0300)
```

All three switches are at the default priority (32768 + VLAN), STP is computed for a
single VLAN, and every link is P2P.

**Step 1 — root election.** Priorities are equal, so we compare MAC addresses:
`...0100` is the lowest → **SW1 is the root**. All of its ports become **designated** and
move to forwarding; it no longer takes part in any election.

**Step 2 — root port on SW2 and SW3.** Each non-root switch has exactly one root port —
the port with the lowest total cost to the root.

- SW2 sees SW1 directly over gigabit: cost 4. Through SW3 the path is longer: SW2→SW3
  (100 Mbps, 19) + SW3→SW1 (100 Mbps, 19) = 38. The direct link is cheaper: **Gi0/1 on
  SW2 is the root port**, cost 4.
- SW3 sees SW1 directly over 100 Mbps: cost 19. Through SW2 the path is: SW3→SW2
  (100 Mbps, 19) + SW2→SW1 (1 Gbps, 4) = 23. The direct link is cheaper: **Gi0/1 on SW3
  is the root port**, cost 19.

**Step 3 — designated port on the SW2↔SW3 segment.** Neither end of this link is a root
port for its switch (those are already taken by the links to SW1), so this segment needs
one designated port, and the other end goes to blocking. The criterion is each switch's
total cost **to the root**: SW2's is 4, SW3's is 19. SW2 is lower → its `Gi0/2` port
becomes **designated**, and SW3's `Gi0/2` on the same segment becomes
**non-designated/blocking**.

Final topology: SW1 is the root (all ports designated), SW2 is fully forwarding (Gi0/1
root, Gi0/2 designated), SW3 has Gi0/1 forwarding (root) and Gi0/2 blocking. Under normal
conditions, a frame from SW3 to SW2 does **not** take the direct link — it goes through
SW1. The direct link looks shorter, but the tree is built on cost to the root, not on the
shortest path between two particular switches.

> [!trap] Trap
> "There's a direct link between SW2 and SW3, so traffic between them will use it" — not
> necessarily. Spanning tree builds a tree **relative to the root**, not shortest paths
> between an arbitrary pair of switches; a direct link can end up blocking if both ends
> reach the root more cheaply through a third path.

## Diagnostics: broadcast storm after a new patch cable

**Symptom.** Right after someone runs an extra patch cable "just in case" between two
access switches in a rack, the network goes down: port LEDs blink nonstop, switch CPUs
spike, and users lose connectivity en masse.

**What we check.** Whether STP is actually running on the affected switches:

```cli
SW1# show spanning-tree summary
Switch is in rapid-pvst mode
Root bridge for: none
EtherChannel misconfig guard is enabled
Spanning tree default pathcost method used is short

  Name                   Blocking Listening Learning Forwarding STP Active
---------------------- -------- --------- -------- ---------- ----------
VLAN0010                      0         0        0          2          2
```

**What we found.** If STP were operating normally, the new link would have created a
loop, and one of its ends **should have** gone to `Blocking` — but the summary shows
`Blocking: 0`. That means either STP is disabled globally or on this specific VLAN, or the
link is plugged into a port where BPDUs aren't processed (for example,
`spanning-tree bpdufilter enable`, which quietly disables the protection instead of
shutting the port down). Without STP, a broadcast frame caught in the loop is copied at
both ends endlessly and doubles on every pass — that's the storm that eats all the
bandwidth and CPU within seconds. The lasting fix isn't just "enable STP and don't touch
it" — it also means `spanning-tree portfast bpduguard default` on access ports, so a
switch accidentally plugged into one of them immediately goes `err-disabled` instead of
joining the tree uncontrolled.

## Diagnostics: root guard keeps blocking the port to a neighboring office

**Symptom.** The port connecting the network to a neighboring department's equipment
(owned by another team) is consistently in a state other than `forwarding`, even though
the cable and the switch on the other side are fine.

**What we check.** The specific port state, not just "it's not working":

```cli
SW1# show spanning-tree inconsistentports

Name                 Interface           Inconsistency
-------------------- ------------------- ------------------
VLAN0010             GigabitEthernet0/8  Root Inconsistent
```

**What we found.** `Root Inconsistent` isn't a failure — it's a **protection mechanism
doing its job**: `root guard` is enabled on the port, and a BPDU arrived from the other
side claiming a better Bridge ID than the current root's. Root guard won't let that BPDU
change the topology — the port stays blocked as long as the superior BPDUs keep arriving,
and it recovers automatically once the neighboring side stops sending them. Often the
cause is innocent: the neighboring department's switch happens to have a lower priority or
older MAC address and comes out "accidentally better" by Bridge ID — and root guard exists
precisely so a foreign switch like that can't hijack the root role for the whole network.
The fix is not to remove root guard, but to raise the priority on your own root, or
intentionally lower it on the neighboring switch if that's within your control.

## What gets asked

- "Which switch becomes the root bridge?" — the lowest priority, and on a tie, the lowest
  MAC.
- "Which port will be blocked?" — walk the chain: path cost, neighbor's Bridge ID,
  priority, port number.
- "What is the cost of a 1 Gbps link?" — 4.
- "What does PortFast do and where is it safe?" — instant transition to forwarding on
  ports facing end devices.
- "A port went err-disabled after a switch was connected. Why?" — BPDU guard triggered.
- "Which feature prevents an inferior switch from becoming root?" — root guard.
- "How many root ports does a non-root switch have?" — exactly one per VLAN.
- "Two switches are connected by a direct link, but both switches reach the root faster
  through a third switch. What happens to the direct link?" — one end of it goes to
  blocking: the tree is built on cost to the root, not the shortest path between a pair of
  switches.
- "A new link between two switches causes a broadcast storm instead of one port going into
  blocking. What should be checked?" — whether spanning tree is even running on that VLAN,
  and whether the affected ports have `bpdufilter`, which disables BPDU processing.
- "A port is stuck in the `Root Inconsistent` state. What is happening?" — root guard has
  triggered: a neighbor is sending BPDUs claiming a better Bridge ID for the root role, and
  the port deliberately stays blocked while that continues.

## Check yourself

```check
?? Two switches share the same priority, 32768. Which one becomes the root?
!! The one with the lower MAC address in its Bridge ID.
?? Why does the output show priority 32778 instead of 32768?
!! The VLAN number has been added to the priority (extended system ID): 32768 + 10.
?? How many root ports does a non-root switch have, and how many does the root have?
!! The non-root switch has one; the root has none at all — all of its ports are designated.
?? A port goes err-disabled right after a new device is plugged in. What happened?
!! The device sent a BPDU, and BPDU guard is enabled on the port.
?? How does root guard differ from BPDU guard?
!! BPDU guard shuts a port down on any BPDU; root guard blocks a port only if the neighbor is claiming the root role.
?? How long does a port take to reach forwarding in classic STP, and why is RSTP faster?
!! 30–50 seconds via the listening/learning timers; RSTP negotiates directly (proposal/agreement) and finishes in seconds.
?? Three switches: SW1-SW2 gigabit (cost 4), SW1-SW3 and SW2-SW3 both 100 Mbps (cost 19 each). SW1 is the root. Which side of the SW2-SW3 link goes to blocking?
!! The SW3 side: SW2's cost to the root is 4, SW3's is 19; the SW2 port on that segment becomes designated, and the SW3 port becomes non-designated/blocking.
?? After a new link is added between two switches, a broadcast storm starts instead of the expected single blocked port. What's the first hypothesis?
!! STP isn't running on that VLAN, or bpdufilter is enabled on one of the ports, so BPDUs aren't processed and the loop goes undetected.
?? Show spanning-tree inconsistentports shows Root Inconsistent on the port to a neighboring department. What should be done — remove root guard?
!! No: this is the protection working as intended against a BPDU with a better Bridge ID from that side; raise the priority on your own root or lower it on the foreign switch instead of disabling root guard.
```
