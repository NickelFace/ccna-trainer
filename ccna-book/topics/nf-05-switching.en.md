---
title: How a Switch Makes a Decision
lead: The MAC address table, learning, flooding, entry aging, and what you see in show mac address-table.
---

## Three actions, and that's it

For every incoming frame, a switch does exactly three things:

1. **Learns.** It looks at the **source MAC** and remembers: "this address lives behind
   port X in VLAN Y." If an entry already existed, it refreshes the timer.
2. **Decides.** It looks up the **destination MAC** in its VLAN's table.
3. **Forwards.** Found it — sends out a single port (**forward**). Didn't find it — sends
   out every port in the VLAN except the one it arrived on (**flood**). Found it, but it's
   the same port the frame came in on — drops it (**filter**).

> [!key] Remember
> A switch learns from the **source**, decides from the **destination**. Half the exam
> mistakes come from mixing up these two words.

## What gets flooded

Three types of frames get sent out every port in the VLAN:

- **broadcast** (`FF:FF:FF:FF:FF:FF`) — ARP requests, DHCP Discover;
- **unknown unicast** — the destination address hasn't been learned yet;
- **multicast** — if IGMP snooping isn't enabled on the switch.

This isn't a malfunction. A frame to a server that hasn't "spoken" yet legitimately goes
out every port — and as soon as the server responds, the switch learns its MAC from that
reply, and subsequent frames go out point-to-point.

## The table

```cli
SW1# show mac address-table
          Mac Address Table
-------------------------------------------

Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    DYNAMIC     Gi1/0/1
  10    0050.7966.6801    DYNAMIC     Gi1/0/2
  10    aabb.cc00.0100    STATIC      Gi1/0/24
  20    0050.7966.6810    DYNAMIC     Gi1/0/5
Total Mac Addresses for this criterion: 4
```

What the exam expects you to read here:

- **Vlan** — the table is kept separately per VLAN. The same MAC can appear in different
  VLANs.
- **Type**: `DYNAMIC` — learned, ages out; `STATIC` — configured manually or created by
  port security (`sticky`).
- **Ports** — a port can have many addresses attached to it (another switch, or virtual
  machines behind a hypervisor, sits behind it). Several MACs on one port is normal for an
  uplink.

Useful command variations: `show mac address-table dynamic`,
`... address 0050.7966.6800`, `... interface gi1/0/1`, `... count`.

## Aging and clearing

- **Aging time** defaults to **300 seconds**. An entry that hasn't been heard from in a
  while is removed, so the table doesn't keep holding stale devices.
- An STP topology change (TCN) triggers **accelerated aging** (15 seconds): after the tree
  rebuilds, addresses may end up behind different ports.
- Manually: `clear mac address-table dynamic [interface | vlan]`.
- Table capacity is finite (typically 8,000–16,000 entries). A **MAC flooding** attack
  deliberately overflows it so the switch starts flooding all traffic — the defense is
  port security, covered in the L2 security chapter.

## Store-and-forward and cut-through

| | Store-and-forward | Cut-through |
|---|---|---|
| When forwarding starts | after the entire frame is received | after the first 6 bytes (destination MAC) |
| FCS check | yes, corrupted frames are dropped | no, a corrupted frame passes on |
| Latency | higher, depends on frame size | minimal and constant |
| Where used | almost everywhere, by default | data centers, where microseconds matter |

Cisco Catalyst switches run **store-and-forward** by default — which is why a rising
CRC-error counter on a port means frames are being dropped, not passed along further into
the network.

## Where the frame ends up: walking through an example

```txt
      Gi1/0/1        Gi1/0/2
   PC-A ────┐     ┌──── PC-B
            │     │
          [ SW1 ] ──── Gi1/0/24 ── SW2 ── PC-C
```

1. PC-A sends the first frame to PC-C. The table is empty → SW1 learns PC-A's MAC behind
   Gi1/0/1, doesn't know PC-C's address → **floods** out Gi1/0/2 and Gi1/0/24.
2. PC-C replies. SW1 learns its MAC behind Gi1/0/24 and sends the reply **only** out
   Gi1/0/1.
3. Further exchanges go point-to-point; PC-B no longer sees any of the other side's traffic.

This also explains why, right after a `clear mac address-table`, a traffic analyzer briefly
"sees everything" again: until addresses are relearned, flooding is happening.

## Walking a larger topology: three switches' tables, step by step

