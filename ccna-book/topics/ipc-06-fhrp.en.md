---
title: FHRP: HSRP, VRRP, GLBP
lead: How two routers share one virtual gateway, who becomes active, why preempt matters, and how the protocols differ from each other.
---

## The problem

A host has a single default gateway, set statically or handed out via DHCP. If the
router at that address dies, the whole subnet loses its way out — even with a second,
fully working router sitting right next to it.

**FHRP** solves this with a virtual address: two (or more) routers share one
**virtual IP** and one **virtual MAC**. Hosts only know those — who's actually
answering is none of their concern.

```txt
            10.1.1.254  (virtual IP)
        ┌──────────┴──────────┐
   R1 .1 (active)        R2 .2 (standby)
        └────────┬────────────┘
              PC gw = 10.1.1.254
```

## Three protocols

| | HSRP | VRRP | GLBP |
|---|---|---|---|
| Origin | Cisco | open (RFC 5798) | Cisco |
| Roles | Active / Standby | Master / Backup | AVG + up to 4 AVF |
| Load balancing | no (only by splitting VLANs) | no | **yes, built in** |
| Default priority | 100 | 100 | 100 |
| Who wins | higher priority, then higher IP | same | same |
| Virtual MAC | 0000.0C07.ACxx | 0000.5E00.01xx | 0007.B400.xxxx |
| Multicast | 224.0.0.2 (v1) / 224.0.0.102 (v2) | 224.0.0.18 | 224.0.0.102 |
| Default timers | hello 3 s, hold 10 s | advert 1 s | hello 3 s |

**GLBP** is fundamentally different: it hands out **different virtual MACs to
different hosts** in response to ARP, so the subnet's traffic gets distributed across
every router in the group. With HSRP and VRRP, traffic always flows through a single
router, and balancing is faked manually by making one router active for VLAN 10 and
another for VLAN 20.

## Configuring HSRP

```cfg
interface Vlan10
 ip address 10.1.1.1 255.255.255.0
 standby version 2
 standby 10 ip 10.1.1.254
 standby 10 priority 110
 standby 10 preempt
 standby 10 track GigabitEthernet0/1 20
```

Breakdown:

- `standby 10` — the group number; it also feeds into the virtual MAC and must match
  on both routers.
- `priority 110` — higher than the default of 100, meaning this router wants to be
  active.
- **`preempt`** — without it, a router with the better priority **won't take over**
  the active role from a router that's already active after coming back from a
  reload. This is the most common question on the topic: "I set the priority, but the
  other router stayed active" → preempt is missing.
- `track` — lowers the priority by 20 if the specified interface (usually the uplink)
  goes down; otherwise the router would stay active despite losing its path out.

VRRP is configured almost the same way (`vrrp 10 ip …`, `vrrp 10 priority …`), but
**preempt in VRRP is on by default** — another favorite distinction.

## Verification

```cli
R1# show standby brief
                     P indicates configured to preempt.
Interface   Grp  Pri P State    Active          Standby         Virtual IP
Vl10        10   110 P Active   local           10.1.1.2        10.1.1.254

R1# show standby vlan10 10
Vlan10 - Group 10 (version 2)
  State is Active
    2 state changes, last state change 02:11:43
  Virtual IP address is 10.1.1.254
  Active virtual MAC address is 0000.0C9F.F00A
  Hello time 3 sec, hold time 10 sec
  Preemption enabled
  Priority 110 (configured 110)
    Track object Gi0/1 state Up decrement 20
```

## What breaks

| Symptom | Cause |
|---|---|
| Both routers show Active | they can't see each other: different VLANs, different groups, an ACL blocking multicast |
| The role never moves back | no `preempt` |
| The router with a downed uplink stays active | `track` isn't configured |
| Hosts can't see the gateway | the virtual IP is in the wrong subnet, or the group isn't configured on every router |
| The adjacency never forms | mismatched HSRP versions (v1 and v2 are incompatible) |

## Troubleshooting: both routers think they're Active

**Symptom.** Users report unstable connectivity, both routers' logs show flickering
FHRP state-change messages, and `show standby brief` on **each** of them shows
`Active`.

**What to check.** Whether the routers can see each other over the FHRP protocol at
all:

```cli
R1# show standby vlan10 10
Vlan10 - Group 10 (version 2)
  State is Active
    4 state changes, last state change 00:00:12
  Active router is local
  Standby router is unknown
```

**What we found.** `Standby router is unknown` — R1 isn't receiving hello messages
from R2 at all, and from the protocol's point of view it looks like it's the only
router in the group, so it honestly becomes active. This **split-brain** state
happens when the FHRP control-plane multicast traffic between the routers stops
getting through — typical causes: a physical break in the link between them (each
router only sees its own hosts and decides the other one is gone), an ACL blocking the
protocol's multicast address, or a mismatched VLAN/group number on one of the routers.
The outcome is equally dangerous regardless of the cause: two virtual gateways with
the same IP and MAC answer ARP at the same time, and some hosts start sending traffic
off the working path — sometimes into a black hole.

