---
title: Single-Area OSPFv2
lead: Adjacencies and what must match, network types and DR/BDR elections, router ID, route cost, and reading show ip ospf neighbor.
---

## What OSPF does

It's a **link-state** protocol: every router learns the full map of the area, not a
secondhand summary from a neighbor. From that map, it computes the shortest paths
itself using the SPF algorithm (Dijkstra). This gives rise to properties that get
tested: fast convergence, loop-free by construction, support for VLSM and CIDR, and an
open standard (unlike EIGRP).

Exchanges use multicast: **224.0.0.5** for all OSPF routers, **224.0.0.6** for the DR
and BDR. The transport is IP protocol **89** — neither TCP nor UDP.

## Configuration

```cfg
router ospf 1
 router-id 1.1.1.1
 network 10.1.1.0 0.0.0.255 area 0
 network 10.10.10.0 0.0.0.3 area 0
 passive-interface GigabitEthernet0/2
!
interface GigabitEthernet0/1
 ip ospf 1 area 0            ! modern alternative to network commands
 ip ospf cost 10
```

What matters here:

- **The process ID (`router ospf 1`) is local** — it can differ between neighbors
  without breaking the adjacency. This is a favorite distractor in exam questions.
- `network` uses a **wildcard mask**, not a regular one. `0.0.0.255` = /24.
- `passive-interface` — the interface stays in the advertisements, but hello packets
  aren't sent out it: this is how user LANs get connected without flooding control
  traffic into their segment.

## Router ID

Chosen in this order:

1. An explicit `router-id` command.
2. The highest IP among **loopback** interfaces.
3. The highest IP among physical interfaces.

Loopbacks are preferred because they never go down. A router ID change takes effect
only after `clear ip ospf process` — it doesn't change on its own, and that gets asked
about.

## What must match for an adjacency

| Parameter | Must match |
|---|---|
| Subnet and mask on the link | yes |
| **Area ID** | yes |
| **Hello and Dead intervals** | yes |
| Authentication | yes |
| Stub area flags | yes |
| MTU | yes (otherwise it gets stuck in EXSTART/EXCHANGE) |
| Process ID | **no** |
| Router ID | must be **different** (a duplicate breaks the adjacency) |
| Priority | no |

Default timers: **hello 10 s, dead 40 s** for broadcast and point-to-point; 30 and 120
on nonbroadcast.

> [!trap] Trap
> An adjacency "stuck in EXSTART/EXCHANGE" is almost always a **MTU mismatch**. The
> `2WAY` state between two non-DR routers on a broadcast network is normal, not an
> error: such routers only build full adjacencies with the DR and BDR.

## Neighbor states

`Down → Init → 2-Way → ExStart → Exchange → Loading → Full`

- **Init** — a hello has been received from the neighbor, but we don't yet see
  ourselves in its hello.
- **2-Way** — bidirectional visibility; DR/BDR elections happen at this stage.
- **ExStart/Exchange** — master/slave negotiation and database description (DBD)
  exchange.
- **Loading** — requesting missing LSAs.
- **Full** — databases are synchronized.

The working state is **FULL** (or **2WAY** with non-DR neighbors on a broadcast
network).

## Network types and DR/BDR

| Network type | Where | DR/BDR | Hello/Dead |
|---|---|---|---|
| **Broadcast** | Ethernet | yes | 10/40 |
| **Point-to-point** | serial, `ip ospf network point-to-point` | no | 10/40 |
| Non-broadcast (NBMA) | Frame Relay | yes, neighbors configured manually | 30/120 |

On a broadcast network of N routers, without a DR there would be N(N−1)/2 adjacencies.
The **DR** is the synchronization hub: everyone builds full adjacencies only with the
DR and BDR.

DR election:

1. Highest **interface priority** (default 1; priority 0 means it can't participate).
2. On a tie — highest **router ID**.

Elections are **non-preemptive**: a router that shows up later with a better priority
won't take over as DR — the process has to be restarted first. This is another
favorite exam question.

On a link between two Ethernet routers, `ip ospf network point-to-point` is often set —
no DR election happens at all, and the adjacency comes up faster.

## Route cost

`cost = reference bandwidth / interface bandwidth`, with a default reference of
**100 Mbps**.

| Interface | Bandwidth | Cost |
|---|---|---:|
| FastEthernet | 100 Mbps | 1 |
| GigabitEthernet | 1 Gbps | 1 (!) |
| 10G | 10 Gbps | 1 (!) |
| Serial 1544 kbps | 1.544 Mbps | 64 |

Gigabit and ten-gigabit end up with the same cost — which is why reference bandwidth
gets raised consistently on every router:

```cfg
router ospf 1
 auto-cost reference-bandwidth 10000      ! in Mbps, i.e. 10 Gbps
```

Or cost is set by hand: `ip ospf cost 5`. A route's metric is the **sum of the outgoing
interface costs** along the path to the network.

## Reading the output

```cli
R1# show ip ospf neighbor
Neighbor ID     Pri   State           Dead Time   Address         Interface
2.2.2.2           1   FULL/DR         00:00:33    10.10.10.2      GigabitEthernet0/1
3.3.3.3           1   FULL/BDR        00:00:31    10.10.10.3      GigabitEthernet0/1
4.4.4.4           0   FULL/  -        00:00:38    10.10.20.2      Serial0/0/0

R1# show ip ospf interface brief
Interface    PID   Area   IP Address/Mask    Cost  State    Nbrs F/C
Gi0/1        1     0      10.10.10.1/24      1     DROTHER  2/2
Se0/0/0      1     0      10.10.20.1/30      64    P2P      1/1

R1# show ip protocols
Routing Protocol is "ospf 1"
  Router ID 1.1.1.1
  Number of areas in this router is 1. 1 normal
  Routing for Networks:
    10.10.10.0 0.0.0.255 area 0
  Passive Interface(s):
    GigabitEthernet0/2
```

`FULL/  -` on the third line is a point-to-point link — there are no DR/BDR roles there
at all.

## Areas: why they exist, and what an ABR is

The exam requires configuring a **single area**, but you still need to understand why
multiple areas exist.

Every router in an area holds the full topology of **its own** area and recomputes SPF
on every change. In a large flat network, that's expensive: any link "flap" makes
everyone recompute. Areas limit how far changes propagate: details stay inside, and
only summarized network information leaves.

- **Area 0 (backbone)** — mandatory; every other area must connect to it.
- **ABR** (area border router) — a router on the boundary between two areas, holding a
  separate database for each and passing inter-area routes between them (`O IA` in the
  table).
- **ASBR** — a router that injects external routes into OSPF (redistribution), coded
  `O E1`/`O E2`.

This is where the codes in `show ip route` come from: `O` — a network from your own
area, `O IA` — from another area, `O E1/E2` — brought into OSPF from outside.

## Working through a typical exhibit question

Given a topology: R1 — R2 over gigabit, and R1 — R3 — R2 over two 100 Mbps links. All
in area 0. The question asks which path R1 will use to reach a network behind R2.

1. Compute the cost of the direct path: gigabit at the default reference bandwidth →
   cost 1.
2. Compute the path via R3: two FastEthernet hops, each cost 1 (see the table above)
   → 1 + 1 = 2.
3. The direct path is cheaper (1 versus 2) — traffic goes directly, and the route via
   R3 stays in the database as a backup, appearing in the table only if the direct
   path fails. Notice: at the default reference bandwidth, gigabit and FastEthernet
   cost **the same** (cost 1 each) — the direct path wins not because of a speed
   difference between interfaces, but simply because it has fewer hops.

If reference bandwidth were raised to 10,000, gigabit would get cost 10 and
FastEthernet cost 100: the ratio stays the same, but it now makes sense for 10G links.

A second common scenario — "neighbors disappeared after adding
`passive-interface default`." The command makes **every** interface passive at once,
and the ones actually needed have to be re-enabled explicitly:

```cfg
router ospf 1
 passive-interface default
 no passive-interface GigabitEthernet0/1
```

## Why an adjacency won't come up

1. The interface isn't covered by `network` (check the wildcard) or it's marked
   passive.
2. Different area, hello/dead timers, authentication, or MTU.
3. Addresses on different subnets.
4. An ACL is blocking protocol 89 or multicast.
5. The same router ID on both routers.

Checking order: `show ip ospf interface` (is the interface participating, and with
what timers) → `show ip ospf neighbor` (which state it's stuck in) → `show ip protocols`
(which networks are being advertised).

## Troubleshooting: neighbor is visible but stuck in INIT

**Symptom.** `show ip ospf neighbor` shows a neighbor in the `INIT` state, and it hasn't
moved for several minutes — not `FULL`, not `2WAY`, but specifically `INIT`.

**What to check.** The difference between `INIT` and `2WAY` is the difference between
"I hear you" and "you've confirmed you hear me": each hello packet lists the router IDs
of every neighbor it has itself received a hello from. `INIT` means: the local router
is receiving hellos from the neighbor, but **doesn't see itself** in the neighbor list
inside that neighbor's hello.

```cli
R1# show ip ospf neighbor
Neighbor ID     Pri   State       Dead Time   Address        Interface
2.2.2.2           1   INIT/  -    00:00:35    10.10.10.2     GigabitEthernet0/1
```

**What we found.** Since hellos are arriving from the neighbor, the physical and L2
layers are fine — the problem is specifically in the direction back to the neighbor.
This is almost always **one-directional filtering**: an ACL on one of the interfaces
lets multicast `224.0.0.5` through one way and blocks it the other (often mistakenly
believed to be symmetric when in fact it's applied only `in` on one interface), or an
asymmetric physical-layer problem (one cable pair working, the other not, while the
interface still shows up formally). Check with ACLs on both interfaces and link error
counters — the same `show interfaces` reading used in the OSI model chapter.

> [!key] Remember
> `INIT` — the neighbor hears me, I haven't confirmed it (or vice versa, depending on
> which side you're looking from) — that's a one-directional connectivity problem.
> `2WAY` and beyond mean both sides have already confirmed each other, and from there
> on it's no longer about connectivity but about database synchronization.

## Troubleshooting: network type mismatch across a link

**Symptom.** Two routers on an Ethernet link are physically connected, `ping` between
them succeeds, but the OSPF adjacency never gets past `2WAY`, or behaves erratically
(repeated `FULL` → `DOWN` → `FULL` transitions).

**What to check.** The OSPF network type on each end of the link:

```cli
R1# show ip ospf interface gi0/1 | include Network Type
  Network Type BROADCAST, Cost: 1

R2# show ip ospf interface gi0/1 | include Network Type
  Network Type POINT_TO_POINT, Cost: 1
```

**What we found.** On R1 the interface is left at the default mode for Ethernet —
`BROADCAST` (expecting a DR/BDR election), while on R2 someone manually set
`ip ospf network point-to-point` (the interface doesn't expect an election at all). The
two sides are literally expecting different conversation protocols on the same link:
one waits for a hello with the DR/BDR field, the other never fills it in. The fix is
bringing both sides to **the same** network type — usually simpler to remove
`point-to-point` wherever it was set than to configure it on both sides, if a DR isn't
needed for a two-router link anyway.

## Troubleshooting: the chosen path isn't the physically fastest one

**Symptom.** There's a gigabit link between two points and a backup path over two
100 Mbps links, but traffic occasionally rides the slower backup path even while the
gigabit link is healthy.

**What to check.** Reference bandwidth on the routers along both paths:

```cli
R1# show ip ospf | include eference bandwidth
    Reference bandwidth unit is 100 mbps

R3# show ip ospf | include eference bandwidth
    Reference bandwidth unit is 10000 mbps
```

**What we found.** R3's reference bandwidth has been raised to 10000, while R1 is left
at the default 100 — meaning the cost of the same interfaces is calculated
**differently** on these routers: for R1 a gigabit interface costs 1, for R3 (at
10000) that same interface costs 10. If this mismatch touches only part of the
topology, the summed cost along alternate paths can, on some routers, unexpectedly
favor a longer route that's "cheap by their arithmetic." Reference bandwidth is a
network-wide setting: it has to be raised **identically on every router in the
domain** — raising it on just one is meaningless and creates exactly this kind of cost
miscalculation.

## What gets asked

- "Which parameters must match to form an adjacency?" — area, hello/dead,
  authentication, subnet, MTU (process ID does not).
- "Which router becomes the DR?" — highest priority, then highest router ID.
- "Why is the neighbor stuck in EXSTART?" — an MTU mismatch.
- "How is the OSPF router ID determined?" — command → loopback → physical interface.
- "What is the cost of a Gigabit interface by default?" — 1 (and that's the reason to
  raise reference bandwidth).
- "What does 2WAY state mean?" — neighbors see each other, but full adjacencies are
  built only with the DR/BDR.
- "Which multicast addresses does OSPF use?" — 224.0.0.5 and 224.0.0.6.
- "A neighbor remains in the INIT state. What does this indicate?" — the local router
  is receiving hellos from the neighbor but doesn't see itself in the neighbor's hello
  list — a one-directional connectivity issue, not a database sync problem.
- "Two routers on the same Ethernet link fail to reach FULL adjacency even though ping
  succeeds. What should be compared?" — the OSPF network type (`network type`) on both
  interfaces: `point-to-point` on one end and `broadcast` on the other breaks
  negotiation.
- "Traffic intermittently prefers a slower path even though a faster link is available.
  What OSPF setting should be checked across all routers?" — consistency of
  `reference-bandwidth`: different values on different routers in the domain produce
  different costs for the same interfaces.

## Check yourself

```check
?? R1's process ID is 1, R2's is 10. Will the adjacency come up?
!! Yes: process ID is local and doesn't need to match.
?? Neighbors are stuck in EXSTART. What's the first thing to check?
!! MTU on both interfaces.
?? How is the DR chosen when priorities are equal?
!! By the highest router ID; elections are non-preemptive, so a new router won't take over as DR.
?? Why do gigabit and ten-gigabit interfaces end up with the same cost?
!! The default reference bandwidth is 100 Mbps, and anything faster rounds down to 1 — which is why it's raised manually.
?? What does passive-interface do?
!! Stops hellos from being sent out that interface, but its network keeps being advertised in OSPF.
?? What state is it normal for two non-DR routers on a broadcast network to sit in?
!! 2WAY — they build full adjacencies only with the DR and BDR.
?? A neighbor in show ip ospf neighbor sits in the INIT state and never moves further. What does that mean?
!! The local router hears the neighbor's hello, but isn't confirmed in that neighbor's list — a one-directional problem (often an ACL blocking multicast one way only), not a database sync issue.
?? Ping between two routers on the same Ethernet link succeeds, but OSPF never gets past 2WAY. What should be compared first?
!! Network type on both interfaces — if one is set to point-to-point and the other is left at the default broadcast, negotiation breaks.
?? On one router in the domain, reference-bandwidth is raised to 10000; the rest are left at the default 100. What does this cause?
!! The same interface gets a different cost on different routers, so the total cost along alternate paths can diverge and pick a path that isn't actually the fastest physically.
```
