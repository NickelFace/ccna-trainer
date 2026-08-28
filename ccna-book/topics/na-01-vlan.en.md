---
title: VLANs and Access Ports
lead: Why split a switch into logical networks, how an access port differs from a voice port, what VLAN 1 is, and why it gets a bad reputation.
---

## What a VLAN Does

A VLAN turns one physical switch into several logical ones. Ports assigned to
different VLANs **cannot see each other at Layer 2**, even sitting in the same box:
a broadcast from VLAN 10 never reaches VLAN 20, ARP never resolves, and communication
without a router is impossible.

What this buys you:

- **Segmentation without new hardware** — accounting and guests on the same switch, but
  in different networks.
- **Smaller broadcast domains** — less unnecessary traffic hitting every host.
- **Security and policy** — inter-VLAN traffic must pass through a Layer 3 device, where
  an ACL can be applied to it.
- **Flexibility** — moving an employee to a different office doesn't require re-running
  cables, just changing the VLAN on a port.

Each VLAN usually maps to **its own IP subnet**. This isn't a standards requirement, it's
a design convention — and it's the assumption behind every exam question like "VLAN 10 is
192.168.10.0/24, VLAN 20 is 192.168.20.0/24."

## VLAN Number Ranges

| Range | Name | Stored in |
|---|---|---|
| 1 | default VLAN | vlan.dat |
| 2–1001 | normal range | vlan.dat |
| 1002–1005 | reserved (Token Ring, FDDI) | vlan.dat |
| 1006–4094 | extended range | running-config |

**VLAN 1** is special: every port belongs to it by default, control-plane protocols
(CDP, VTP, DTP, PAgP) run over it, and it can't be deleted. That's exactly why the
recommendation is to **avoid using VLAN 1 for user data** and to move management traffic
to a dedicated VLAN instead.

## Configuring an Access Port

```cfg
Switch(config)# vlan 10
Switch(config-vlan)# name SALES
Switch(config-vlan)# exit
Switch(config)# interface range gigabitethernet0/1 - 8
Switch(config-if-range)# switchport mode access
Switch(config-if-range)# switchport access vlan 10
```

These two lines do different things, and exams like to test that distinction:

- `switchport mode access` — "this port is always access, no trunk negotiation." Without
  it, the port stays in `dynamic auto/desirable` and can unexpectedly become a trunk.
- `switchport access vlan 10` — which VLAN the port belongs to.

> [!trap] Trap
> If you assign `switchport access vlan 30` to a port but VLAN 30 doesn't exist on the
> switch, IOS auto-creates it on newer versions, or leaves the port in an `inactive`
> state — either way, traffic won't flow. The first thing to check for "port is in the
> right VLAN but not working" is whether the VLAN itself exists and isn't shut down
> (`shutdown` in VLAN configuration mode).

## Voice VLAN

An IP phone is normally plugged into the switch port, and the PC plugs into the phone.
One physical port carries two streams: PC data and phone voice.

```cfg
interface GigabitEthernet0/5
 switchport mode access
 switchport access vlan 10        ! PC data — untagged
 switchport voice vlan 20         ! voice — tagged, phone learns the number via CDP/LLDP-MED
 spanning-tree portfast
 mls qos trust cos                ! trust the phone's marking
```

Key fact: **voice traffic arrives tagged with 802.1Q, user traffic arrives untagged**,
even though the port is formally still an access port. The phone learns the voice VLAN
number from the switch via CDP or LLDP-MED. This is also why the port needs PoE, and why
`portfast` makes sense here — only end devices sit behind this port.

## Checking What's Where

```cli
SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi1/0/9, Gi1/0/10
10   SALES                            active    Gi1/0/1, Gi1/0/2, Gi1/0/3
20   VOICE                            active
99   MGMT                             active

SW1# show interfaces gigabitethernet1/0/1 switchport
Name: Gi1/0/1
Switchport: Enabled
Administrative Mode: static access
Operational Mode: static access
Access Mode VLAN: 10 (SALES)
Voice VLAN: 20
```

What **doesn't** show up in `show vlan brief` — trunk ports: they don't belong to a
single VLAN, so they're left out of the port listing. A missing uplink in this output
doesn't mean something's broken.

## The Switch's Management Interface

