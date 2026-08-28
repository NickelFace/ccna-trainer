---
title: EtherChannel
lead: How several links become one logical link, how LACP differs from PAgP, which modes will actually form a channel, and why one falls apart.
---

## Why Bundle Links

Two switches are connected by two cables. Without aggregation, spanning tree blocks the
second one — you get redundancy, not bandwidth. **EtherChannel** bundles physical ports
into one logical link:

- **Bandwidth adds up** — four gigabit links give you 4 Gbps total.
- STP sees **a single port**, so there's no blocking and no loop.
- Losing one link doesn't take down the channel — traffic redistributes across the
  remaining links, instantly, with no spanning-tree recalculation.

Up to 8 active ports per channel (plus up to 8 more in standby with LACP).

## Negotiation Protocols

| | PAgP | LACP | Static |
|---|---|---|---|
| Standard | Cisco | IEEE 802.3ad | — |
| Modes | `auto`, `desirable` | `passive`, `active` | `on` |
| Checks compatibility | yes | yes | no |
| Standby ports | no | up to 8 | no |

The compatibility table exams ask about directly:

| Side A | Side B | Channel forms? |
|---|---|---|
| LACP `active` | `active` | yes |
| LACP `active` | `passive` | yes |
| LACP `passive` | `passive` | **no** |
| PAgP `desirable` | `desirable` | yes |
| PAgP `desirable` | `auto` | yes |
| PAgP `auto` | `auto` | **no** |
| `on` | `on` | yes |
| `on` | `active`/`desirable` | **no** |

> [!key] Remember
> The logic is identical for both protocols: **two passive sides never negotiate with
> each other**, and mode `on` doesn't negotiate with anyone at all — the other side has
> to be `on` too.

You can't mix LACP and PAgP on the same channel.

## Configuration

```cfg
interface range gigabitethernet0/1 - 2
 shutdown
 channel-group 1 mode active          ! LACP
 no shutdown
!
interface port-channel 1
 switchport mode trunk
 switchport trunk allowed vlan 10,20
```

Order matters: the settings on the logical `port-channel` interface are what actually
take effect; the physical ports themselves must all be **identical**.

What must match across every port in the channel (otherwise the port won't join and gets
marked `suspended`):

- speed and duplex;
- port mode (all access in the same VLAN, or all trunk);
- the allowed VLAN list and native VLAN on the trunk;
- type (Layer 2 or Layer 3).

## Verification

```cli
SW1# show etherchannel summary
Flags:  D - down        P - bundled in port-channel
        I - stand-alone s - suspended
        R - Layer3      S - Layer2
        U - in use      f - failed to allocate aggregator

Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------
1      Po1(SU)         LACP      Gi0/1(P)   Gi0/2(P)
2      Po2(SD)         LACP      Gi0/3(s)   Gi0/4(s)
```

Reading the flags is half the questions on this topic:

- `SU` — an active Layer 2 channel. `SD` — the channel is down.
- `(P)` — the port is bundled in, all good.
- `(s)` — suspended: parameters didn't match, or the other side isn't responding.
- `(I)` — stand-alone: the port is on its own, no channel.
- `(D)` — the port is down.

`show etherchannel port-channel` and `show interfaces port-channel 1` fill in the rest of
the picture.

## Load Balancing

Traffic is distributed **by flow, not by packet** — otherwise packets from the same
session would arrive out of order. The hash is computed from addresses, and by default
from the source MAC:

```cfg
port-channel load-balance src-dst-ip
```

```cli
SW1# show etherchannel load-balance
EtherChannel Load-Balancing Configuration:
        src-dst-ip
```

This leads to a non-obvious consequence exams love to ask about: **a single flow never
gets more bandwidth than one physical link**. Copying one large file between two servers
over a 4×1G channel still runs at 1 Gbps. If all traffic goes through a single router,
hashing on MAC produces an imbalance — switch the algorithm to `src-dst-ip`.

## Layer 3 EtherChannel

On an L3 switch, a channel can be pulled out of switching entirely:

```cfg
interface port-channel 1
 no switchport
 ip address 10.0.0.1 255.255.255.252
!
interface range gigabitethernet0/1 - 2
 no switchport
 channel-group 1 mode active
```

This is how distribution switches are connected: bandwidth adds up, and STP doesn't
participate at all.

## Troubleshooting: A Port Goes Suspended Right After Joining the Channel

**Symptom.** A third link was added to an existing EtherChannel; the cable is physically
fine, the interface is `up`, but it won't join the channel.

**What to check.** A line-by-line comparison of the new port's parameters against the
ones already working:

```cli
SW1# show etherchannel summary
Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------
1      Po1(SU)         LACP      Gi0/1(P)   Gi0/2(P)   Gi0/3(s)

SW1# show interfaces gi0/3 switchport | include Mode|Trunking VLANs
Administrative Mode: static access
Trunking VLANs Enabled: ALL
```

**What we found.** `Gi0/1` and `Gi0/2` are trunks, while the newly added `Gi0/3` is still
an **access port** (factory default). EtherChannel requires every physical port in the
channel to be configured **identically** before it joins the group — LACP doesn't "adjust"
a new port to match the rest, it simply refuses to accept it and marks it `suspended`.
This is one of the few situations where no error message shows up at all: the interface
looks completely fine on its own, and the cause is invisible without comparing it to the
neighboring ports. The practical fix: bring the new port's configuration
(`switchport mode trunk`, `allowed vlan`, speed/duplex) in line with the channel's
existing ports first, and only then add it to the `channel-group` — following the same
correct command order shown in the configuration section above (`shutdown` →
`channel-group` → `no shutdown`).

