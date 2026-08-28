---
title: Cisco WLAN Architectures and AP Modes
lead: Autonomous, lightweight and CAPWAP, split-MAC, FlexConnect, embedded, and cloud — who stores the configuration and who processes the traffic.
---

## Three generations of architecture

| Architecture | Where the config lives | Where traffic decisions happen | Scale |
|---|---|---|---|
| **Autonomous** | on each AP | on the AP | a handful of APs |
| **Controller-based (split-MAC)** | on the WLC | split: AP + WLC | dozens to thousands |
| **Cloud-managed (Meraki)** | in the cloud | on the AP | distributed networks |

**Embedded Wireless Controller** and the earlier **Mobility Express** are a middle ground:
one of the switches, or the AP itself, takes on the controller role. No separate box is
needed, yet you still get centralized management.

## Split-MAC: who does what

In a controller-based architecture, 802.11 functions are split between the AP and the
WLC — hence the name.

| Access point (real-time) | Controller (management) |
|---|---|
| radio frame transmission and reception | client association and authentication |
| acknowledgments (ACK), beacons | SSID and policy management |
| frame buffering and prioritization | RRM: channel and power selection |
| over-the-air encryption | roaming between APs, mobility |
| probe responses | rogue AP detection, QoS profiles |

The dividing rule: **anything that has to happen in microseconds stays on the AP;
anything that needs the full network picture goes to the controller.**

## CAPWAP

An AP finds its controller and brings up a **CAPWAP** tunnel to it (Control And
Provisioning of Wireless Access Points):

- **UDP 5246** — the control channel, always encrypted (DTLS);
- **UDP 5247** — the data channel; data encryption is off by default.

CAPWAP replaced the proprietary LWAPP and runs over **IP**, which means the AP and the
controller **can live in different subnets** — routing between them is fine. This is
exactly the fact tested by "must the AP and WLC be on the same VLAN?" — no, they don't.

How an AP looks for its controller (in order): a previously saved address → DHCP option
43 → the DNS name `CISCO-CAPWAP-CONTROLLER` → broadcast on its local subnet. A bad option
43 entry is the classic reason an AP "won't join."

> [!trap] Trap
> A lightweight AP **is useless without a controller**: it stores no configuration of its
> own, and once it loses the CAPWAP tunnel it stops serving clients — except in
> FlexConnect with local switching.

## AP operating modes

| Mode | What it does |
|---|---|
| **Local** | normal mode: clients are served, traffic is tunneled to the WLC |
| **FlexConnect** | traffic is switched locally at the branch; the AP keeps working if it loses the WLC |
| **Monitor** | doesn't serve clients, just listens to the air (rogue detection, IDS, location) |
| **Sniffer** | captures frames and hands them off to an analyzer |
| **Rogue detector** | listens on the wired network, matching MACs of foreign APs |
| **Bridge / Mesh** | a bridge between buildings, or a wireless mesh network |
| **SE-Connect** | spectrum analysis |

FlexConnect answers the question about a branch with a thin WAN link: hauling all user
traffic to a central WLC and back makes no sense, so it's switched locally instead.

## Centralized vs. distributed traffic

- **Centralized (local mode)** — all client traffic goes into a CAPWAP tunnel to the WLC
  and only exits to the wired network there. Simple to manage, but the controller becomes
  a traffic concentration point.
- **FlexConnect local switching** — traffic exits to the network right at the AP, on the
  local VLAN; only management traffic goes to the WLC.

## What the controller gives you

- **RRM** — automatic channel and power selection that accounts for neighbors; if an AP
  fails, its neighbors raise power ("self-healing").
- **Unified roaming** — a client moves between APs without losing its session; the
  controller tracks everything about it.
- **Unified policy** — SSID, security, and QoS are configured once for the entire ESS.
- **Rogue detection** — foreign APs in the air are visible and can be located.

That's exactly why the answer to "why use a WLC with 50 APs" isn't "speed" — it's
**centralized management, roaming, and automatic RF planning**.

## 802.11 management frames and roaming between APs

There are three 802.11 frame types — **management, control, data**. A client's
association with an AP lives entirely in **management** frames:

