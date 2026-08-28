---
title: The Routing Table
lead: How to read show ip route - protocol codes, administrative distance, metric, next hop, and gateway of last resort.
---

## What the routing table is

It's a list of networks the router knows about and how to reach each one. Everything a
router does with a packet comes down to looking up the **longest matching prefix** in
this table and forwarding the packet to the next hop.

```cli
R1# show ip route
Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP
       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area
       * - candidate default

Gateway of last resort is 10.10.10.18 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 10.10.10.18
      10.0.0.0/8 is variably subnetted, 4 subnets, 4 masks
C        10.10.10.0/30 is directly connected, FastEthernet0/1
L        10.10.10.2/32 is directly connected, FastEthernet0/1
O        10.10.13.0/25 [110/6576] via 10.10.10.1, 06:58:21, FastEthernet0/1
D        10.10.20.0/24 [90/2172416] via 10.10.10.1, 00:12:03, FastEthernet0/1
S        192.168.5.0/24 [1/0] via 10.10.10.6
```

Breaking down the line `O 10.10.13.0/25 [110/6576] via 10.10.10.1, 06:58:21, FastEthernet0/1`:

| Part | Meaning |
|---|---|
| `O` | route source — OSPF |
| `10.10.13.0/25` | network and its prefix |
| `110` | **administrative distance** |
| `6576` | protocol **metric** |
| `via 10.10.10.1` | next hop |
| `06:58:21` | how long the route has been in the table |
| `FastEthernet0/1` | outgoing interface |

## Source codes

| Code | Source |
|---|---|
| `C` | connected — network on an up interface |
| `L` | local — /32 address of the interface itself |
| `S` | static |
| `S*` | static default route |
| `O`, `IA`, `E1/E2` | OSPF: intra-area, inter-area, external |
| `D`, `EX` | EIGRP: internal, external |
| `R` | RIP |
| `B` | BGP |

**C and L show up as a pair**: `C` is the interface's entire subnet, `L` is the
interface's own address as a /32. Both appear only when the interface is up/up **and**
has an address assigned. If the interface goes down, both entries disappear — and so
does everything that was routed through it.

## Administrative distance: what to trust

AD is "how much to trust the source." If the same prefix arrives from two different
protocols, the route with the **lower AD** wins a spot in the table.

| Source | AD |
|---|---:|
| Connected | 0 |
| Static | 1 |
| eBGP | 20 |
| EIGRP (internal) | 90 |
| OSPF | 110 |
| IS-IS | 115 |
| RIP | 120 |
| EIGRP (external) | 170 |
| iBGP | 200 |
| Unusable (route will never be used) | 255 |

This table gets asked about directly, and also indirectly: "a route arrives via both
OSPF and EIGRP — which one makes it into the table" → EIGRP (90 < 110).

## Metric: choosing within a single protocol

Metrics are compared **only between routes from the same protocol**:

| Protocol | Metric |
|---|---|
| RIP | hop count |
| OSPF | cost, inversely proportional to bandwidth |
| EIGRP | composite: bandwidth and delay (by default) |
| BGP | not a metric — a set of attributes (AS-path and others) |

Comparing an OSPF metric to an EIGRP metric is meaningless — they're in different
units. That's exactly why AD exists.

## Route selection order

When a packet arrives, the router chooses like this:

1. **Longest matching prefix** — the primary, first-applied criterion. A /32 route
   always beats a /24, even if the /24 has a lower AD.
2. If the prefix length is the same — **lower AD** wins.
3. If AD is also the same (single protocol) — **lower metric** wins.
4. If everything is equal — equal-cost load balancing, up to 4 paths by default.

> [!key] Remember
> The order is exactly this: **prefix → AD → metric**. A question like "a packet is
> headed to 10.1.1.5, and the table has 10.0.0.0/8 via EIGRP and 10.1.1.0/24 via RIP —
> where does it go" is decided at the first step: via the /24, despite RIP's worse AD.

## Gateway of last resort