> [!trap] Trap
> "Show standby shows Active on both — redundancy must be working extra hard" — it's
> exactly the opposite. Only one Active should exist; Active on both at once is broken
> redundancy, not reinforced redundancy.

## Troubleshooting: tracking is configured, but the role still doesn't switch over

**Symptom.** The active router has `standby track` configured on its uplink, the
uplink goes down, the log shows the priority dropping — but the active role doesn't
transfer to the neighbor.

**What to check.** Compute the priority after the decrement and compare it against the
neighboring router:

```cli
R1# show standby vlan10 10
Vlan10 - Group 10 (version 2)
  State is Active
  Priority 110 (configured 110)
    Track object Gi0/1 state Down decrement 10
```

**What we found.** The priority after tracking kicks in is `110 − 10 = 100`. The
neighboring router (R2) also has a priority of 100 (the default value). When
priorities are equal, the winner isn't the active router automatically — it's the
router with the higher IP address — and if that happens to be R1 again, it stays
active despite effectively having lost its uplink. The decrement was set too small to
guarantee it yields: the rule is that the decrement must be **greater than the
priority difference** between the routers, not an arbitrary number. Here it needed to
drop by at least 11, so the resulting priority (99) would fall below the neighbor's
(100).

## Walkthrough: how GLBP distributes load

Unlike HSRP/VRRP, GLBP has separate roles:

- **AVG** (active virtual gateway) — one per group, answers clients' ARP requests and
  decides whose virtual MAC to hand out to each specific host.
- **AVF** (active virtual forwarder) — up to four roles, each with its own virtual
  MAC; these actually forward traffic for the hosts that were handed their specific
  MAC.

```txt
PC1 ARP → gateway 10.1.1.254 → AVG replies with R1's MAC (AVF1)
PC2 ARP → gateway 10.1.1.254 → AVG replies with R2's MAC (AVF2)
```

Both PCs use the same virtual **IP**, but different virtual **MACs** — so their
traffic physically flows through different routers with no need for the manual VLAN
splitting that HSRP/VRRP would require. If one of the AVFs goes down, the AVG
redistributes its MAC address across the remaining routers, and hosts that already
cached the ARP entry keep working without interruption — just through a different
physical forwarder.

## What gets asked

- "Which protocol is an open standard FHRP?" — VRRP.
- "Which FHRP provides load balancing natively?" — GLBP.
- "What is the purpose of the preempt command?" — to return the active role to the
  router with the higher priority.
- "Which router becomes active?" — the one with the highest priority; on a tie, the
  one with the highest IP.
- "What is the virtual MAC of HSRPv1 group 10?" — `0000.0C07.AC0A` (the group number
  in hex, two digits). For HSRPv2 the same group number produces a different format —
  `0000.0C9F.F00A` (the group number takes up three hex digits), as shown in the
  `show standby` example above.
- "Why did the router remain active after its uplink failed?" — tracking isn't
  configured.
- "Both routers in an FHRP group show Active state. What is the most likely cause?" —
  the routers have stopped receiving hellos from each other (link break, an ACL
  blocking multicast, or a mismatched group/VLAN) — a classic split-brain.
- "A tracked interface fails and the priority decreases, but the router remains active.
  What is misconfigured?" — the tracking decrement is smaller than the priority
  difference between the routers, so the resulting priority is still not lower than
  the neighbor's.
- "How does GLBP distribute traffic among group members?" — a single AVG answers ARP
  and hands out different virtual MACs, from up to four AVFs, to different hosts; the
  AVFs do the actual forwarding, while there's still just one virtual IP shared by
  everyone.

## Check yourself

```check
?? A router is given priority 120, but the neighbor with priority 100 stays active. Why?
!! Preempt isn't enabled — the role isn't taken away from a router that's already active.
?? Which FHRP can distribute a subnet's traffic across routers on its own?
!! GLBP: it hands different hosts different virtual MACs.
?? What does a host see as its gateway when HSRP is running?
!! The group's virtual IP and virtual MAC; which router is actually behind them is unknown to it.
?? Why is interface tracking needed?
!! So the router gives up the active role if it loses its outbound uplink, instead of holding onto the traffic anyway.
?? How does preempt behavior differ in VRRP?
!! There it's enabled by default; in HSRP it isn't.
?? show standby on both routers in a group shows Active, and one of them reports Standby router is unknown. What happened?
!! Split-brain: the routers stopped receiving hellos from each other (link break, an ACL blocking multicast, or a mismatched group/VLAN), and both honestly believe they're the only one in the group.
?? Priority 110, track decrement 10, neighbor's default priority is 100. Will the router give up the active role when the tracked interface goes down?
!! No: after the decrement the priority becomes 100, equal to the neighbor's, not lower — on a tie the higher IP wins, not automatically the neighbor; the decrement needs to be larger than the priority difference (at least 11 here).
?? How does the gateway IP address differ from the gateway MAC address seen by clients in a GLBP group?
!! The IP is the same for every client (the AVG's virtual address), but the MAC can differ between clients — the AVG hands out different AVFs' MACs, physically spreading traffic across the routers.
```