A Layer 2 switch has no IP address on its ports by itself; to reach it for management,
you create an **SVI** — a virtual VLAN interface:

```cfg
interface vlan 99
 ip address 10.0.99.10 255.255.255.0
 no shutdown
!
ip default-gateway 10.0.99.1
```

The requirements behind most exam questions here: VLAN 99 must exist and be active, the
switch needs at least one active port in that VLAN (or a trunk carrying it), and it needs
an `ip default-gateway` (for an L2 switch) — otherwise management is only reachable from
within its own subnet.

## Common Faults

| Symptom | Cause |
|---|---|
| PC doesn't get a DHCP address | port is in the wrong VLAN; VLAN doesn't exist or is shut down |
| Two PCs in the same VLAN on different switches can't see each other | VLAN isn't allowed on the trunk between switches |
| Port "flips" between access and trunk | `switchport mode access` isn't set, DTP is negotiating |
| Phone works, PC behind it doesn't | data VLAN isn't configured on the port |
| SVI won't come up | no active port in that VLAN, or the VLAN is shut down |

## Troubleshooting: PC Doesn't Get a DHCP Address After Moving to a New Office

**Symptom.** A computer was moved to a different office and plugged into a different port
on the same switch. It doesn't receive an IP via DHCP, and `ipconfig` shows `169.254.x.x`.

**What to check.** Whether the VLAN the port belongs to even exists:

```cli
SW1# show interfaces gi1/0/15 switchport | include Access Mode VLAN
Access Mode VLAN: 30 (Inactive)

SW1# show vlan brief | include 30
30   VLAN0030                         act/lshut Gi1/0/15
```

**What we found.** The port is formally assigned to VLAN 30, but the VLAN itself is in
`act/lshut` state — administratively shut down (`shutdown` in VLAN configuration mode).
A port in an inactive VLAN passes no traffic at all, even though the interface itself may
show `up/up`, and the `switchport access vlan 30` command was accepted without a single
error — a nonexistent or disabled VLAN doesn't stop you from *assigning* a port to it, it
only stops **traffic from passing through it**. That's the key difference from a typo in
the VLAN number: there, the port simply ends up in the wrong segment; here, it's in the
right segment but not working. Fix it with `no shutdown` in VLAN mode, not on the
interface:

```cfg
vlan 30
 no shutdown
```

> [!trap] Trap
> `shutdown`/`no shutdown` for a VLAN is a separate command issued in `vlan 30` mode — it
> is not the same as `shutdown` on a specific interface. A disabled VLAN kills traffic for
> **every** port assigned to it, all at once.

## Troubleshooting: Phone Voice Crackles Even Though PC Data Behind It Is Fast

**Symptom.** An IP phone and the PC connected through it sit on the same port with a voice
VLAN configured; internet and file transfers on the PC work fine, but calls regularly lose
quality under even light network load.

**What to check.** Whether the switch trusts the priority marking the phone itself applies:

```cli
SW1# show mls qos interface gi1/0/5 | include Trust state
Trust state: not trusted
```

**What we found.** The port doesn't trust the CoS markings on incoming traffic (`Trust
state: not trusted`) — meaning that even though the IP phone faithfully marks its voice
frames with a high priority (CoS 5), the switch **ignores** that marking and treats voice
and user traffic identically. Under normal load the difference isn't visible, but as soon
as the link starts competing for bandwidth (heavy load from the PC on the same port),
voice quality suffers right along with regular data — despite this being a voice VLAN on
paper. The fix is to explicitly trust the marking on the port:

```cfg
interface GigabitEthernet1/0/5
 mls qos trust cos
```

This is the exact line that was already in the configuration example above — the point
of this scenario is that one forgotten command completely erases the benefit of splitting
data and voice into separate VLANs, if nothing further down the chain is prioritizing
queues (a topic for later QoS chapters).

## Walkthrough: Full Cycle from Creating a VLAN to Verifying Connectivity

Scenario: two switches connected by a trunk, and you need to stand up a new VLAN 40 for a
warehouse with two PCs on different switches.

**Step 1 — create the VLAN on both switches** (or at least on the one closer to the VLAN
database server, if VTP synchronization is in use):

```cfg
SW1(config)# vlan 40
SW1(config-vlan)# name WAREHOUSE
SW2(config)# vlan 40
SW2(config-vlan)# name WAREHOUSE
```

**Step 2 — assign ports to the VLAN on each switch:**

```cfg
SW1(config)# interface gi1/0/10
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 40