## Troubleshooting: Both Sides Are Set to "on," but the Channel Won't Come Up

**Symptom.** Both switches have `channel-group 1 mode on` (static, no protocol), both
ports are physically `up`, but `show etherchannel summary` shows separate stand-alone
ports instead of a bundled channel.

**What to check.** With mode `on`, the first thing to check isn't the protocol (there is
none) — it's the physical parameters and the topology itself:

```cli
SW1# show interfaces gi0/1 status
Port      Name     Status       Vlan  Duplex  Speed Type
Gi0/1              connected    10    a-full  a-1000 10/100/1000BaseTX

SW2# show interfaces gi0/1 status
Port      Name     Status       Vlan  Duplex  Speed Type
Gi0/1              connected    10    a-half  a-100  10/100/1000BaseTX
```

**What we found.** Speed and duplex don't match on the two ends (1000/full versus
100/half) — mode `on` simply isn't capable of checking or negotiating anything, not
speed, not VLAN, not duplex, which is exactly why it's called static. With LACP/PAgP,
this mismatch would have produced a clean `suspended` state with an obvious cause; with
`on`, the outcome can be even worse — if only one link in the group ends up working while
another silently stays out of sync, EtherChannel risks creating an inconsistent loop
instead of providing redundancy. Hence the practical takeaway exams state as fact:
**mode `on` is the one case where a configuration error can go completely unnoticed via
the usual troubleshooting path (`show etherchannel summary`)** — you have to check the
physical port parameters manually.

> [!trap] Trap
> "If both ports are `on`, the channel is guaranteed to form" is not true. `on` skips all
> the compatibility checks LACP and PAgP perform, and a mismatch can go unnoticed until
> the first failure.

## Walkthrough: How the Hash Distributes Different Flows

A channel of four links, `src-dst-ip` balancing. Three traffic flows with different
source/destination address pairs:

```txt
Flow 1: 10.1.1.10 → 10.2.2.20   → the hash picks Gi0/1
Flow 2: 10.1.1.11 → 10.2.2.20   → the hash picks Gi0/3
Flow 3: 10.1.1.10 → 10.2.2.21   → the hash picks Gi0/2
```

Every unique address pair produces its own hash result, and the switch pins **the entire
flow** to one physical link — that's what keeps packets from the same session from
arriving out of order. Notice that flow 1 and flow 3 share the same source IP but
different destinations — and that alone gives them different links, because the hash is
computed from the address **pair**, not from a single field. If load balancing were based
only on source MAC (the default on many platforms) and all the traffic went through the
same router as the next hop, every flow would share **the same** source MAC — and the
hash would collapse to the same value for all of them, loading only one link out of four
in practice. Hence the rule: the more varied the field the hash is computed over (IP
beats MAC, a port pair beats an IP pair), the more even the distribution when there are
only a few distinct senders.

## What Gets Asked

- "Which two modes will form an EtherChannel?" — read straight off the compatibility
  table.
- "What is the result when both sides are set to auto/passive?" — the channel won't
  form.
- "Refer to the exhibit… why is the port suspended?" — mismatched port parameters
  (VLAN, duplex, speed, mode), or no negotiation happening on the other side.
- "Which protocol is the industry standard?" — LACP (802.3ad).
- "Why does a single file transfer not use the full channel bandwidth?" — load balancing
  is per flow, and one flow lives on one physical link.
- "What must match on all ports in a channel?" — speed, duplex, mode, VLAN.
- "A newly added port to an existing channel shows as suspended, with no error message.
  What is the most likely cause?" — the new port wasn't brought to the same parameters
  (VLAN/trunk/speed/duplex) as the channel's existing ports before being added to the
  group.
- "Both sides of a channel use mode `on`, and the link stays inconsistent instead of
  cleanly failing. Why?" — mode `on` doesn't negotiate or check anything (unlike
  LACP/PAgP), so a parameter mismatch can go unnoticed.
- "Why do two flows with the same source IP but different destination IPs end up on
  different physical links in the channel?" — the load-balancing hash is computed from
  the address pair, not a single field, so different pairs produce different results.

## Check Yourself

```check
?? LACP passive on both sides — will the channel form?
!! No, at least one side needs to be active. Same rule applies to PAgP's auto/auto.
?? What does the (s) flag mean for a port in show etherchannel summary?
!! Suspended: the port's parameters didn't match the channel, or negotiation failed.
?? Copying a file between two servers over a 4×1G channel gets 1 Gbps. Is something broken?
!! No: load balancing is per flow, and a single flow never spans more than one physical link.
?? How does STP see a four-link EtherChannel?
!! As one logical port — so nothing gets blocked and no loop forms.
?? Which interface do you configure trunk mode on for a channel?
!! The logical port-channel interface; the physical ports must all be configured identically.
?? A new port added to an existing LACP channel goes suspended with no explicit error. What do you check?
!! Whether its VLAN/trunk mode, speed, and duplex match the channel's existing ports — LACP doesn't adjust parameters for you, it just refuses a mismatched port.
?? Both ends of a channel are set to mode on, and their speed and duplex don't match. Why is this worse than the same mismatch under LACP?
!! Mode on performs no compatibility checking at all, so the mismatch can go unnoticed until something fails — LACP in the same situation would cleanly move the port to suspended.
?? Balancing is src-dst-ip. Flow A: 10.1.1.10→10.2.2.20, flow B: 10.1.1.10→10.2.2.21. Will they travel the same physical link?
!! Not necessarily: the hash is computed from the source-destination address pair, and different destinations with the same source will almost certainly produce different links.
```
