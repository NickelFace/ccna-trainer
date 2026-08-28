---
title: Inter-VLAN Routing
lead: Router-on-a-stick with subinterfaces, an SVI on an L3 switch, and a routed port — three ways to connect VLANs, and how to tell which one you need.
---

## Three Approaches, and When to Use Each

| Approach | What it looks like | When it's chosen |
|---|---|---|
| A dedicated physical port per VLAN | one cable from the router per VLAN | almost never: you run out of ports by the third VLAN |
| **Router-on-a-stick** | one trunk to the router, subinterfaces | few VLANs, a router is already in place, traffic is light |
| **SVI on an L3 switch** | `interface vlan N` right on the switch | a normal campus setup: routing at port speed |

A **routed port** deserves separate mention — an L3 switch port pulled out of switching
with `no switchport`: it behaves like a router interface and is used for links between
Layer 3 devices, not for user VLANs.

## Router-on-a-Stick

```cfg
! On the switch — an ordinary trunk
interface GigabitEthernet0/1
 switchport mode trunk
 switchport trunk allowed vlan 10,20

! On the router — subinterfaces, one per VLAN
interface GigabitEthernet0/0
 no shutdown                      ! the physical interface must be up
!
interface GigabitEthernet0/0.10
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
!
interface GigabitEthernet0/0.20
 encapsulation dot1Q 20
 ip address 192.168.20.1 255.255.255.0
```

What breaks most often here:

1. **Forgetting `no shutdown` on the physical interface** — the subinterfaces won't come
   up.
2. **The subinterface number ≠ the VLAN number** — it still works, but it's confusing;
   what actually assigns the VLAN is `encapsulation dot1Q`, not the digit after the dot.
3. **The native VLAN** needs special syntax: `encapsulation dot1Q 99 native`, or the
   router won't accept untagged traffic.
4. The subinterface's address must be the **default gateway** for hosts in that VLAN.

The design's limitation is obvious: all inter-VLAN traffic crosses the same physical link
twice (up and back down). That's the bottleneck exam questions point at.

## SVI on an L3 Switch

```cfg
Switch(config)# ip routing                 ! without this the switch won't route
Switch(config)# interface vlan 10
Switch(config-if)# ip address 192.168.10.1 255.255.255.0
Switch(config-if)# no shutdown
Switch(config)# interface vlan 20
Switch(config-if)# ip address 192.168.20.1 255.255.255.0
Switch(config-if)# no shutdown
```

**`ip routing` is the command that gets forgotten in half of these scenarios.** Without
it, the SVIs come up, the addresses respond to pings, but no traffic passes between
VLANs, and the routing table shows nothing beyond connected routes.

Conditions for an SVI to reach up/up:

- the VLAN exists and isn't shut down;
- that VLAN has **at least one active port** (an access port that's up, or a trunk
  carrying it);
- the `interface vlan` itself isn't shut down.

Hence the typical question: "the SVI shows down/down even though an address is
configured" — almost always because there's no active port in the VLAN, or the VLAN
doesn't exist.

```cli
SW1# show ip route
      192.168.10.0/24 is directly connected, Vlan10
      192.168.20.0/24 is directly connected, Vlan20
SW1# show ip interface brief | include Vlan
Vlan10   192.168.10.1    YES manual up      up
Vlan20   192.168.20.1    YES manual up      up
```

## Routed Port

```cfg
interface GigabitEthernet1/0/24
 no switchport
 ip address 10.0.0.1 255.255.255.252
```

The port stops being part of any VLAN and gets its own IP address. This is how an L3
switch connects to a router or another L3 switch: no VLAN, no STP, pure Layer 3.

## Verifying Connectivity and Typical Troubleshooting

The order exam troubleshooting questions expect:

1. The host pings **its own gateway** (the SVI/subinterface address). If it fails, the
   problem is in the VLAN, the port, or the host's addressing.
2. The host pings **another VLAN's gateway**. If it fails, routing isn't enabled
   (`ip routing`) or an interface is down.
3. The host pings **a host in another VLAN**. If this step fails but the previous ones
   passed, check firewall/ACL on the routing device and the default gateway on the remote
   host.

| Symptom | Cause |
|---|---|
| Can't ping own gateway | port in the wrong VLAN, wrong mask/address, SVI shut down |
| Own gateway pings fine, other VLAN's doesn't | no `ip routing` (or the router's physical interface isn't up) |
| Gateways ping fine, hosts don't | the remote host's default gateway isn't configured, or an ACL |
| Everything works, just slowly | router-on-a-stick has hit the bandwidth ceiling of one link |

## Walkthrough: Step-by-Step Diagnosis Using the Ping Ladder

Topology: switch SW1 (L2) with VLAN 10 and VLAN 20, a trunk to router R1, with
subinterfaces `Gi0/0.10` and `Gi0/0.20` on R1. Host A in VLAN 10 (`192.168.10.50`)
can't reach host B in VLAN 20 (`192.168.20.50`).

**Step 1 — host A pings its own gateway, `192.168.10.1`.**

```cli
A> ping 192.168.10.1
Reply from 192.168.10.1: bytes=32 time=1ms
```

Success — host A's address, mask, and gateway are correct, its port is in the right
VLAN, and subinterface `Gi0/0.10` is up. If this step had failed, the cause would have to
be **inside** VLAN 10: host A's addressing, the port's state, or whether the VLAN even
reaches the trunk.

**Step 2 — host A pings the other VLAN's gateway, `192.168.20.1`.**

```cli
A> ping 192.168.20.1
Request timed out.
```