```txt
PC-A ── Gi0/1 [ SW1 ] Gi0/24 ═══ Gi0/24 [ SW2 ] Gi0/23 ═══ Gi0/23 [ SW3 ] Gi0/1 ── PC-D
                                    │                          │
                                  Gi0/2                      Gi0/2
                                    │                          │
                                  PC-B                       PC-C
```

All ports are in VLAN 10. All three switches' tables are empty. PC-A sends the first frame
to PC-D.

**Step 1 — the frame arrives at SW1 (Gi0/1).**

| Action | SW1 |
|---|---|
| Learns source | MAC-A → Gi0/1 |
| Looks up destination MAC-D | no entry |
| Decision | flood out the only remaining port — Gi0/24 |

**Step 2 — the flood reaches SW2 via Gi0/24.**

| Action | SW2 |
|---|---|
| Learns source | MAC-A → Gi0/24 |
| Looks up MAC-D | no entry |
| Decision | flood out every port except the incoming one: Gi0/2 (PC-B) and Gi0/23 (toward SW3) |

PC-B on SW2 will also receive this frame — it's not addressed to it, its NIC will drop it
at its own layer, but the frame did travel down the wire. That's the cost of flooding:
someone else's conversation is briefly visible on every port in the VLAN.

**Step 3 — the flood reaches SW3, where PC-D is attached.**