| Frame | Who sends it | When |
|---|---|---|
| Probe Request / Response | client → AP / AP → client | client is scanning for available networks |
| Authentication | client ↔ AP | the first step of connecting (open or key-based) |
| Association Request / **Response** | client → AP / AP → client | client requests to join, AP confirms |
| **Reassociation** Request / Response | client → new AP | client **moves** to another AP in the same ESS without dropping the session |
| Deauthentication / Disassociation | either side | an explicit disconnect |

The key detail for roaming questions: a client already connected to the network, when
moving to a different AP, sends not an Association but a **Reassociation Request** — that's
what distinguishes an initial connection from roaming inside the same ESS.

### Fast roaming: 802.11r/k/v

A regular reassociation requires running the full key exchange again with the new AP — a
noticeable pause for voice traffic or a video call. Three standards speed this up:

- **802.11r (Fast Transition, FT)** — key material is negotiated ahead of time, before the
  physical move; in the controller GUI this is the **Fast Transition** option, enabled
  alongside a Key Management method (**FT 802.1X** for Enterprise, **FT PSK** for
  Personal).
- **802.11k** — the AP hands the client a list of neighboring APs (Neighbor List), so the
  client doesn't have to scan every channel to find where to go.
- **802.11v** — the AP helps the client decide when to move (BSS Transition Management)
  and manages its power saving (BSS Max Idle).

> [!key] Remember
> To minimize handoff time across a mix of client types (laptops, phones, tablets), the
> correct answer is **802.11k** (Neighbor List): it doesn't depend on a specific
> authentication method and works with any client that supports it, unlike 802.11r, which
> requires a negotiated Fast Transition.

## Diagnostics: a new AP won't join the controller

**Symptom.** An access point is connected to the network, its LED blinks to indicate
searching, but it never reaches a working state and never shows up in the AP list on the
WLC.

**What we check.** The controller-discovery sequence, in the same order the AP itself
tries it:

```cli
WLC# show ap join stats summary <AP-mac-address>
```

1. **Saved address** — if the AP has previously joined a different WLC, it tries that one
   first; on a new network there isn't one, so move on.
2. **DHCP option 43** — the server should return the controller's IP address (or several)
   alongside the regular DHCP reply. A typo in the option 43 hex string (Cisco APs expect a
   specific TLV format) is the single most common reason an AP never even tries reaching
   the right WLC.
3. **DNS name `CISCO-CAPWAP-CONTROLLER.<domain>`** — if the AP has a domain and DNS is
   configured, it will try to resolve this name.
4. **Broadcast on its own subnet** — only works if the WLC is physically on the same
   Layer 2 segment.