Fails — and it should have succeeded regardless of any connectivity to host B at all: the
other VLAN's gateway is just an address sitting on the trunk, physically reachable from
anywhere the trunk carries both VLANs. Since it doesn't respond, the problem isn't host B
or all of VLAN 20 — it's the routing between VLAN 10 and 20 on R1 itself, so you move
straight to its configuration rather than continuing down the ladder.

```cli
R1# show ip interface brief | include GigabitEthernet0/0
GigabitEthernet0/0        unassigned      YES unset  up      up
GigabitEthernet0/0.10     192.168.10.1    YES manual up      up
GigabitEthernet0/0.20     192.168.20.1    YES manual up      up
```

Both subinterfaces are `up/up` — so it's not a forgotten `no shutdown`. The next most
common cause at this point is **encapsulation**: if `Gi0/0.20` is mistakenly configured
with `encapsulation dot1Q 2` instead of `encapsulation dot1Q 20`, the subinterface comes
up and answers pings to its own address locally, but frames from VLAN 20 on the trunk
never reach it — the mismatch is only visible by comparing the running-config line by
line, not from `show ip interface brief`.

> [!key] Remember
> The ping ladder works precisely because each step tests exactly one additional
> component. Step 2 failing means step 1 already confirmed all of VLAN 10 is healthy, so
> the search stays inside inter-VLAN routing — there's no reason to go back and re-check
> host A's addressing.

## Troubleshooting: Some Inter-VLAN Traffic Doesn't Route on a Trunk With a Changed Native VLAN

**Symptom.** Router-on-a-stick works for every VLAN except one — usually the one assigned
as the trunk's native VLAN; hosts in that VLAN can't reach any of the others.

**What to check.** The subinterface configuration handling the native VLAN:

```cli
R1# show running-config interface gi0/0.99
interface GigabitEthernet0/0.99
 encapsulation dot1Q 99
 ip address 192.168.99.1 255.255.255.0
```

**What we found.** The `native` keyword is missing from the end of the `encapsulation`
line. Frames in this VLAN arrive on the trunk **untagged** (that's the definition of the
native VLAN — see the trunking chapter), but a subinterface without an explicit `native`
expects frames **tagged** with dot1Q 99 and drops untagged ones as unrecognized. The
correct line:

```cfg
interface GigabitEthernet0/0.99
 encapsulation dot1Q 99 native
```

Without that keyword, the native VLAN will always be the odd one out in a
router-on-a-stick setup — the other, tagged VLANs work fine, which creates the
misleading picture of "everything's broken, but only for one VLAN."

## What Gets Asked

- "Which command is required for a Layer 3 switch to route between VLANs?" —
  `ip routing`.
- "Which configuration creates inter-VLAN routing over a single link?" — subinterfaces
  with `encapsulation dot1Q`.
- "An SVI is down/down. Why?" — no active port in the VLAN, or the VLAN doesn't exist.
- "What is the purpose of the no switchport command?" — turn the port into a routed
  port.
- "Refer to the exhibit… hosts in VLAN 10 cannot reach VLAN 20" — check for missing
  `ip routing`, a wrong `encapsulation`, a trunk not carrying the needed VLAN, or a wrong
  gateway on the host.
- "A host can ping its own gateway but not the gateway of another VLAN on the same
  router-on-a-stick. What should be checked first?" — not the host's addressing (already
  confirmed by step 1), but the router's subinterface configuration: encapsulation, IP
  address, up/up state.
- "Inter-VLAN routing works for every VLAN except the one carried untagged on the trunk.
  What is missing?" — the `native` keyword at the end of
  `encapsulation dot1Q <vlan> native` on the matching subinterface.
- "Why is testing the gateway of the remote VLAN a more precise diagnostic step than
  testing the remote host directly?" — the remote VLAN's gateway responds independently
  of the remote host's state, so failure at that exact step points to the routing itself,
  not to host B or its configuration.

## Check Yourself

```check
?? What actually determines a subinterface's VLAN — its number or a command?
!! The encapsulation dot1Q command; the subinterface number is just a convenient label.
?? An SVI has an address configured, but it's down/down. What do you check?
!! Whether the VLAN exists, isn't shut down, and has at least one active port or trunk.
?? A host can ping its own gateway but not a neighboring VLAN's gateway on the same switch. What's missing?
!! The ip routing command — the switch isn't routing between its own SVIs.
?? How does a routed port differ from an SVI?
!! A routed port is a physical port pulled out of switching with its own IP; an SVI is a virtual interface for an entire VLAN.
?? Why does router-on-a-stick scale poorly?
!! All inter-VLAN traffic crosses the same physical link twice — that link becomes the bottleneck.
?? Host A pings its own gateway successfully, but not the neighboring VLAN's gateway. What can you already conclude about host A's VLAN?
!! It's fully healthy: host A's addressing, port, and subinterface were all confirmed by the first step; keep looking only in inter-VLAN routing, not back at host A.
?? Router-on-a-stick routes every VLAN except the native one. What's missing from that subinterface's configuration?
!! The native keyword at the end of encapsulation dot1Q <vlan> native — without it, the subinterface expects tagged frames and drops the native VLAN's untagged traffic.
?? Encapsulation on subinterface Gi0/0.20 is mistakenly set to dot1Q 2 instead of dot1Q 20. How does this look in show ip interface brief?
!! The subinterface shows up/up and answers pings to its own address — the error is invisible in that command; you need to compare the running-config line by line against the actual VLAN number on the trunk.
```