| Action | SW3 |
|---|---|
| Learns source | MAC-A → Gi0/23 |
| Looks up MAC-D | no entry (PC-D hasn't spoken yet) |
| Decision | flood out Gi0/1 (PC-D) and Gi0/2 (PC-C) |

PC-D gets the frame and replies. **The return path isn't flooded anywhere** — after steps
1–3, all three switches already know MAC-A behind the port toward SW1, so the reply frame
from PC-D goes point-to-point: SW3 learns MAC-D → Gi0/1, looks up MAC-A → finds it on
Gi0/23 → sends only there. Same for SW2 and SW1. PC-B and PC-C never see the reply at all —
only the first, flooded frame.

Final tables after one frame exchange:

| Switch | MAC-A (toward PC-A) | MAC-D (toward PC-D) |
|---|---|---|
| SW1 | Gi0/1 | Gi0/24 |
| SW2 | Gi0/24 | Gi0/23 |
| SW3 | Gi0/23 | Gi0/1 |

> [!trap] Trap
> The first frame of a conversation is almost always flooded by at least one switch in the
> chain — that's not a sign of a problem. The question "why did the switch forward the
> frame out every port" is usually looking for "unknown unicast flooding," not "loop" or
> "broadcast storm": telling them apart is simple — one-off flooding stops as soon as the
> destination replies, a storm doesn't.

## Diagnostic: MAC flapping — one address seen behind two ports

**Symptom.** Connectivity keeps dropping for several hosts, the switch log is filling up
with messages, and users complain the network "keeps blinking."

**What to check.** The log and the MAC address table:

```cli
%SW_MATM-4-MACFLAP_NOTIF: Host 0050.7966.6800 in vlan 10 is flapping between
port Gi1/0/3 and port Gi1/0/7

SW1# show mac address-table address 0050.7966.6800
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    DYNAMIC     Gi1/0/7
```

**What it means.** The switch sees the same MAC alternating between two ports and keeps
relearning the entry — hence `MACFLAP_NOTIF`. There are exactly two causes, and both are
worth checking in order:

1. **An L2 loop** with STP not running (someone plugged a patch cord between two access
   ports, or STP is disabled/blocked by a BPDU filter) — frames from one device arrive from
   different directions almost simultaneously. Check with `show spanning-tree vlan 10` — if
   no port is in a blocking state where a loop is suspected, that's your answer.
2. **A duplicated MAC address** — two different devices with the same address (usually
   manually set or cloned from a virtual machine) in the same VLAN. Verify physically:
   `show mac address-table address … detail`, cross-check against inventory, and if needed
   temporarily shut down one port and see whether the flap messages stop.

> [!key] Remember
> MAC flapping is a symptom, not a diagnosis. From there it splits into two: a loop (check
> STP) or a duplicate address (check the device inventory).

## Diagnostic: "silent" unicast flooding with no attack at all

**Symptom.** On a network with no attack and no loops, certain server VLANs consistently
show broadcast-level volumes of traffic on ports with a single server attached — as if the
switch were constantly flooding its address.

**What to check.** Compare two timers that rarely get remembered together:

- the MAC table aging time on the switch — **300 seconds** by default;
- the ARP timeout on the router or L3 switch sending traffic to that server — **4 hours
  (14,400 seconds)** by default on Cisco IOS.

**What it means.** The router keeps sending packets to the server for the full 4 hours,
relying on its own ARP cache, and doesn't need to re-resolve the MAC to do so. Meanwhile
the switch along the path **forgets** the server's MAC after just 5 minutes of idle time
(if the server itself never transmits, only receives). Every such packet forces the switch
to **flood** it across the entire VLAN, because the destination address is no longer in the
table — the source stayed silent. This is asymmetric routing unicast flooding: the cause
isn't an attack but a mismatch between the L3 device's ARP timer and the L2 switch's aging
timer. The CCNA-level fix is understanding the mechanism (it's a common "why is a switch
flooding known unicast traffic" question); in practice, sync up the timers or add a static
entry for critical servers.

## Reading `show mac address-table` further: types and filters

```cli
SW1# show mac address-table vlan 10
          Mac Address Table
-------------------------------------------

Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    DYNAMIC     Gi1/0/1
  10    aabb.cc00.0100    STATIC      Gi1/0/24
  10    0011.2233.4455    STATIC      Gi1/0/5
Total Mac Addresses for this criterion: 3

SW1# show mac address-table count vlan 10
Dynamic Address Count:        1
Secure Address (User-defined) Count: 1
Static  Address (User-defined) Count: 1
Total Mac Addresses In Use:   3
```

In the main table (`show mac address-table`), an entry's Type field really only has two
practical values: `DYNAMIC` — learned by the switch, and `STATIC` — pinned and never ages
out. The entry on `Gi1/0/5` in the example above is exactly that kind: it didn't come from
the `mac address-table static` command, but from **port security in sticky mode**
(`switchport port-security mac-address sticky`) — the switch learned the first MAC it saw
on its own and "stuck" it as static. The difference shows up in `show mac address-table
count`, where a sticky address is counted on its own `Secure Address` line, and in the
dedicated `show port-security address` command, which shows exactly the secure entries and
which port they're bound to — that's a separate topic covered in the L2 security chapter.

| Type | Created by | Survives a reload | Ages out |
|---|---|---|---|
| `DYNAMIC` | the switch itself, from source MAC | no | yes, 300 sec by default |
| `STATIC` (manual) | administrator, `mac address-table static` | yes, if the config is saved | no |
| `STATIC` (sticky) | port security, `switchport port-security mac-address sticky` | yes, if the config is saved | no |

`show mac address-table count` is a quick way to check whether a VLAN is approaching the
table's capacity limit (typically 8,000–16,000 entries per model) before overflow-related
degradation sets in.

## Diagnostic: a MAC flooding attack — telling it apart from ordinary flooding

**Symptom.** All of a sudden, every port in a VLAN starts behaving as if the switch had
turned into a hub: each port sees traffic that isn't its own, and the analyst suspects an
attack.

**What to check.** One-off flooding of an unknown address takes a fraction of a second and
stops right after the destination replies. An attack looks different:

```cli
SW1# show mac address-table count
Dynamic Address Count:        8180
Secure Address (User-defined) Count: 0
Static  Address (User-defined) Count: 12
Total Mac Addresses In Use:   8192
Total Mac Addresses Available: 8192

SW1# show interfaces gi1/0/13 counters
Port         InOctets       InUcastPkts    InMcastPkts   InBcastPkts
Gi1/0/13     812934110293   980234123      1204          890
```

**What it means.** The table is **filled to capacity** (`In Use` = `Available`) — there's
nowhere to add new entries, and the switch can no longer learn new source MACs. Standard
behavior on CAM table overflow is **fail open**: the switch starts flooding *all* unknown
unicast traffic out every port in the VLAN, like a hub, because it has physically nowhere
to remember who sits behind which port. One port (`Gi1/0/13`) is meanwhile pushing an
abnormally high rate of unique source MACs per second — the typical fingerprint of a tool
like `macof`, which generates frames with randomized source addresses specifically to
overflow the table. This isn't fixed at the OSI-model level, but with **port security**
(limiting the number of MACs per port) — covered in more detail in the L2 security chapter;
the important part here is understanding the mechanism itself: the attack turns the
"unknown unicast gets flooded" property into a tool for eavesdropping on someone else's
traffic.

> [!key] Remember
> MAC flooding doesn't break encryption and doesn't spoof destination addresses — it simply
> strips the switch of its ability to know where to send a frame and forces it to act like
> a hub. The fix is limiting the number of MACs per port, not fighting the symptom at the
> VLAN level.

## Diagnostic: frames disappear, but the flood never propagates further

**Symptom.** On one link, `input errors` and `CRC` counters climb (see the `show
interfaces` counters in the OSI models chapter), but the corrupted frames don't spread
across the rest of the network.

**What to check.** The switching mode:

```cli
SW1# show interfaces gi1/0/3 | include duplex|Members in this criterion
SW1# show running-config interface gi1/0/3 | include duplex|speed
```

**What it means.** The port is running **store-and-forward** (the default mode on Cisco
Catalyst switches, which don't support switching to cut-through) — the entire frame is
received first, the checksum (FCS) is verified **before** forwarding, and a corrupted frame
is simply dropped without reaching any other port. That's exactly the distinction from
cut-through tested by "which method verifies the FCS before forwarding": the answer is
store-and-forward, and that's precisely why a problem on one link (a bad cable, a duplex
mismatch) doesn't turn into a problem for the whole VLAN — it's absorbed at the point of
entry.

## A static entry as a cure for unnecessary flooding

For a server that stays quiet for long stretches and so regularly "drops out" of the table
(see the asymmetric routing diagnostic above), you can enter its MAC manually — that entry
will never age out:

```cfg
SW1(config)# mac address-table static 0050.7966.6800 vlan 10 interface gi1/0/1
```

```cli
SW1# show mac address-table static
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    STATIC      Gi1/0/1
```

Worth remembering the cost: a static entry doesn't adapt if the device is physically moved
to another port — until it's manually corrected, traffic to it goes to the wrong place
instead of simply being flooded. That's a trade-off, not a free improvement, which is why
static entries are used selectively, for critical, stably connected nodes — not for an
entire VLAN.

## One port, different VLANs: how the table reads on a trunk

A trunk port carries several VLANs, and the table correctly shows the same physical port
under multiple entries:

```cli
SW1# show mac address-table interface gi1/0/24
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    DYNAMIC     Gi1/0/24
  20    0050.7966.6800    DYNAMIC     Gi1/0/24
  99    aabb.cc00.0110    DYNAMIC     Gi1/0/24
```

This isn't an error or a duplicate: **the VLAN is part of the entry's key**, not the MAC
address alone. The same physical server, with an interface sliced into subinterfaces for
VLAN 10 and 20 (or several different virtual machines with different MACs in different
VLANs behind one uplink), can legitimately fill one port with several table rows — one per
VLAN. The question "why does the same port appear multiple times in the MAC table" is
almost always about this, not a malfunction.

## What gets asked

- "How does a switch build its MAC address table?" — from the source MAC of incoming
  frames.
- "What does a switch do with a frame whose destination MAC is unknown?" — floods it out
  every port in the VLAN except the incoming one.
- "Refer to the exhibit… which port will the frame be forwarded to?" — find the destination
  MAC in the correct VLAN's table; no entry → every port in the VLAN.
- "What is the default aging time?" — 300 seconds.
- "Which switching method checks the FCS before forwarding?" — store-and-forward.
- Problems showing several MACs on one port — that means another switch is attached there,
  and it's not an error.
- "A switch is flooding known traffic that should be forwarded to a single port. What is
  the most likely cause?" — the MAC entry aged out (the source stayed silent longer than
  the aging time), so traffic to it is temporarily flooded again until the address is
  relearned.
- "Log shows a MAC address flapping between two ports. What are two possible causes?" — a
  Layer 2 loop with no active STP on that segment, or a duplicated MAC address on two
  devices.
- "Which type of MAC address table entry survives a reload?" — `STATIC`, including port
  security sticky entries, if the configuration was saved; ordinary `DYNAMIC` entries do
  not.
- "What is the effect of unknown unicast flooding on hosts that are not the destination?"
  — they receive and drop the frame at the NIC level; the network doesn't break, but there
  is extra traffic on the segment.
- "Which command displays the number of MAC addresses learned on a switch, grouped by
  type?" — `show mac address-table count`.
- "What happens when the MAC address table reaches its maximum size?" — the switch can no
  longer learn new addresses and starts flooding unknown unicast traffic as though it had
  no table at all (fail open) — which is exactly what a MAC flooding attack exploits.
- "Two switches are directly connected by a single link that is also connected through a
  third switch, forming a loop, and STP is disabled on the segment. What symptom appears
  in the MAC address table?" — constant MACFLAP between two ports for the same addresses,
  because frames from one device arrive from different directions.
- "An administrator manually adds a MAC address to the switch. What is a drawback of this
  approach compared to dynamic learning?" — the entry won't update itself if the device
  moves to another port: traffic goes to the wrong place until it's manually corrected.

> [!trap] Trap
> "The switch is flooding — there must be an attack somewhere" isn't always true. Flooding
> a single unknown frame, or an occasional refloods after aging, is normal L2 behavior;
> systematic, unrelenting flooding of a large volume of traffic is when it's worth
> investigating a MAC flooding attack or asymmetric routing.

## Summary: five reasons a switch floods a frame

The exam keeps circling back to the same situation — "why did the frame go out every port"
— with different underlying causes. Keep them in one place so you don't have to guess:

| Reason | How to tell |
|---|---|
| Unknown unicast (address not yet learned) | first frame of a conversation, stops right after the reply |
| Broadcast (ARP, DHCP Discover) | destination MAC is `FF:FF:FF:FF:FF:FF`, normal |
| Multicast with no IGMP snooping | destination MAC starts with `01:00:5E`, repeats constantly |
| Entry aged out | receiver was quiet for a while, one-off flood, until the next reply |
| MAC table full (attack) | `Total In Use` right at the `Available` limit, systematic and massive flooding, one port sending an abnormal number of unique source MACs |

Only the last row is cause for alarm; the first four are normal switch behavior — and on
the exam, telling them apart is the whole point of the question.

## Check yourself

```check
?? Which field of a frame does a switch use to populate the MAC address table?
!! The source MAC of the incoming frame.
?? A frame arrives on Gi1/0/1, and the destination MAC is listed as being on Gi1/0/1. What does the switch do?
!! Drops the frame (filter) — there's no point sending it back out the same port it came in on.
?? By default, how long does a dynamic entry live without being refreshed?
!! 300 seconds; after an STP topology change the timer is temporarily reduced to 15 seconds.
?? An uplink port shows 40 different MACs. Is that a problem?
!! No: another switch (or a hypervisor) is attached to that port, and all the addresses behind it are visible through the one port.
?? How is cut-through faster than store-and-forward, and what's the trade-off?
!! It starts forwarding after reading just the destination address, but doesn't check the FCS — corrupted frames pass on.
?? A switch sends traffic to a frequent destination point-to-point, then suddenly starts flooding it across the whole VLAN, even though the device never moved. What happened?
!! The destination hadn't transmitted anything itself (only received) for longer than 300 seconds, its MAC entry aged out and was removed — the switch no longer knows the port and floods until the address is relearned from a reply.
?? A MACFLAP_NOTIF message appears in the log for one address between two ports. What are the two causes checked, in order?
!! First an L2 loop with no active STP on that segment (show spanning-tree), then a duplicated MAC address on two different devices.
?? PC-A contacts PC-D for the first time across three switches. PC-B and PC-C sit on the intermediate switches in the same VLAN. Which of them see the first frame?
!! Both — the frame is flooded at every switch in the chain until PC-D's address is learned; their NICs receive and drop the frame as not addressed to them, but it does travel down the wire.
?? show mac address-table shows two STATIC entries: one created manually, the other by port security sticky. How do they differ in origin?
!! The first was created by an administrator with the mac address-table static command; the second appeared automatically from port security and "stuck" to the MAC first seen on that port (sticky entry details show up in show port-security address) — both are permanent and survive a reload if the configuration is saved.
?? show mac address-table count shows Total In Use right up against Available, and one port is sending an abnormal number of unique source MACs per second. What's happening?
!! Looks like a MAC flooding attack (e.g., macof): the table is being deliberately overflowed, the switch goes into fail open, and starts flooding all unicast traffic like a hub.
?? The same physical trunk port appears in show mac address-table under three different rows with three different VLANs. Is that an error?
!! No: the VLAN is part of the table entry's key, not the MAC address itself; a trunk port or a server with VLAN subinterfaces legitimately produces one row per VLAN.
?? What's the cost of a manually configured static MAC entry for a server?
!! It doesn't adapt if the device moves to a different physical port — traffic goes to the wrong place instead of being reflooded, until it's manually corrected.
```
