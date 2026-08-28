---
title: Virtualization, Containers, and VRF
lead: The hypervisor and virtual machines, how a container differs from a VM, why a virtual switch is needed, and what VRF does on a router.
---

## Why Servers Get Virtualized

A physical server dedicated to a single task sits mostly idle: the CPU runs at a few
percent, half the memory is free, but the rack space and power are paid for in full.
Virtualization slices one machine into many: **better utilization, faster deployment,
cheaper redundancy, and easier workload migration**.

## The Hypervisor

The hypervisor is the layer that allocates physical resources among virtual machines and
isolates them from each other. Each VM sees "its own" CPU, memory, disk, and network
adapter.

| | Type 1 (bare-metal) | Type 2 (hosted) |
|---|---|---|
| Where it runs | directly on hardware | on top of a regular OS |
| Examples | VMware ESXi, Hyper-V, KVM, Proxmox | VirtualBox, VMware Workstation |
| Overhead | minimal | higher (two OSes in the stack) |
| Where it's used | data center, production | lab, an engineer's laptop |

> [!trap] Trap
> A hypervisor **does not supply an operating system** to a virtual machine — an
> administrator installs the OS inside the VM. The hypervisor allocates and controls
> **resources**. Recognize the phrasing "controls and distributes physical resources for
> each virtual machine."

Each VM typically has its own OS, its own IP address, and its own virtual MAC — from the
network's point of view, it's a separate node.

## How a VM Gets on the Network

A **virtual switch** (vSwitch, Distributed Switch, Open vSwitch) runs inside the
hypervisor. The machines' virtual NICs plug into it, while the server's physical NICs act
as uplinks to the outside.

```txt
      [ VM1 ] [ VM2 ] [ VM3 ]
         |       |       |
      ┌──────── vSwitch ────────┐
      │   VLAN 10   VLAN 20     │
      └─────── uplink NIC ──────┘
                  |
              physical
              switch (trunk)
```

Practical consequences that get tested:

- The physical switch port the server connects to is usually configured as a **trunk** —
  it carries all the VLANs used by the virtual machines.
- Traffic between two VMs on the **same** host never reaches the physical switch: it's
  switched inside the vSwitch. That's why it's invisible to SPAN on the physical port,
  and an ACL on the switch can't apply to it.
- The physical switch's MAC table sees **many** MACs behind a single port — all the VMs
  on that host. That's normal, not an attack (see the chapter on the MAC table).

## Containers

A container is not "a small VM." It uses the **host OS kernel** and only isolates the
application's processes and file system.

| | Virtual machine | Container |
|---|---|---|
| What's virtualized | hardware | OS namespaces |
| Own OS inside | yes, full-fledged | no, shares the host kernel |
| Size | gigabytes | tens to hundreds of megabytes |
| Startup | tens of seconds | fractions of a second |
| Isolation | strong | weaker, depends on the kernel |
| Typical tool | ESXi, KVM | Docker, containerd, Kubernetes |

Both approaches coexist: containers are often run inside virtual machines.

## VRF

**VRF** (virtual routing and forwarding) means several independent routing tables on one
router. Each interface is assigned to its own VRF, and the tables know nothing about each
other.

A helpful analogy: **a VLAN splits a switch into several logical switches, a VRF splits a
router into several logical routers**.

Why this matters:

- to separate tenants, branches, or environments (production/test/guest) without buying
  a second device;
- to allow **overlapping address spaces**: 192.168.1.0/24 in two different VRFs is two
  distinct networks, and they don't conflict;
- to enforce traffic isolation at the routing level, not just through filtering.

```cfg
ip vrf CUSTOMER-A
!
interface GigabitEthernet0/1
 ip vrf forwarding CUSTOMER-A
 ip address 192.168.1.1 255.255.255.0
```

```cli
R1# show ip route vrf CUSTOMER-A
R1# ping vrf CUSTOMER-A 192.168.1.10
```

The plain `show ip route` command only shows the global table — routes in a VRF are not
visible there. That's a frequent cause of "the route disappeared," when in fact the
wrong table was being checked.

## Troubleshooting: a Route "Disappears" After Configuring VRF

**Symptom.** An administrator just assigned an interface to a VRF and configured routing
on it, but `show ip route` no longer shows the interface or its networks at all — as if
the configuration had vanished.

**What to check.** Which routing table is actually being queried:

```cli
R1# show ip route
Gateway of last resort is not set
     10.0.0.0/24 is subnetted, 1 subnets
C       10.10.10.0 is directly connected, GigabitEthernet0/2

R1# show ip route vrf CUSTOMER-A
Routing Table: CUSTOMER-A
     192.168.1.0/24 is directly connected, GigabitEthernet0/1
```

**What we found.** Nothing disappeared — interface `Gi0/1` is bound to VRF `CUSTOMER-A`
(`ip vrf forwarding CUSTOMER-A`), and from that point on it lives in a **separate
routing table**, fully isolated from the global one. `show ip route` without the `vrf`
keyword only shows the global table and deliberately doesn't see anything that belongs to
other VRFs — that's not a bug, it's the whole point of the isolation. These cases need
to be diagnosed not as "where did the route go," but as "which table should I be looking
in now": the same thing applies to `ping`, `traceroute`, and most other commands — all of
them need the `vrf <name>` keyword if the address isn't in the global table.