The default route `0.0.0.0/0` means "everything else goes here." In the output it's
marked as `S*` (static candidate) or comes from a routing protocol. The line `Gateway of
last resort is …` at the top of the output is the first thing to check for questions
like "where does a packet to an unknown network go."

If it isn't present (`Gateway of last resort is not set`), a packet to an unknown
network is simply **dropped**, and an ICMP Destination Unreachable is sent back to the
sender.

## Route types by purpose

- **Network route** — a regular network with a mask shorter than /32 (`10.1.1.0/24`).
- **Host route** — `/32`, exactly one address. Appears as `L` for the router's own
  interfaces, and also from explicit configuration or from protocols (for example, a
  neighbor's loopback).
- **Default route** — `0.0.0.0/0`.
- **Floating static** — a static route with an artificially raised AD so it sits on the
  sidelines and only kicks in when the primary route fails.

## Useful commands

```cli
R1# show ip route 10.10.13.7          ! which route is chosen specifically for this address
Routing entry for 10.10.13.0/25
  Known via "ospf 1", distance 110, metric 6576

R1# show ip route ospf                ! only routes from one protocol
R1# show ip route | include 192.168    ! filter by string
R1# show ip cef 10.10.13.7            ! what's actually in the forwarding table
```

`show ip route <address>` is the most direct way to answer "which way does the packet
go" — the router itself performs the longest prefix match.

## Worked example: longest prefix match among three overlapping routes

The table holds three routes to overlapping networks:

```txt
   10.1.0.0/16    via R2
   10.1.4.0/22    via R3
   10.1.4.0/24    via R4
```

A packet is headed to `10.1.4.55`. Check each route individually, not "by eye":

```txt
   10.1.4.55  = 00001010.00000001.00000100.00110111
   /16 mask matches 10.1.0.0    — yes, the first 16 bits match
   /22 mask matches 10.1.4.0    — yes, the first 22 bits match
   /24 mask matches 10.1.4.0    — yes, the first 24 bits match
```

All three routes formally cover the destination address — that's normal; a more general
and a more specific route to overlapping ranges can coexist in the table. The router
picks the **longest** of the matching prefixes: `/24` is longer than `/22`, which is
longer than `/16`. The answer is the route via **R4**, and AD/metric play no part in
the decision at all, because the comparison never even reaches AD: the prefix-length
criterion settles the question first.

> [!trap] Trap
> Having a broader route (`/16`) in the table with a lower AD than the narrower one
> (`/24`) doesn't matter. Prefix length is always checked first; AD only comes into play
> when prefix length is tied between different protocols.

## Troubleshooting: backup route doesn't take over when the primary fails

**Symptom.** A floating static was configured as a backup for the primary link, but
after the primary goes down, traffic still doesn't follow the backup.

**What to check.** The route entry itself, before and after the failure:

```cli
R1# show ip route 192.168.50.0
Routing entry for 192.168.50.0/24
  Known via "static", distance 5, metric 0
  Routing Descriptor Blocks:
  * 10.10.10.6, via GigabitEthernet0/2
```

**What we found.** The backup route's AD is set to 5 — lower than the primary's, if
the primary arrives via, say, OSPF (110). That works the opposite of what was intended:
a backup route with a **lower** AD than the primary will win **always**, not just on
failure — meaning it isn't a backup at all, it's the primary. A correct floating static
is deliberately configured with an AD **higher** than the route it's meant to back up
(for example, an AD of 5 backing up a primary OSPF route with AD 110 should be replaced
with something like 115): as long as the primary route is alive, it's the one selected
for the table, while the floating static sits calculated but inactive, and only enters
the table once the primary disappears entirely.

```cfg
ip route 192.168.50.0 255.255.255.0 10.10.10.6 115
```

> [!key] Remember
> A floating static only works if its AD is **higher** than the primary route's AD. A
> lower AD is a common configuration mistake that turns the "backup" route into the
> permanent primary.

## Troubleshooting: the route is in the table, but packets aren't flowing

**Symptom.** `show ip route 10.10.13.7` shows a valid route via next hop `10.10.10.1`,
but ping to the destination address fails.

**What to check.** Whether the RIB and FIB agree (see the OSI model chapter — same
concepts apply) and whether the next hop itself is reachable:

```cli
R1# show ip route 10.10.13.7
Routing entry for 10.10.13.0/25
  Known via "ospf 1", distance 110, metric 6576
  * 10.10.10.1, via FastEthernet0/1

R1# show ip cef 10.10.13.7
10.10.13.0/25   receive
```

**What we found.** The route is listed in the RIB, but `show ip cef` shows `receive` or
`no route` instead of the real next hop — a mismatch between the routing table and the
forwarding table. In practice there's almost always one cause: **next hop `10.10.10.1`
is unreachable at Layer 2** — ARP hasn't resolved for it (no entry in `show ip arp`),
the interface toward it is down, or the next hop itself isn't responding. The route
stays in the RIB until the routing protocol reports the network gone, but a FIB entry
won't build without a working L2 adjacency. Exam takeaway: "the route is in the table
but traffic isn't flowing" is not fixed by reconfiguring routing — it's checked via next
hop reachability: ARP, interface state, the far end of the link.

## What gets asked

- "Which route will be used to reach host X?" — longest prefix match against the output.
- "What is the administrative distance of OSPF / EIGRP / static?" — 110 / 90 / 1.
- "Which two values are shown in brackets?" — AD and metric.
- "What does the L entry represent?" — the interface's own local /32 address.
- "Which type of route does R1 use to reach host 10.10.13.10/32?" — go by the prefix in
  the output: if a /25 matched, it's a network route, not a host route.
- "What happens if there is no default route and the destination is unknown?" — the
  packet is dropped, and an ICMP unreachable is sent back to the sender.
- "Two routes to overlapping networks exist with different prefix lengths and different
  AD. Which is selected?" — the route with the longer prefix, regardless of AD.
- "A floating static route never becomes active after the primary route fails. What is
  misconfigured?" — the floating static's administrative distance is lower than the
  primary route's, so it's already being chosen as the primary (or, conversely, it's set
  too high and never wins on AD against other backup sources).
- "`show ip route` shows a valid route to the destination, but ping fails. What should be
  checked next?" — next hop reachability at Layer 2: ARP, interface state, and whether
  the RIB and FIB agree, via `show ip cef`.

## Check yourself

```check
?? The table has 0.0.0.0/0 via R2 and 10.0.0.0/8 via R3. Where does a packet to 10.5.5.5 go?
!! Via R3: /8 is longer than /0 and matches the address.
?? A route to the same network arrives via both OSPF and EIGRP. Which one makes it into the table, and why?
!! The EIGRP route: administrative distance 90 is lower than 110.
?? What does the C and L pair of entries mean for the same interface?
!! C is the interface's subnet, L is its own address as a /32.
?? An OSPF metric of 20 versus an EIGRP metric of 2172416. Which route is better?
!! The question doesn't make sense: metrics from different protocols aren't compared — the choice is made by AD.
?? What does the Gateway of last resort line show?
!! Where traffic to networks not in the table goes; "not set" means such traffic is dropped.
?? The table simultaneously has 10.1.0.0/16, 10.1.4.0/22, and 10.1.4.0/24. A packet is headed to 10.1.4.55. Which route is chosen, and why doesn't AD come into play here?
!! Via the /24 route — it's the longest of the matching prefixes; AD is only compared when prefix length ties, and here the decision is made before that step is even reached.
?? A floating static is configured with AD 5, and the primary route arrives via OSPF with AD 110. What happens after the primary link fails?
!! Nothing good: AD 5 is lower than 110, so the floating static will always be chosen, not just on failure — it needs to be configured with an AD higher than the primary route's (for example, 115).
?? Show ip route shows a correct route, but show ip cef for the same address shows receive or nothing. What does this indicate?
!! The next hop is unreachable at Layer 2 (ARP hasn't resolved, the interface is down, or the next hop itself isn't responding) — the route stays in the RIB but doesn't build into a working FIB entry.
```
