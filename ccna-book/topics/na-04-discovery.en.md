---
title: CDP and LLDP
lead: How a device learns what's on the other end of the cable, how open LLDP differs from proprietary CDP, and what to read in their output.
---

## Why Discovery Protocols Exist

Usually the cable is already plugged in and there's no diagram. **CDP** and **LLDP**
solve exactly that: every device periodically advertises itself to its neighbors — name,
platform, port, software version, addresses. From this you build a map of neighbors and
verify that a cable actually goes where you think it does.

| | CDP | LLDP |
|---|---|---|
| Standard | Cisco proprietary | open IEEE 802.1AB |
| Enabled by default | yes | no |
| Advertisement interval | 60 s | 30 s |
| Holdtime | 180 s | 120 s |
| Works with other vendors' gear | no | yes |
| Telephony extension | CDP carries the voice VLAN | LLDP-MED |

> [!key] Remember
> A mixed network (Cisco + HPE/Aruba/Juniper) → **LLDP**. Cisco-only → CDP already works,
> nothing to enable.

## Commands

```cfg
! CDP
no cdp run                    ! disable globally
cdp run                       ! enable globally
interface gi0/1
 no cdp enable                ! disable on a single port

! LLDP
lldp run                      ! enable globally (disabled by default)
interface gi0/1
 no lldp transmit             ! don't advertise
 no lldp receive              ! don't listen
```

LLDP controls transmit and receive **separately** — a favorite distinction in exam
questions. CDP has no such split.

## Reading the Output

```cli
SW1# show cdp neighbors
Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge
                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,
                  D - Remote, C - CVTA, M - Two-port Mac Relay

Device ID    Local Intrfce   Holdtme  Capability   Platform   Port ID
R1           Gig 0/1          142        R S I     C9200      Gig 0/0/0
SW2          Gig 0/24         168        S I       WS-C2960   Gig 0/1
IP-Phone-12  Gig 0/5          131        H P M     IP Phone   Port 1
```

What to read here:

- **Local Intrfce** — your own port; **Port ID** — the neighbor's port. These get mixed
  up constantly in "which interface connects to the neighbor" questions.
- **Capability** — what kind of device it is: `R` router, `S` switch, `H` host, `P`
  phone.
- **Holdtme** — how many seconds this entry stays valid without a refresh.

`show cdp neighbors detail` (or `show cdp entry *`) adds the important part — the
neighbor's **IP address** and IOS version:

```cli
SW1# show cdp neighbors detail
Device ID: R1
Entry address(es):
  IP address: 10.0.0.1
Platform: cisco C9200,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet0/0/0
Version :
Cisco IOS Software, Version 17.9.4
```

LLDP works the same way: `show lldp neighbors` and `show lldp neighbors detail`, plus
`show lldp entry <name>`.

## Security

Advertisements go out in the clear and contain the model, software version, and
management address — a gift to reconnaissance. The recommendation is to **disable
CDP/LLDP on user-facing and external-facing ports**, leaving it enabled only between
infrastructure devices.

The exception is ports with IP phones: CDP/LLDP-MED is needed there so the phone can
learn its voice VLAN and negotiate PoE.

## Where This Comes Up on the Exam

Exhibit-based questions often give you nothing but `show cdp neighbors` output and ask
you to reconstruct the topology: who's connected to whom, and through which port. The
approach is simple — take **Local Intrfce** as your own end, **Port ID** as the far end,
and `Capability` tells you the device type.

The second common scenario: a neighbor isn't showing up. The causes, in order — CDP is
disabled globally or on the port, the neighbor is different equipment (you need LLDP), or
the port simply isn't up.

## Walkthrough: Reconstructing a Topology From Three Outputs

Given three `show cdp neighbors` outputs and no diagram — figure out who's connected to
whom and through which ports.

```cli
SW1# show cdp neighbors
Device ID    Local Intrfce   Holdtme  Capability   Platform   Port ID
SW2          Gig 0/24         165        S I       WS-C2960   Gig 0/24
R1           Gig 0/1          140        R S I     C9200      Gig 0/0/1

SW2# show cdp neighbors
Device ID    Local Intrfce   Holdtme  Capability   Platform   Port ID
SW1          Gig 0/24         170        S I       WS-C2960   Gig 0/24
SW3          Gig 0/23         155        S I       WS-C2960   Gig 0/24

R1# show cdp neighbors
Device ID    Local Intrfce      Holdtme  Capability   Platform   Port ID
SW1          Gig 0/0/1           138        S I       WS-C2960   Gig 0/1
```

Read each row as a pair — "my port (Local Intrfce) to the neighbor's port (Port ID)" —
and assemble the links: SW1 `Gi0/24` ↔ SW2 `Gi0/24`; SW2 `Gi0/23` ↔ SW3 `Gi0/24`; SW1
`Gi0/1` ↔ R1 `Gi0/0/1`. Notice that R1's own table shows only SW1 — SW2 and SW3 aren't
CDP neighbors of R1 at all: **discovery only works one hop**, and R1 simply isn't
physically connected to SW2 or SW3, even though it can route to networks behind them.
The full topology comes together as a chain: `R1 — SW1 — SW2 — SW3`.

