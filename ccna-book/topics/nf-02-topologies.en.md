---
title: Network Architectures and Topologies
lead: Two-tier and three-tier hierarchy, spine-leaf, WAN, SOHO, on-premises and cloud — which design gets picked and why.
---

## Why networks are drawn in layers

A flat network of ten switches, plugged into each other however it happened, works — right
up until the first failure. Hierarchy isn't there for looks: it makes sure that **a failure
is predictable and growth doesn't require a rebuild**. Each layer is assigned exactly one
job, and a device in one layer doesn't take on another layer's job.

## Three-tier architecture

```txt
        [ Core ]  [ Core ]
          |  \      /  |
          |   \    /   |
      [ Dist ]      [ Dist ]
        |    \      /    |
   [Access][Access][Access]
      |       |        |
    PC/AP   PC/AP    PC/AP
```

| Layer | Job | What doesn't happen there |
|---|---|---|
| **Access** | connecting end devices, PoE, VLANs, port security, PortFast | routing and filtering backbone traffic |
| **Distribution** | aggregating access switches, inter-VLAN routing, ACL and QoS policy, the broadcast-domain boundary | connecting users directly |
| **Core** | fast switching between distribution blocks, maximum availability | heavy policy, ACLs, NAT — anything that slows things down |

The rule that gets tested: **policy lives at distribution, speed lives at core, users live
at access**. In this model, access switches never connect directly to each other; each one
runs two uplinks into two distribution switches.

## Two-tier (collapsed core)

If there's a single site and only one or two distribution blocks, a separate core layer
becomes extra hardware: distribution and core get "collapsed" into one layer — hence the
name **collapsed core**.

- Cheaper: fewer devices, fewer ports, fewer licenses.
- Same logic: access at the bottom, a combined layer on top.
- The limit of applicability is when the number of distribution blocks grows past three or
  four: meshing them together directly costs more than adding a core.

## Spine-leaf

The classic hierarchy was built for **north-south** traffic — from user to server and out to
the internet. In the data center, traffic became **east-west**: virtual machines and
microservices talk to each other far more than to the outside world. A rooted tree is a poor
fit for this — the path between two servers might climb all the way up to the core and back
down.

```txt
   [Spine]   [Spine]   [Spine]
     |  \  /   |  \  /   |
     |   X     |   X     |
   [Leaf]   [Leaf]   [Leaf]
     |         |        |
  servers   servers  servers
```

Properties that get tested:

- **Every leaf connects to every spine**; leaf-to-leaf and spine-to-spine — never.
- The path between any two servers is always the same length: leaf → spine → leaf. Hence
  predictable latency (**always two hops**).
- Scale bandwidth by adding a spine; scale port count by adding a leaf.
- STP isn't used in this fabric: L3 runs between leaf and spine (ECMP), or an overlay
  (VXLAN) does, so every link stays active at once.

## Why there are exactly three layers

Behind the hierarchy is arithmetic about failures and paths.

**Every access switch connects with two uplinks into two different distribution
switches.** From this follows:

- losing one uplink or one distribution switch doesn't cut off a floor;
- there are always two paths, so failover is a job for STP or routing, not a truck roll;
- the number of links grows linearly with the number of access switches, not quadratically,
  as it would with a "everyone connects to everyone" design.

A block consisting of "access + a pair of distribution switches" is called a **building
block** or **switch block**. The network grows by adding blocks, and that's the key
property: a new wing doesn't force you to redo the existing ones.

```txt
   Core ──────────────┬──────────────
        │             │
  ┌─────┴─────┐  ┌────┴──────┐
  │ Dist  Dist│  │ Dist  Dist│      ← block = a pair of distribution switches
  │  ╲    ╱   │  │  ╲    ╱   │
  │  Access   │  │  Access   │
  └───────────┘  └───────────┘
     building A     building B
```

A core becomes necessary once the number of blocks grows past three or four: meshing them in
pairs costs more than connecting each one to a pair of core switches.

### Where the L2/L3 boundary sits

Two design options that get distinguished in questions:

