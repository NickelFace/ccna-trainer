---
title: How the Forwarding Decision Gets Made
lead: Longest prefix match by example, equal-cost load balancing, recursive next-hop lookup, and why a route can still fail to work.
---

## The one rule

The router does not pick a route by the order of lines in the configuration, and not by
which one arrived first. It picks by the length of the matching prefix — "more specific
wins."

Example table:

```cli
S     0.0.0.0/0        via 203.0.113.1
D     10.0.0.0/8       via 10.1.1.2
O     10.1.0.0/16      via 10.1.1.6
S     10.1.5.0/24      via 10.1.1.10
S     10.1.5.64/26     via 10.1.1.14
```

Where the packets go:

| Destination | Route chosen | Why |
|---|---|---|
| 10.1.5.70 | `10.1.5.64/26` | longest matching prefix |
| 10.1.5.200 | `10.1.5.0/24` | doesn't fall in the /26 (that range is only .64–.127) |
| 10.1.9.4 | `10.1.0.0/16` | didn't fall in any /24 |
| 10.9.0.1 | `10.0.0.0/8` | only the /8 matched |
| 8.8.8.8 | `0.0.0.0/0` | nothing specific matched |

> [!key] Remember
> Administrative distance and metric are compared **only among routes with the same
> prefix**. The most specific line is picked first, and only afterward — among several
> such lines — the best one by AD and metric.

## How to check yourself quickly

Take the destination and work out whether it falls inside each line's range:

`10.1.5.70` against the line `10.1.5.64/26`: magic number 64, block 64–127 → **falls
inside**. `10.1.5.200` against the same line: 200 > 127 → **doesn't fall inside**, drop
down to the /24.

This is exactly the subnetting arithmetic from the first chapter on the subject — that's
the whole difficulty behind "which route will the router pick" questions.

## Equal-cost load balancing

If two routes to the same network have **the same prefix, the same AD, and the same
metric**, the router uses both (up to 4 paths by default; the maximum depends on the
platform):

```cli
R1# show ip route 192.168.9.0
Routing entry for 192.168.9.0/24
  Known via "ospf 1", distance 110, metric 20
  Routing Descriptor Blocks:
  * 10.0.0.2, from 10.0.0.2, via GigabitEthernet0/1
      10.0.0.6, from 10.0.0.6, via GigabitEthernet0/2
```

Load balancing with CEF happens **per flow** (per-destination) — the same flow
consistently travels a single path, while different flows get spread out. Per-packet
balancing exists too, but it causes packet reordering and is almost never used.

EIGRP can also do **unequal-cost** load balancing via `variance` — the only IGP with
this capability; this comes up as a distinguishing fact about EIGRP.

## Recursive next-hop lookup

A static route can be configured three ways:

```cfg
ip route 192.168.5.0 255.255.255.0 10.1.1.2                     ! next hop only
ip route 192.168.5.0 255.255.255.0 GigabitEthernet0/1           ! interface only
ip route 192.168.5.0 255.255.255.0 GigabitEthernet0/1 10.1.1.2  ! both
```

When configured with a next hop, the router must **recursively** figure out how to reach
`10.1.1.2` itself — meaning the table must also have a route to it. If it doesn't, the
route won't install at all (`%Route not installed`). This is why "I configured a route
and it isn't in the table."

Configuring with only an interface on multipoint networks (Ethernet) works poorly: the
router will send an ARP request for every destination address (proxy ARP), which is slow
and not obvious to troubleshoot. That's why on Ethernet links it's recommended to
specify **both the interface and the next hop**.

## What happens to the frame during forwarding

This was already covered in the encapsulation chapter, but here it explains typical
mistakes:

1. The router strips the L2 header.
2. It looks up a route by destination IP.
3. It decrements the TTL and recalculates the checksum.
4. It builds a **new** L2 header: source MAC — its own outgoing interface, destination
   MAC — the next hop (learned via ARP).
5. It sends the frame.

If ARP for the next hop doesn't resolve (the neighbor is unreachable), the route is in
the table but traffic doesn't flow. `show ip arp` is the next place to look after
`show ip route`.

## Fast forwarding

- **Process switching** — the CPU handles every packet. Slow; comes up as the "worst
  case" option.
- **Fast switching** — the first packet goes through the CPU, the rest use the cache.
- **CEF** (Cisco Express Forwarding) — a pre-built FIB and adjacency table; enabled by
  default, runs at line rate.

```cli
R1# show ip cef 192.168.5.10
192.168.5.0/24
  nexthop 10.1.1.2 GigabitEthernet0/1
```

## Working through two-level recursion

Recursive lookup doesn't always resolve in one step — sometimes the next hop itself is
reachable only through another next hop.

```cli
S    203.0.113.0/24  via 198.51.100.2
S    198.51.100.0/30 via 10.1.1.2
C    10.1.1.0/30     is directly connected, GigabitEthernet0/1
```