> [!trap] Trap
> "R1 doesn't see SW3 in CDP — so there's no connectivity between them at all" is wrong.
> CDP/LLDP only show **directly** connected neighbors on the same cable; routing to
> distant networks across multiple hops never shows up in CDP — for that, check the
> routing table.

## Troubleshooting: Two Cisco Switches Are Connected but Don't See Each Other Via CDP

**Symptom.** The cable is physically working (`show interfaces` shows `up/up`, traffic
passes), but neither switch shows the other in `show cdp neighbors`.

**What to check.** Whether CDP is enabled at all — both globally and on the specific
port:

```cli
SW1# show cdp
% CDP is not enabled

SW2# show run interface gi0/1 | include cdp
 no cdp enable
```

**What we found.** There are two independent causes here, one on each switch: SW1 has
CDP disabled **globally** (`no cdp run` somewhere in the config — rare, but it happens
in hardened environments), while SW2 has CDP disabled **only on this port**
(`no cdp enable`). For neighbors to see each other, both sides need CDP enabled both
globally and on the interface at the same time — disabling either layer on either end
kills discovery in that direction entirely.

## Troubleshooting: IP Phone Isn't Getting Its Voice VLAN

**Symptom.** A PC plugged directly into a switch port works fine; an identical PC behind
an IP phone on the neighboring port gets network access, but the phone itself never
registers with the telephony server.

**What to check.** Whether a discovery protocol is present on this specific port — it's
how the phone learns its voice VLAN number (see the VLAN and voice VLAN chapter):

```cli
SW1# show cdp neighbors interface gi1/0/5
% No CDP neighbors found on interface GigabitEthernet1/0/5

SW1# show run interface gi1/0/5 | include cdp|lldp
 no cdp enable
```

**What we found.** CDP is disabled on this port (often "for security," following the
general recommendation to disable discovery on end-device-facing ports) — but ports with
IP phones are exactly where that rule **doesn't apply**: without CDP (or LLDP-MED, if the
phone supports it), the phone never learns its voice VLAN and stays in the data VLAN,
where the telephony server isn't listening for it. The PC behind the phone works fine
because it never needs the voice VLAN for ordinary network access — that asymmetry (PC
works, phone doesn't) is exactly what points to this cause.

## What Gets Asked

- "Which protocol is open standard and must be enabled manually?" — LLDP.
- "What information does show cdp neighbors provide?" — neighbor name, local port,
  neighbor's port, platform, capability; **the IP address only shows up in detail**.
- "Which command displays the IOS version of a neighbor?" —
  `show cdp neighbors detail`.
- "An engineer must discover devices from another vendor" — enable `lldp run`.
- "Why disable CDP on a port facing an untrusted network?" — to avoid revealing the
  model, software version, and management address.
- Drag-and-drop: match properties (30/60 seconds, open/proprietary, enabled by default)
  to CDP and LLDP.
- "A router does not see a switch two hops away in `show cdp neighbors`. Is this a
  problem?" — no: discovery only works one physical hop, so distant devices never
  show up there — that's expected.
- "Two Cisco switches are physically connected and passing traffic, but neither shows
  the other as a CDP neighbor. What are two possible causes?" — CDP disabled globally on
  one of them, or disabled just on that port (`no cdp enable`) — both layers are checked
  independently.
- "A PC behind an IP phone works normally, but the phone itself never registers. What
  should be checked on the switch port?" — whether CDP (or LLDP-MED) is enabled on that
  port: it's exactly how the phone learns its voice VLAN number.

## Check Yourself

```check
?? Which protocol works with other vendors' equipment, and does it need to be enabled?
!! LLDP; it's disabled by default and turned on with lldp run.
?? Where in show cdp neighbors do you find the neighbor's port?
!! In the Port ID column; Local Intrfce is your own port.
?? You need the neighbor's IP address. Which command?
!! show cdp neighbors detail (or show cdp entry *).
?? What are CDP's advertisement interval and holdtime?
!! 60 and 180 seconds.
?? Why is CDP disabled on user-facing ports?
!! Its advertisements reveal the model, software version, and management address — reconnaissance data for an attacker.
?? R1 is connected to SW1, and SW1 is connected to SW2. Will SW2 show up in show cdp neighbors on R1?
!! No: CDP/LLDP only see devices on the far end of their own cable, one hop away; SW2 is a neighbor of a neighbor to R1, not a direct neighbor.
?? The cable between two Cisco switches is fine and traffic flows, but there's no CDP neighborship in either direction. Where do you look on each of them?
!! On each switch separately: is CDP enabled globally (show cdp), and is it enabled on that specific interface (no cdp enable in the port config) — the two levels are independent.
?? An IP phone doesn't register, even though the PC behind it works fine. Which protocol should you check first on that port?
!! CDP or LLDP-MED — that's how the phone gets its voice VLAN number; discovery disabled on that port leaves the phone stuck in the regular data VLAN.
```