**What we found.** If DHCP option 43 is wrong or missing and the WLC is on a different
subnet, step 4 will fail too — the AP runs through every option and finds nothing. Even
once the controller's address is found correctly, the connection can still fail because of
a time mismatch: the CAPWAP control channel is protected by **DTLS**, and certificate
validation is sensitive to system clocks — if the clock on the AP or the controller has
drifted significantly (for example, the AP hasn't synced via NTP yet after a cold start),
the DTLS handshake fails right at the secure-channel setup stage, and it looks like "the AP
won't join" with no obvious hint of the cause in its own log.

> [!key] Remember
> "The AP won't join" isn't one single cause — it's a chain: first, does it even find the
> WLC's address (option 43/DNS/broadcast); then, does it get through the DTLS handshake
> (time, certificates); and only after that, software version compatibility between the AP
> and the controller.

## Worked example: traffic path in local mode vs. FlexConnect

```txt
Local mode (centralized):
  Client → AP → CAPWAP tunnel (data, UDP 5247) → WLC → wired network

FlexConnect local switching:
  Client → AP → straight onto the local VLAN
  (only the management CAPWAP channel still goes to the WLC)
```

In **local mode**, every byte of user traffic physically passes through the controller —
even if the server the client is talking to sits in the same rack as the AP. That doesn't
matter for a small network with a fast link to the WLC, but at a branch with a narrow,
expensive WAN link to the central data center, it means ordinary employee web browsing
doubles the load on that link: once to the WLC, once from the WLC out to the internet.
**FlexConnect local switching** solves this by letting the AP switch user traffic onto the
local VLAN itself, leaving the WLC with only a management role. That's why the exam logic
for picking a mode isn't "which mode is newer" — it's "where does the resource the clients
are talking to physically sit" relative to the WLC.

## Diagnostics: a client drops its session roaming between two different controllers

**Symptom.** Roaming between APs on the same WLC is seamless, but moving to an AP
registered on a **different** controller (in the same campus) makes the client reconnect
from scratch — there's a short but noticeable pause and a fresh authentication.

**What we check.** The mobility settings between the controllers:

```cli
WLC1# show mobility summary
Mobility Protocol Port............ 16666
Mobility Group Name............... CAMPUS-A
Mobility Domain ID................ 0x1234

WLC2# show mobility summary
Mobility Group Name............... CAMPUS-B
```

**What we found.** WLC1 and WLC2 have different mobility group names — architecturally,
that means **two independent mobility domains**, not one shared one. Within a single
mobility group, controllers exchange client information with each other, and moving to an
AP on another member of the group is a **fast roam** with no full reauthentication. Between
different groups there's no such exchange at all, and roaming will always be "slow" — from
the client's point of view it looks like a disconnect and a fresh connection. The fix is to
merge the relevant WLCs into one mobility group if seamless roaming between them is
actually required, rather than trying to treat the symptom on the client side.

## What gets asked

- "Which two functions are performed by the WLC in a split-MAC architecture?" — client
  association/authentication, RRM, policy, and roaming (not frame transmission or ACKs).
- "Which ports does CAPWAP use?" — UDP 5246 (control) and 5247 (data).
- "Must the AP be in the same subnet as the WLC?" — no, CAPWAP runs over IP.
- "Which AP mode allows the branch to keep working when the WAN link is down?" —
  FlexConnect.
- "Which mode is used to capture wireless frames for analysis?" — sniffer (or monitor, for
  continuous listening on the air).
- "What happens to a lightweight AP that loses its controller?" — it stops serving clients
  (except with FlexConnect local switching).
- "An AP finds the correct WLC address but never completes joining. What could cause
  this?" — a clock mismatch between the AP and the controller breaks the CAPWAP tunnel's
  DTLS handshake, even when the address was found correctly.
- "Why does user traffic use more WAN bandwidth in local (centralized) mode than
  FlexConnect local switching?" — in local mode all client traffic passes through the WLC
  over the CAPWAP tunnel, even when the destination resource is physically next to the AP.
- "Roaming between APs on the same controller is seamless, but roaming to an AP on a
  different controller causes reauthentication. What should be checked?" — whether the
  mobility group matches on both controllers; without a shared group, fast roaming between
  them doesn't work.

## Check yourself

```check
?? In split-MAC, who handles frame acknowledgments and beacons?
!! The access point — those are real-time operations.
?? Which ports and transport does CAPWAP use?
!! UDP 5246 for control and 5247 for data.
?? How does a lightweight AP learn its controller's address if it isn't configured statically?
!! DHCP option 43, then the DNS name CISCO-CAPWAP-CONTROLLER, then broadcast on its own subnet.
?? A branch has a narrow link to the data center. Which AP mode should be chosen, and why?
!! FlexConnect with local switching: user traffic isn't hauled to and from the WLC, and the AP survives a WAN outage.
?? How does an autonomous AP differ from a lightweight one, in one sentence?
!! An autonomous AP stores its own configuration and runs independently; a lightweight AP gets everything from the controller over CAPWAP.
?? An AP has found the correct WLC IP address, but the connection never completes. Which cause has nothing to do with addressing at all?
!! A clock mismatch between the AP and the controller — the CAPWAP control channel is protected by DTLS, and certificate validation is sensitive to system time.
?? Why does ordinary web browsing at a branch load the WAN link more heavily in local mode than in FlexConnect local switching?
!! In local mode, all user traffic goes through the CAPWAP tunnel to the WLC and exits there, even if the destination resource is right next to the AP; FlexConnect switches traffic locally, and only management traffic goes to the WLC.
?? Roaming between APs on the same WLC is instant, but roaming between APs on different WLCs triggers reauthentication. What should be checked?
!! Whether the mobility group name matches on both controllers — without a shared mobility group, fast roaming between them doesn't work.
```