| | L2 access (classic) | Routed access |
|---|---|---|
| User VLANs | extend up to distribution | terminate at the access switch |
| What runs between access and distribution | trunk + STP | routing (OSPF/EIGRP) |
| Convergence on failure | seconds (RSTP) | sub-second (IGP) |
| VLAN roaming between floors | possible | not possible |
| Complexity | lower | higher, needs L3 on every access switch |

In the classic design, **distribution is the broadcast-domain boundary**: that's where SVIs,
default gateways, and FHRP (HSRP/VRRP) live, and where ACLs get applied. In routed access,
the boundary moves up onto the access switch itself.

> [!key] Remember
> "Where is the default gateway for a user VLAN configured" in a three-tier network — on
> **distribution**, usually as an FHRP virtual address on a pair of switches.

## Physical topologies

| Topology | What it looks like | Where it's used |
|---|---|---|
| **Star** | every node to one center | almost any modern LAN |
| **Full mesh** | everyone to everyone, `n(n−1)/2` links | the WAN core, where maximum resiliency is needed |
| **Partial mesh** | key nodes connect directly, the rest don't | the typical WAN cost/resiliency compromise |
| **Hub-and-spoke** | branches connect only to the center | WAN with a central data center, cheap, but the hub is a single point of failure |
| **Ring** | in a loop | metro fiber networks, metro Ethernet |
| **Bus** | a shared segment | only in history books, coaxial 10BASE2 |

The number of links for a full mesh is `n(n−1)/2` — the question "how many links does a full
mesh of 6 routers need" is solved in your head: 6·5/2 = 15.

## WAN, SOHO, and branch offices

**WAN** connects geographically separated sites and is almost always leased from a provider:

- **Leased line** — a permanent point-to-point circuit, dedicated bandwidth, expensive.
- **MPLS L3VPN** — the provider takes part in routing; sites see each other as neighbors.
- **Metro Ethernet** — Ethernet as a service within a city.
- **Broadband + VPN over internet** — cheap, bandwidth not guaranteed; IPsec tunnels or
  SD-WAN are built on top of it.
- **Cellular (LTE/5G)** — usually a backup for the primary link.

**SOHO** (small office / home office) — a network for a single space: one combined router
with a built-in switch, access point, DHCP server, NAT, and firewall. Everything a campus
has, but in one box and with no redundancy. The exam likes to stress that in SOHO **one
device combines all the roles**, while in a campus the roles are split apart.

## How resiliency and bandwidth get calculated

Three figures that show up in design questions.

**Number of links in a full mesh.** `n(n−1)/2`. For 4 nodes — 6; for 6 — 15; for 10 — 45.
That's exactly why full mesh is only used where there are just a handful of nodes.

**Oversubscription.** The ratio of total "down" bandwidth to "up" bandwidth. An access switch
with 48 ports at 1 Gbps and two 10 Gbps uplinks gives 48 : 20 ≈ **2.4 : 1**. Campus norms run
up to 20 : 1 at access and up to 4 : 1 at distribution; data centers aim for 3 : 1 or better.
Takeaway that gets tested: uplinks must be faster than user ports, or the bottleneck just
moves into the design.

**Points of failure.** A design is tested with "what stops working if you remove this
element." In a correct design, no single element's failure cuts off an entire building: a
pair of distribution switches, two uplinks, two paths out, two power feeds.

### Pairing up distribution: how STP gets bypassed