To install the first route (`203.0.113.0/24 via 198.51.100.2`), the router has to
resolve how to reach `198.51.100.2`. There's no direct connection to that network — but
there's a second static route, `198.51.100.0/30 via 10.1.1.2`. So we resolve that one
next: `10.1.1.2` falls inside `10.1.1.0/30`, which is **directly connected** — that's
where the recursion ends. The final path for a packet to `203.0.113.5` is out `Gi0/1`,
ARP for `10.1.1.2`. Remove the middle line (`198.51.100.0/30`), and the first route has
no way left to resolve its next hop — it **disappears from the table entirely**, the
same symptom as "I configured the route and it isn't there," just two recursion steps
away instead of one, which makes it harder to track down in practice.

## Troubleshooting: the router's CPU suddenly hits 100%

**Symptom.** Link bandwidth isn't fully utilized, but the router's CPU stays pegged, and
`show interfaces` shows drops on the outgoing ports.

**What to check.** Which forwarding path is actually being used:

```cli
R1# show cef state
CEF Status: RP instance state: enabled
IPv4 CEF Status: enabled

R1# show interfaces gi0/1 | include queue
  Input queue: 0/75/1234/0 (size/max/drops/flushes)
  Output queue: 0/40/0/0 (size/max/drops/flushes)
```

**What we found.** A growing `flushes`/`drops` counter in the input queue with CEF
enabled usually means some traffic **isn't being forwarded via CEF** and is dropping
down to the slow path — process switching. Typical causes: ACL logging enabled (`log`
forces the CPU to inspect every matching packet), certain NAT/QoS features, tunnels with
fragmentation, or simply `ip cef` mistakenly disabled on an interface. Exam takeaway —
the three-tier forwarding hierarchy isn't an abstraction: **process switching explains
real CPU overload on traffic that should normally ride the hardware-accelerated CEF
path**.

> [!trap] Trap
> "The route in the table is correct, so forwarding must be fine" — not necessarily:
> even a correct route can be forwarded via a slow path if a specific packet or an
> interface feature forces the router down from CEF to process switching.

## Worked example: equal versus unequal path distribution

Three situations that often get confused:

| Situation | What the router does |
|---|---|
| Two routes, same AD and metric | equal-cost load balancing, up to 4 paths by default |
| Two routes, same AD, different metric (not EIGRP) | only the route with the lower metric is used; the other is a backup, not in the table |
| Two EIGRP routes, metric differs within `variance` | unequal-cost load balancing — both in the table, with more traffic going over the better path |

A single flow (one src/dst IP pair under normal CEF hashing) always travels **one** of
the available paths in full — you'll never see "half the traffic from the same host goes
over one link, half over the other," and that's not a sign load balancing is broken: it
balances between flows, not within a single one.

## What gets asked

- "Which route does the router use to forward the packet?" — longest prefix match.
- "How does the router load balance across two equal paths?" — per flow, when AD and
  metric are equal.
- "Why is the configured static route missing from the routing table?" — no route to the
  next hop (recursion didn't resolve) or the interface is down.
- "Which protocol supports unequal-cost load balancing?" — EIGRP (variance).
- "What does the router rewrite when forwarding?" — MAC addresses and TTL; it doesn't
  touch the IP addresses.
- "A static route depends on a next hop that is reachable only through another static
  route. What happens if the intermediate route is removed?" — the first route
  disappears from the table too: recursive next-hop lookup no longer resolves.
- "CPU utilization is high while traffic volume is unremarkable, and interface counters show
  drops. What should be checked?" — which forwarding path is actually in use: whether
  traffic has dropped from CEF to process switching (ACL logging, `ip cef` disabled,
  specific NAT/QoS/tunnel features).
- "Two routes have equal AD but different metrics from the same protocol. What is
  installed?" — only the route with the lower metric; there's no tie for balancing.

## Check yourself

```check
?? The table has 172.16.0.0/16 and 172.16.4.0/24. Where does a packet to 172.16.4.99 go?
!! Via the /24 — the match is longer.
?? A static route is configured, but it's missing from show ip route. First cause to check?
!! The router doesn't know how to reach the next hop — recursive lookup didn't resolve (or the interface is down).
?? Two OSPF routes to the same network with a metric of 20 each. What does the router do?
!! Installs both and load balances traffic across the flows.
?? Which protocol can load balance across unequal-cost paths?
!! EIGRP, using variance.
?? The route is in the table, but the next hop isn't responding to ARP. What does the user see?
!! Traffic doesn't get through even though the route looks correct; check show ip arp and connectivity to the neighbor.
?? A route to 203.0.113.0/24 points to next hop 198.51.100.2, and there's a separate static route to that address via 10.1.1.2, which is directly connected. What happens if the middle route is removed?
!! The first route disappears from the table too — recursive next-hop lookup no longer resolves at either level.
?? The router's CPU is pegged near 100% even though traffic volume is modest, and drops are climbing in the input queue. Where do you look first?
!! At the forwarding path: whether traffic has dropped from CEF to process switching — ACL logging, ip cef disabled on the interface, tunnels with fragmentation.
?? The same host continuously sends traffic that's equal-cost balanced across two links. Will half the packets of this flow go over one link and half over the other?
!! No: a single flow (one src/dst pair) travels one path in full — load balancing distributes different flows, not slices of a single flow.
```