> [!trap] Trap
> Binding an interface to a VRF with `ip vrf forwarding` **clears the IP address** on
> that interface if it was configured globally beforehand — the exam loves this detail in
> "after `ip vrf forwarding`, the interface stopped responding to pings" scenarios: the
> address has to be reconfigured after binding to the VRF.

## Troubleshooting: a VM Briefly Loses Connectivity After Migrating to Another Host

**Symptom.** After a live migration (vMotion, live migration) of a virtual machine to
another physical host in a cluster, it's unreachable over the network for a few seconds,
even though the VM itself is running.

**What to check.** What happens from the physical switch's point of view when a VM
changes hosts, and with it, the physical port its traffic exits through:

```cli
SW1# show mac address-table address 0050.7966.6800
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    DYNAMIC     Gi1/0/2   ! old host
```

**What we found.** The VM's MAC address is still listed against the old host's port from
before the migration. After the move, traffic to that MAC keeps going to the old port
until the switch sees a new frame from the VM with that same source MAC arrive on the
**new** port and rewrites the entry — the exact same source-MAC learning mechanism as in
the MAC table chapter, only here the trigger is physical movement of the address rather
than aging. Modern virtualization platforms speed this up by sending a **gratuitous
ARP** on the VM's behalf right after migration — the switch learns the new port
immediately instead of waiting for the VM's next outbound packet. If that accelerating
broadcast is missing (disabled in the cluster settings), the outage will be noticeably
longer — potentially the full 300-second aging time, if the VM doesn't transmit anything
first at its new location.

## Container Network Modes

Unlike a VM, a container has no full network stack of its own by default — the network
mode has to be chosen explicitly:

| Mode | What's visible externally | Typical use |
|---|---|---|
| **Bridge** | the container gets an address on the host's internal subnet, reaching outside via NAT and port mapping | default for standalone containers |
| **Host** | the container uses the host's network stack directly, with no port isolation | when performance matters and ports won't collide |
| **None** | no network interface at all | isolated tasks with no networking |
| **Overlay** | a virtual network spanning multiple cluster hosts | containers of the same application on different nodes communicate directly |

The exam-level detail here isn't Docker commands, but the fact itself: **a container's
network isolation is a software setting, not a physical separation**, unlike a VM, which
always has a dedicated virtual NIC on the vSwitch.

## What Gets Asked

- "Which role does a hypervisor provide for each virtual machine?" — it allocates and
  controls physical resources and isolates the machines from each other.
- "How do servers connect to the network in a virtual environment?" — through virtual
  NICs into a virtual switch, and from there through the host's physical uplinks.
- "What is a benefit of server virtualization?" — better hardware utilization, faster
  deployment, fewer physical servers.
- "Which is true about containers?" — they share the host's kernel, are lighter and
  faster than VMs, but have weaker isolation.
- "What is the purpose of a VRF?" — independent routing tables on one device, including
  support for overlapping addressing.
- "An interface is assigned to a VRF, but `show ip route` no longer shows its network.
  What is the most likely explanation?" — the network hasn't disappeared, it's in that
  VRF's routing table; check `show ip route vrf <name>`.
- "After binding an interface to a VRF, connectivity fails. What should be checked?" —
  whether the interface still has an IP address: `ip vrf forwarding` clears any address
  configured earlier, so it needs to be reconfigured.
- "A VM is briefly unreachable immediately after a live migration to another host. Why?"
  — the VM's MAC address is still listed against the old host's port in the physical
  switch's table, until a frame (or a gratuitous ARP) arrives from the new port.
- "What differentiates container network isolation from VM network isolation?" — a
  container's isolation is a software setting (choice of network mode), while a VM
  always has a dedicated virtual NIC connected to the vSwitch.

## Check Yourself

```check
?? What exactly does a hypervisor give a virtual machine?
!! A share of physical resources (CPU, memory, disk, network) and isolation from other VMs — but not an operating system.
?? How is a container fundamentally different from a virtual machine?
!! It uses the host OS kernel and only isolates the application, so it's lighter and starts instantly, but its isolation is weaker.
?? Why is traffic between two VMs on the same host invisible to the physical switch?
!! It's switched inside the hypervisor's virtual switch and never reaches the physical port.
?? How should you configure the switch port connecting to a virtualization host with VMs in different VLANs?
!! As a trunk — otherwise the virtual machines' VLANs won't get through.
?? Two different networks inside one router both use 10.0.0.0/24. How is that possible?
!! They're in different VRFs — each has its own routing table, so the addresses don't conflict.
?? After `ip vrf forwarding CUSTOMER-A` on an interface, connectivity is gone, even though an address was configured before. What's the first thing to check?
!! Whether the interface still has an IP address — binding to a VRF clears any previously configured address, so it needs to be reconfigured.
?? `show ip route` doesn't show a network you just configured on an interface in a VRF. Where should you look for it?
!! In that VRF's own routing table: `show ip route vrf <name>` — the global command will never show it.
?? A virtual machine is unreachable for a few seconds right after moving to another host in a cluster, even though it's running. Why?
!! The physical switch still remembers its MAC against the old host's port; connectivity returns as soon as a frame (ideally a gratuitous ARP) arrives from the new port and the entry is relearned.
```
