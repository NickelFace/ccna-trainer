---
title: EIGRP and BGP for the Exam
lead: How EIGRP differs from OSPF, what a feasible successor is, why eBGP matters, and how to read their command output.
---

## Where these protocols fit in the bigger picture

| | OSPF | EIGRP | BGP |
|---|---|---|---|
| Type | link-state | advanced distance-vector | path-vector |
| Scope | within an AS (IGP) | within an AS (IGP) | between AS (EGP) |
| Standard | open | Cisco (opened up in 2013) | open |
| AD | 110 | 90 internal / 170 external | 20 eBGP / 200 iBGP |
| Metric | cost by bandwidth | bandwidth + delay | path attributes |
| Transport | IP 89 | IP 88 | **TCP 179** |
| Multicast | 224.0.0.5/6 | 224.0.0.10 | none, unicast session |

The point of the split: an **IGP** is responsible for the optimal path inside its own
network, while **BGP** handles the policy of exchanging routes between organizations
and providers.

## EIGRP: what you need to know

```cfg
router eigrp 100                  ! AS number must match between neighbors
 no auto-summary
 network 10.1.1.0 0.0.0.255
 network 192.168.1.0
!
interface GigabitEthernet0/1
 ip hello-interval eigrp 100 5
```

- **The AS number must match** — unlike the process ID in OSPF. This is the first
  distinction that gets asked about.
- The adjacency runs on hello: **5/15 seconds** by default on fast links.
- The **DUAL** algorithm keeps not only the best route (the **successor**) but also a
  pre-computed backup (the **feasible successor**) — which is why failover is
  instant, with no recomputation needed.
- The condition for a backup (the feasibility condition): **the neighbor's reported
  distance must be less than the router's own feasible distance** — otherwise the
  route could turn out to be a loop.
- The default metric is computed from **bandwidth and delay**; reliability and load
  are part of the formula, but their weights are zero.
- The only IGP with **unequal-cost** load balancing (`variance`).

```cli
R1# show ip eigrp neighbors
H   Address       Interface   Hold Uptime   SRTT  RTO   Q  Seq
0   10.1.1.2      Gi0/1        13  00:22:41   12   100  0  14

R1# show ip eigrp topology
P 192.168.9.0/24, 1 successors, FD is 3072
        via 10.1.1.2 (3072/2816), GigabitEthernet0/1
        via 10.1.1.6 (5120/2816), GigabitEthernet0/2
```

`P` means passive — the route is stable. State `A` (active) means the router is
recomputing a path — persistent active states are a symptom of instability ("stuck in
active").

## BGP: the minimum you're asked about

```cfg
router bgp 65001
 neighbor 203.0.113.1 remote-as 65002      ! eBGP: different AS
 network 198.51.100.0 mask 255.255.255.0
```

- Runs over **TCP 179** — meaning neighbors are configured manually, there's no
  multicast discovery, and IP connectivity must already exist between them.
- **eBGP** is between different AS (AD 20), **iBGP** is within the same one (AD 200).
- The primary path-selection attribute at the CCNA level is **AS-path**: the shorter
  the list of autonomous systems, the better the route.
- `network` in BGP doesn't enable the protocol on an interface (as in an IGP) — it
  **advertises a prefix that already exists in the table**.

```cli
R1# show ip bgp summary
Neighbor      V   AS   MsgRcvd MsgSent  Up/Down  State/PfxRcd
203.0.113.1   4  65002    1204    1198  20:14:02      312

R1# show ip bgp
   Network          Next Hop        Metric LocPrf Weight Path
*> 10.0.0.0/8       203.0.113.1                        0 65002 65010 i
```

In the `State/PfxRcd` column, a number means the session is established and that many
prefixes have been received; text (`Idle`, `Active`) means the session hasn't come up.

Where BGP shows up in CCNA-level practice: connecting an organization to **two
providers**, exchanging routes with a provider, and accepting a default route.

## Quick-comparison cheat sheet

- Need an open standard and predictable convergence within a network → **OSPF**.
- Cisco-only equipment, need instant convergence and simple configuration → **EIGRP**.
- Need to exchange routes with another organization based on policy → **BGP**.
- Need load balancing over unequal-cost paths → **EIGRP**.
- Need scaling through areas and hierarchy → **OSPF**.

## Worked example: the feasibility condition with numbers

The topology table shows two paths to the same network:

```txt
via 10.1.1.2:  Advertised (Reported) Distance = 2816,  total FD via this path = 3072
via 10.1.1.6:  Advertised (Reported) Distance = 2816,  total FD via this path = 5120
```

The successor is always the path with the lowest total FD — here that's `10.1.1.2`
(3072). The second path becomes a **feasible successor** (an instant backup requiring
no recomputation) only if the feasibility condition holds: **the neighbor's reported
distance is less than the current successor's feasible distance**. Compare: the
reported distance via `10.1.1.6` is 2816, the successor's feasible distance is 3072.
2816 < 3072 — the condition holds, so `10.1.1.6` **qualifies** as a feasible successor.
Had the neighbor's reported distance been 3100 (greater than the successor's FD), DUAL
wouldn't have taken it on faith: that neighbor could itself be depending on the current
router, and an instant switch to it would risk creating a loop — a full recomputation
through the **active** state would then be required, instead of an instant failover.

