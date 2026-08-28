---
title: SDN, Planes, and Fabric
lead: Control plane and data plane, northbound and southbound APIs, underlay and overlay, what Catalyst Center does, and how SD-Access and SD-WAN are built.
---

## The Three Planes

| Plane | What it does | Examples |
|---|---|---|
| **Data (forwarding) plane** | forwards packets using tables that are already built | switch ASIC, FIB |
| **Control plane** | builds those tables | OSPF, EIGRP, BGP, STP, ARP |
| **Management plane** | device access and monitoring | SSH, SNMP, syslog, NetFlow |

The idea of SDN in one sentence: **move the control plane off the devices and onto a
controller**. Devices remain fast executors, while decisions are made centrally, with a
complete view of the network.

## Northbound and Southbound APIs

```txt
      applications, scripts, portal
                 ▲
         northbound API (REST)
                 │
          [  controller  ]
                 │
      southbound API (NETCONF, RESTCONF,
        OpenFlow, gRPC, Telnet/SSH)
                 ▼
        switches and routers
```

- **Northbound** — "up," toward applications and people. Usually a **REST API**: used
  by scripts, orchestration systems, and self-service portals.
- **Southbound** — "down," toward devices: **NETCONF** (XML over SSH), **RESTCONF**
  (HTTP+JSON), **OpenFlow**, **gRPC/gNMI**, and in transitional deployments, plain SSH
  commands.

The direction is easy to remember from the picture: applications on top, hardware on
the bottom.

## Underlay and Overlay

- **Underlay** — the physical network: switches, cables, link IP addressing, and the
  IGP that provides connectivity between devices. It has one job — making sure any node
  can reach any other node.
- **Overlay** — the logical network on top of it: tunnels (**VXLAN**, GRE, IPsec) that
  carry user traffic. It has no awareness of the physical topology.
- **Fabric** — the underlay and overlay together, managed as a single entity with a
  shared policy.

The benefit of this separation: policy ("who can talk to whom") stops depending on
which port a cable is plugged into.

## SD-Access

A campus fabric managed by **Catalyst Center** (formerly DNA Center):

- **Control plane** — LISP: a separate "who is where" database instead of flooding.
- **Data plane** — VXLAN: user traffic is encapsulated between fabric nodes.
- **Policy** — SGT (Security Group Tags) via **TrustSec**: rules are written in terms
  of groups ("guests," "medical") rather than addresses and VLANs.
- Node roles: **edge** (facing users), **border** (exit from the fabric), **control
  plane node** (the mapping database).

What this delivers in practice: an employee connects anywhere and gets their own
policy; macrosegmentation is done with VNs (virtual networks), and microsegmentation
with SGT tags.

## SD-WAN

The same separation, but for branch sites over any transport (internet, LTE, MPLS):

- **vManage** — management and configuration;
- **vSmart** — the control plane, distributing policies and routes;
- **vBond** — introduces devices to each other when they connect;
- **vEdge/cEdge** — the routers themselves at each site.

The value: **per-application path selection** (voice over MPLS, backups over the
internet), encryption by default, a single policy across all branches, and fast
onboarding of new sites (zero-touch provisioning).

## What a Campus Controller Can Do

- inventory: which devices exist, software versions, topology;
- configuration templates and bulk deployment;
- **assurance** — assessing client and network "health," root-causing problems;
- scheduled software upgrades;
- a **northbound REST API** — everything above is also available to a script.

## Walkthrough: One Command's Path Through the Northbound and Southbound APIs

An administrator clicks "create new VLAN 50 on every access switch in the campus"
through the Catalyst Center web portal.

```txt
1. The portal (a northbound client) sends a REST request to the controller:
   POST /dna/intent/api/v1/... with a JSON body describing VLAN 50
   (northbound API — a call "from above," from the application to the controller)
2. The controller validates the intent and breaks the task down by the devices it affects
3. The controller reaches each switch over a southbound protocol
   (NETCONF/RESTCONF, or for older platforms, plain CLI over SSH)
4. Each switch applies the configuration locally and confirms the result
5. The controller aggregates the statuses from all devices and returns a single response to the portal
```

The key idea this illustrates: **the administrator never logs into an individual
switch** — every interaction goes through the controller, which is exactly why SDN is
called **intent-based**: the person describes *what* they want (VLAN 50 everywhere),
not *how* to do it on each individual platform with its own syntax. The traditional
approach would require entering that same set of commands manually (or via a script) on
each of dozens of switches individually, with no single point to verify the result.

## Troubleshooting: A Client in SD-Access Isn't Getting the Expected Policy

**Symptom.** An employee connects to the network in a new campus building, gets an
address, but resource access doesn't match their group — for example, a guest device
gets access to internal resources.