SW2(config)# interface gi1/0/12
SW2(config-if)# switchport mode access
SW2(config-if)# switchport access vlan 40
```

**Step 3 — allow VLAN 40 on the trunk between the switches** (the skipped step — the most
common reason for "VLAN is configured on both ends, but the PCs still can't see each
other"):

```cfg
SW1(config)# interface gi1/0/24
SW1(config-if)# switchport trunk allowed vlan add 40
```

**Step 4 — verify** that the VLAN is active on both switches and present in the trunk's
allowed list:

```cli
SW1# show vlan brief | include 40
40   WAREHOUSE                        active    Gi1/0/10

SW1# show interfaces trunk | include Gi1/0/24
Gi1/0/24    10,20,40,99
```

If VLAN 40 doesn't show up in the trunk's allowed list at step 4, traffic physically never
reaches the other switch, even though the VLAN exists and is active on both ends — the
allowed VLAN list is checked independently of whether the VLAN itself exists.

## What Gets Asked

- "What is the effect of configuring switchport mode access?" — the port stops
  negotiating trunk status and always operates in access mode.
- "Which VLAN is untagged on an access port with a voice VLAN?" — the data VLAN; voice
  is tagged.
- "Why should VLAN 1 not be used for user data?" — control-plane protocols run over it,
  it's enabled everywhere by default, and it's an exposed target.
- "Refer to the exhibit… why can hosts in VLAN 10 not communicate with VLAN 20?" — you
  need Layer 3: a router or an SVI on an L3 switch.
- "Which command shows the VLAN assigned to a port?" — `show interfaces … switchport` or
  `show vlan brief`.
- "A port is correctly assigned to a VLAN, but no traffic passes through it. The interface
  shows up/up. What should be checked?" — the state of the VLAN itself (`show vlan brief`)
  — it may be administratively shut down (`act/lshut`) via a separate `shutdown` command
  in VLAN mode.
- "Voice quality degrades under load even though a voice VLAN is configured. What is
  likely missing?" — `mls qos trust cos` on the port: without trusting the phone's
  marking, the switch can't tell voice traffic from ordinary data.
- "A new VLAN is created and active on both switches, but hosts still cannot communicate
  across the trunk. What is the last thing to check?" — whether that VLAN is allowed in
  the `allowed vlan` list on the trunk between the switches.

## Check Yourself

```check
?? Two PCs are in different VLANs on the same switch. What do they need to communicate?
!! Inter-VLAN routing: a router (router-on-a-stick) or an SVI on an L3 switch.
?? A port is configured as access in VLAN 30, but no traffic passes. What do you check first?
!! Whether VLAN 30 exists on the switch and isn't in a shutdown state.
?? How does a phone learn its voice VLAN number?
!! From the switch, via CDP or LLDP-MED.
?? Why doesn't a trunk port show up in show vlan brief?
!! It doesn't belong to a single VLAN — that output only lists access ports.
?? What does a management SVI on an L2 switch need to come up and be reachable from another subnet?
!! An existing active VLAN with an active port/trunk, an address on interface vlan, and ip default-gateway.
?? A port is assigned to VLAN 30 without errors, the interface is up/up, but no traffic passes. show vlan brief shows VLAN 30 as act/lshut. What does that mean?
!! The VLAN is administratively shut down via the shutdown command in vlan 30 mode — a setting separate from the interface, and it kills traffic for every port in that VLAN at once; fixed with no shutdown in the same mode.
?? A phone and PC share a port with a voice VLAN, but calls start crackling under load. The port doesn't trust CoS markings. How are these related?
!! Without mls qos trust cos, the switch ignores the priority the phone itself marks and treats voice the same as ordinary data — a voice VLAN alone doesn't guarantee priority.
?? VLAN 40 is created and active on both switches, ports are assigned correctly, but PCs on different switches still can't reach each other. The trunk is physically up. What was forgotten?
!! Add VLAN 40 to the allowed vlan list on the trunk between the switches — the allowed VLAN list is checked independently of whether the VLAN itself exists.
```