## Troubleshooting: an EIGRP neighbor won't come up

**Symptom.** Two routers are directly connected, interfaces are `up/up`, but
`show ip eigrp neighbors` is empty on both sides.

**What to check.** What EIGRP neighbors are required to match — not just the AS
number:

```cli
R1# show ip protocols
Routing Protocol is "eigrp 100"
  ...
  Default networks flagged in outgoing updates
  Default networks accepted from incoming updates
  EIGRP metric weight K1=1, K2=0, K3=1, K4=0, K5=0
  EIGRP maximum hopcount 100
  Automatic Summarization: disabled
```

**What we found.** Beyond the autonomous system number (`router eigrp 100`), neighbors
also have to agree on **K-values** — the weighting coefficients in the metric
formula. If one router had them changed (for example, adding a weight for link
utilization), hello packets still flow, but the neighbor relationship never forms at
all — EIGRP treats a K-value mismatch as a more serious problem than merely different
metrics, and doesn't attempt to negotiate. It's comparable to an area mismatch in
OSPF: the list of things EIGRP requires to match exactly is shorter than OSPF's (AS,
K-values, subnet on the link, authentication), but every item on it strictly blocks
the adjacency on the slightest discrepancy.

## Troubleshooting: a BGP session sits in the Active state

**Symptom.** `neighbor remote-as` is configured on both ends, but `show ip bgp summary`
shows the text `Active` in the state column instead of a received-prefix count.

**What to check.** Since BGP runs over plain TCP/179 rather than multicast discovery,
the problem comes down to ordinary TCP troubleshooting (see the TCP/UDP chapter):

```cli
R1# ping 203.0.113.1 source 198.51.100.1
R1# telnet 203.0.113.1 179
```

**What we found.** The `Active` state in BGP means the router **is trying** to
establish a TCP session with the neighbor, but it isn't succeeding — either there's no
IP connectivity to the neighbor's address at all (it's easy to forget a static or IGP
route to that specific address, even while the rest of the network works fine), or an
ACL/firewall is blocking TCP/179 along the path. This is the same "SYN with no
response" pattern covered in the TCP chapter, just applied to a specific routing
protocol. It's also worth checking the obvious — whether the AS number in `remote-as`
matches what the neighbor actually announces about itself: a mismatch also produces no
explicit error, the session simply never gets past `Active`/`Idle`.

## What gets asked

- "Which value must match between EIGRP neighbors?" — the autonomous system number.
- "What is a feasible successor?" — a pre-verified backup route that satisfies the
  feasibility condition.
- "Which protocol uses TCP port 179?" — BGP.
- "What is the administrative distance of eBGP / internal EIGRP?" — 20 / 90.
- "Which two metrics does EIGRP use by default?" — bandwidth and delay.
- "Which routing protocol is used between autonomous systems?" — BGP.
- `show ip eigrp topology` output with a "which route is the successor" question.
- "Two EIGRP routers have matching AS numbers but never form a neighbor relationship. What
  else must match?" — K-values (metric weighting coefficients); a mismatch blocks the
  adjacency just as strictly as different AS numbers.
- "A candidate route's reported distance is greater than the successor's feasible
  distance. Can it become a feasible successor?" — no, the feasibility condition isn't
  met: that path could create a loop, and DUAL goes into recomputation (active) instead
  of an instant switchover.
- "A BGP neighbor state shows `Active` instead of a prefix count. What does this mean?" —
  the TCP session to the neighbor isn't establishing: no IP connectivity to the
  neighbor's address, or TCP/179 is being filtered along the path.

## Check yourself

```check
?? How does the EIGRP AS number differ from the OSPF process ID?
!! The AS number must match between neighbors; the OSPF process ID is local.
?? What does state P mean in show ip eigrp topology?
!! Passive — the route is stable; A (active) means a recomputation is in progress.
?? What transport and port does BGP run over?
!! TCP, port 179; neighbors are configured manually.
?? What is eBGP's AD, and why is it so low?
!! 20 — lower than any IGP: routes from an external partner are trusted more than internal recalculations when heading outbound.
?? What does the EIGRP variance command provide?
!! Load balancing across paths with different metrics (unequal-cost), which no other IGP offers.
?? A path via 10.1.1.2 has FD 3072, and a path via 10.1.1.6 has a reported distance of 2816. Is the second path a feasible successor?
!! Yes: 2816 is less than 3072, the feasibility condition holds — DUAL will accept it as an instant backup with no risk of a loop.
?? The AS number matches on two EIGRP routers, but the neighbor still never appears in show ip eigrp neighbors. What else should be checked?
!! K-values (metric weighting coefficients) — a mismatch blocks the adjacency just as strictly as a differing AS number.
?? Show ip bgp summary shows Active instead of a received-prefix count. What does this indicate?
!! The TCP session to the neighbor never established — either there's no route to its address, or TCP/179 is being filtered along the path; diagnose it like an ordinary TCP problem (ping, telnet to 179).
```