A pair of distribution switches is often combined into one logical device (**StackWise
Virtual**, VSS, or vPC on other vendors' gear). Then the two uplinks from an access switch
bundle into a single **EtherChannel** to what looks like "one" device: there are no blocked
ports, both links are active, and STP plays no part in failover. This is the standard answer
to "how do you use both uplinks at the same time."

## WAN: how sites get connected

| Technology | Bandwidth | Guarantees | Where it's used |
|---|---|---|---|
| Leased line (**T1** 1.544 Mbps, **E1** 2.048 Mbps, fiber) | fixed | strict | critical links, expensive |
| **MPLS L3VPN** | per contract | SLA, QoS from the provider | corporate WANs |
| Metro Ethernet | 10 Mbps – 10 Gbps | SLA within a city | sites in one city |
| Broadband (DSL, cable, GPON) | asymmetric | none | branches, backup |
| **VPN over internet** | whatever the link provides | none | cheap, on top of any access |
| LTE/5G | variable | none | backup, temporary sites |
| Satellite | low, 500+ ms latency | none | remote sites |

What gets asked about these:

- **MPLS** — the provider takes part in routing, sites see each other as neighbors; the
  customer doesn't need to build tunnels, but has less control.
- **VPN over internet** — the customer connects the sites itself (IPsec), bandwidth isn't
  guaranteed.
- **Hybrid** — primary link is MPLS, backup is internet; failover happens via a routing
  protocol or an SD-WAN policy.
- **SD-WAN** — runs on top of any links, chooses the path per application, centralized
  policy (see the chapter on SDN).

WAN redundancy is figured the same way as in a campus: two links on **different technologies
and different carriers**, or "two links" from one provider both go down in the same outage.

## On-premises and cloud

| | On-premises | Cloud |
|---|---|---|
| Where the hardware sits | in your own data center | at the provider |
| Who maintains it | you | the provider |
| Payment | CapEx, purchased upfront | OpEx, pay per use |
| Scaling speed | weeks (procurement) | minutes |
| Control over data | full | limited by contract |

Service models:

- **IaaS** — you get a virtual machine and network; the OS and everything above it is your
  job.
- **PaaS** — you get a runtime environment; you bring only the code.
- **SaaS** — you get a finished application (email, CRM); you manage only the accounts.

Deployment models: **public**, **private**, **hybrid** (part of the workload stays inside,
part goes outside, connected by a secure link), **community**.

> [!key] Remember
> A hybrid cloud requires connectivity: either IPsec/VPN over the internet, or a dedicated
> connection (Direct Connect / ExpressRoute). This is the most common "correct answer" in
> questions about moving part of a workload to the cloud.

### The five characteristics of cloud

The NIST wording, which shows up almost verbatim:

1. **On-demand self-service** — resources are provisioned without a human being involved.
2. **Broad network access** — reachable over the network from any device.
3. **Resource pooling** — a shared pool of resources serving many customers.
4. **Rapid elasticity** — scales up and down quickly with load.
5. **Measured service** — usage is measured and billed accordingly.

Hence the typical advantages in answer choices: no need to buy hardware in advance, you pay
for what you use, scaling takes minutes. And the typical limitations: dependency on the link
to the provider, data-residency concerns, the cost of outbound traffic.

### What changes in the network when you move to the cloud

- Traffic that used to never leave the data center now goes over the WAN — the **outbound
  link becomes critical** and needs redundancy and QoS.
- A requirement for **connectivity to the cloud** appears: VPN or a dedicated connection.
- **DNS and authentication** become distributed: part of the services now live outside.
- The point where policy gets applied changes: the edge firewall now sees more internal
  traffic than before.

## SOHO: what's inside one box

```txt
   [ Internet ]
        │
   ┌────┴─────────────────────────┐
   │  SOHO router                 │
   │  • NAT/PAT outbound          │
   │  • DHCP server inbound       │
   │  • basic firewall            │
   │  • Wi-Fi (access point)      │
   │  • 4-port switch             │
   └────┬───────────────┬─────────┘
      PC/printer     smartphones
```

What gets asked about this: one device combines the roles of router, switch, access point,
DHCP server, and firewall; everything goes out under one public address via PAT; there's no
redundancy for power or for the link. The exact way a campus differs is that every role is
broken out into its own device and duplicated.

## Worked problem: a three-floor building network

A condition typical of design questions: a building, three floors, 80 workstations per
floor, a server room in the basement, one internet exit, growth planned.

**What we decide, step by step.**

1. **Access.** Each floor needs a switch with at least 96 PoE ports (phones, access points)
   — that's two or three switches in a stack. User ports: `switchport mode access`,
   PortFast, BPDU guard, port security.
2. **Uplinks.** From each floor's stack, **two** links (ideally 10G) into two different
   distribution switches in the server room. They're bundled into an EtherChannel if the
   distribution pair acts as a single logical device.
3. **Distribution.** A pair of L3 switches: an SVI for every VLAN, FHRP as the default
   gateway, ACLs between segments, the junction point with the server farm.
4. **Core.** Not needed for one building — this is **collapsed core**. It appears once the
   number of buildings reaches three or four.
5. **Edge.** Router and firewall facing the provider; a second link from a different carrier
   as backup.
6. **Addressing.** One VLAN per function per floor: data, voice, Wi-Fi, management,
   guests — and a separate subnet for each (see the chapter on subnetting).

**What shouldn't be in a design like this** — and it's exactly what shows up as wrong
answers: a single uplink per floor, users plugged straight into the core, routing on an
access switch "because it can," a VLAN stretched across the whole building for no reason,
and guest Wi-Fi on the same VLAN as accounting.

## Clue in the question → the architecture it points to

| What the scenario says | Answer |
|---|---|
| "single site, few blocks, cost savings" | collapsed core (two-tier) |
| "several buildings, many distribution blocks" | three-tier |
| "data center, server-to-server traffic, predictable latency" | spine-leaf |
| "branches connect to a central office" | hub-and-spoke WAN |
| "every site needs a direct path to every other site" | full mesh (and compute `n(n−1)/2`) |
| "home office, one device" | SOHO |
| "part of the workload at a provider, part in-house" | hybrid cloud + secure connection |
| "pay per use, fast scaling" | cloud, OpEx |
| "need both uplinks active" | EtherChannel to a logically unified distribution pair |
| "sub-second convergence at access" | routed access (L3 down to the floor) |

## What gets asked

- "Which two characteristics describe the access layer in a three-tier architecture?" —
  connecting end devices, PoE, port security; **not** routing between distribution blocks
  and not transit traffic between buildings.
- "What is the benefit of a collapsed core design?" — fewer devices and lower cost for a
  small site while keeping the hierarchy.
- "Which topology provides a predictable two-hop path in a data center?" — spine-leaf.
- "How many links are required for a full mesh of N routers?" — `N(N−1)/2`.
- Questions about SOHO usually test whether you know that one device performs the functions
  of router, switch, access point, and firewall all at once.
- Cloud questions most often ask about the CapEx/OpEx difference and who's responsible for
  what in IaaS/PaaS/SaaS.

## Check yourself

```check
?? At which layer of the three-tier model are ACLs and inter-VLAN routing applied?
!! At distribution. Core is kept as fast as possible, with no policy applied.
?? Why doesn't spine-leaf need STP?
!! Routing (ECMP) or an overlay like VXLAN runs between leaf and spine — there are no L2 loops, so every link stays active.
?? How many links does a full mesh of 7 sites need?
!! 7·6/2 = 21.
?? How does collapsed core differ from three-tier?
!! The distribution and core layers are merged into one — it's the same design, for a site that doesn't need a separate core.
?? A company moved part of its servers to a provider, keeping the rest in its own data center. What's the model called, and what's needed between the two parts?
!! Hybrid cloud; it needs a secure link — IPsec VPN or a dedicated connection.
?? In a classic three-tier design, where does the default gateway for a user VLAN live?
!! At distribution — usually as an HSRP/VRRP virtual address on a pair of switches.
?? 48 ports at 1 Gbps and two 10 Gbps uplinks. What's the oversubscription ratio?
!! 48 to 20, roughly 2.4 : 1.
?? How does routed access differ from classic L2 access?
!! VLANs terminate at the access switch itself, and routing runs between it and distribution — convergence is faster, but a VLAN can't be stretched across floors.
?? Two internet links from the same provider — is that redundancy?
!! Weak redundancy: an outage at the carrier takes both down; real redundancy uses different carriers and, ideally, different technologies.
?? Name three of the five NIST characteristics of cloud.
!! On-demand self-service, rapid elasticity, measured service (also broad network access and resource pooling).
```