**What to check.** The mapping between the VN (virtual network, macrosegmentation) and
SGT (group tag, microsegmentation) for this port on the edge node:

```cli
EDGE1# show cts role-based sgt-map all
Active IPv4-SGT Bindings Information

IP Address              SGT     Source
10.10.50.20              10     LOCAL
```

**What we found.** If the device is assigned SGT `10` (say, "Guests") and the TrustSec
policy on the control plane node has no rules for that tag, the traffic by default can
either get excessive access (permit by default until a policy is explicitly defined) or,
conversely, get blocked somewhere it shouldn't be. Troubleshooting in SD-Access splits
into two independent layers: **whether the device landed in the right SGT** (this
happens on the edge node at connection time — manually, by port, or via 802.1X) and
**what that SGT is allowed to do** (that's the policy on the control plane node/ISE).
The "wrong access" symptom can originate at either layer, and the fix differs
accordingly — reassigning the group or editing the policy.

## Troubleshooting: An SD-WAN Branch Isn't Getting Routes and Policy

**Symptom.** A new cEdge router is powered up at a branch site and comes up, but
traffic through it doesn't follow the expected policies — as if the device weren't
connected to the overlay at all.

**What to check.** Whether the cEdge has established a control-plane session with
vSmart (not just the management session with vManage):

```cli
cEdge1# show control connections
PEER    PEER    SITE    PEER            
TYPE    STATE   ID      IP              
vsmart  down    100     10.0.0.20
vmanage up      -       10.0.0.10
```

**What we found.** The session to `vmanage` (configuration and monitoring only) is up,
but the session to `vsmart` (the actual control plane that distributes overlay routes
and policies) is not. That role separation is the whole point of the architecture: a
device can be fully managed (visible in vManage, applying configuration) but without a
session to vSmart it gets neither overlay routes nor traffic policies — technically
"connected," but not a full participant in the fabric. The cause of a session failure
specifically with vSmart is usually a connectivity issue to that particular control
component (port, ACL, NAT traversal) rather than a general transport problem, since
vManage is working fine.

## Exam Angle

- «Which plane forwards packets?» — the data plane.
- «Which API type is used by applications to talk to a controller?» — northbound
  (REST).
- «Which protocols are southbound?» — NETCONF, RESTCONF, OpenFlow, gRPC.
- «What is the difference between underlay and overlay?» — the physical network versus
  the logical network on top of it.
- «Which technology encapsulates user traffic in SD-Access?» — VXLAN (control plane is
  LISP).
- «What is a benefit of controller-based networking?» — unified policy, full
  visibility, fast deployment.
- «What does "intent-based networking" mean in practice?» — the administrator describes
  the desired outcome (intent) through the northbound API, and the controller
  translates it into southbound commands for each affected device.
- «A guest device unexpectedly has access to internal resources in an SD-Access fabric.
  What are the two independent things to check?» — whether the device was assigned the
  correct SGT on the edge node, and what that SGT is permitted to do under the TrustSec
  policy.
- «A cEdge router shows an active session with vManage but not with vSmart. What is the
  practical effect?» — the device is managed and visible in the system, but it doesn't
  get overlay routes or policies — it isn't a full participant in the SD-WAN fabric.

## Check Yourself

```check
?? Where does SDN move the control plane, and what stays on the device?
!! To the controller; the device keeps the data plane and continues forwarding packets.
?? A script requests a list of devices from the controller. Which API is that?
!! Northbound, usually REST.
?? How does underlay differ from overlay?
!! Underlay is the physical network and the IGP between devices; overlay is the tunnels carrying user traffic on top of it.
?? Which two protocols form the foundation of SD-Access?
!! LISP in the control plane and VXLAN in the data plane.
?? Why does SD-WAN have a separate vBond component?
!! It "introduces" devices to the controllers on first connection and helps them traverse NAT.
?? An administrator creates VLAN 50 on 50 switches with a single command through the Catalyst Center portal. Which API carries the request from the portal, and which one carries it to each switch?
!! From the portal to the controller — northbound (REST); from the controller to each switch — southbound (NETCONF/RESTCONF or CLI over SSH).
?? A guest device in SD-Access gets access to internal resources. At which two independent layers should you look for the cause?
!! At the level of the SGT assigned to the device on the edge node (the wrong tag was assigned) and at the level of the TrustSec policy itself for that SGT on the control plane node — the error can be at either layer independently.
?? show control connections on a cEdge shows vmanage up, vsmart down. The device is configured, but policies aren't being applied. Why?
!! vSmart, not vManage, distributes overlay routes and policies; without a session to vSmart, the device is manageable but doesn't receive the fabric's actual content.
```
