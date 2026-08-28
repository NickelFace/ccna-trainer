---
title: "IPv4 Addressing: Classes, Masks, Private Ranges"
lead: How an address is built, where the mask comes from, how a private address differs from a public one, and what APIPA, loopback, and multicast are.
---

## What an IPv4 address is

32 bits, written as four octets of 8 bits each: `192.168.10.25`. Each octet ranges from 0
to 255. A mask always splits the address into two parts: the **network number** and the
**host number**.

```txt
   192.168.10.25 / 24
   11000000.10101000.00001010.00011001
   └──────── network ─────────┘└─ host ─┘
```

The mask is a contiguous run of ones on the left, followed by zeros. `/24` means 24 ones:
`255.255.255.0`. There's no such thing as a discontiguous mask in IPv4 addressing
(`255.255.0.255` is always the wrong answer choice).

| Prefix | Mask | Hosts per network |
|---|---|---:|
| /24 | 255.255.255.0 | 254 |
| /25 | 255.255.255.128 | 126 |
| /26 | 255.255.255.192 | 62 |
| /27 | 255.255.255.224 | 30 |
| /28 | 255.255.255.240 | 14 |
| /29 | 255.255.255.248 | 6 |
| /30 | 255.255.255.252 | 2 |

## Address classes — what's left of them

The classful scheme was replaced by CIDR long ago, but the terms still show up in
questions:

| Class | First octet | Default mask | Purpose |
|---|---|---|---|
| A | 1–126 | /8 | large networks |
| B | 128–191 | /16 | medium |
| C | 192–223 | /24 | small |
| D | 224–239 | — | multicast |
| E | 240–255 | — | experimental |

`127.x.x.x` falls entirely outside class A — it's the **loopback**, the address of the host
itself; `127.0.0.1` always responds, even with no NIC installed at all. A successful ping
to 127.0.0.1 only proves the TCP/IP stack is alive, and says nothing about the network.

## Private addresses (RFC 1918)

| Range | In CIDR notation | Class |
|---|---|---|
| 10.0.0.0 – 10.255.255.255 | 10.0.0.0/8 | A |
| 172.16.0.0 – 172.31.255.255 | 172.16.0.0/12 | B |
| 192.168.0.0 – 192.168.255.255 | 192.168.0.0/16 | C |

Key properties that get tested:

- They're **not routed** on the internet — a provider drops that traffic.
- Any organization can use them freely, **without asking anyone**.
- Getting out to the internet requires **NAT/PAT** to swap the private address for a public
  one.
- Conserving the public address space is the historical reason they exist.

> [!trap] Trap
> `172.16.0.0/12` is 172.16 … 172.31, **not** "all of 172." `172.32.5.1` is public,
> `172.20.5.1` is private. That range boundary gets checked regularly.

## Special addresses

| Address | What it is |
|---|---|
| `0.0.0.0` | "any address"; as a route — the default route; as a source — a host that doesn't have an address yet (DHCP Discover) |
| `127.0.0.1` | loopback, the host itself |
| `169.254.x.x` | **APIPA** — the host got no response from DHCP and assigned itself an address |
| `255.255.255.255` | limited broadcast, doesn't cross the local segment |
| `224.0.0.0/4` | multicast; `224.0.0.5`/`224.0.0.6` — OSPF, `224.0.0.10` — EIGRP, `224.0.0.9` — RIPv2 |

An APIPA address is the single most informative symptom on the exam: **a client at
169.254.x.x means the DHCP server is unreachable** (down, in the wrong VLAN, or missing a
relay). Such a client can only talk to neighbors on the same segment who also have APIPA.

## The first and last address of a subnet

Two addresses in every subnet can never be assigned to a host:

- **the network address** — all host bits are zero (`192.168.10.0/24`);
- **the broadcast address** — all host bits are one (`192.168.10.255/24`).

That gives the formula for usable addresses: `2^h − 2`, where `h` is the number of host
bits. The exceptions are `/31` for point-to-point links (RFC 3021) and `/32` for loopback
interfaces and host routes.

## What a host needs to know to reach outside its network

Three parameters, and all three get tested:

1. **IP address** — its own, unique within the subnet.
2. **Mask** — to know who's "local" in the subnet and who requires a router.
3. **Default gateway** — the address of the router in the same subnet, where everything
   else gets sent.

Plus a **DNS** address — without it, connectivity works but names don't resolve, the
classic "ping by IP works, by name doesn't" symptom.

A host compares the destination address against its own subnet (bitwise, via the mask).
Local — it sends directly to the destination's MAC; remote — it sends to the gateway's MAC.
If the configured gateway isn't in the host's own subnet, the host can't use it at all.

```cli
C:\> ipconfig
   IPv4 Address. . . . . . . . . . . : 192.168.10.25
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.10.1
```

## Working through a problem: network, broadcast, and range from an address and mask

Given the address `192.168.10.140/26`. Find the network, the host range, and the broadcast
address.

```txt
   /26 → mask 255.255.255.192 → subnet step in the last octet = 256 − 192 = 64

   Subnet boundaries in the fourth octet: 0, 64, 128, 192
   140 falls between 128 and 192 → network address 192.168.10.128

   Network:            192.168.10.128
   First host:          192.168.10.129
   Last host:            192.168.10.190
   Broadcast:            192.168.10.191
```

Same technique for `10.5.201.9/22`. This time the step is in the third octet:
`256 − 252 (mask /22 = 255.255.252.0) = 4`. Third-octet boundaries: 0, 4, 8, …, 200,
**204**. 201 falls between 200 and 204 → network `10.5.200.0/22`, broadcast
`10.5.203.255`, host range `10.5.200.1 … 10.5.203.254`.

> [!key] Remember
> The algorithm is the same no matter which octet holds the "interesting" part of the mask:
> find the subnet step (256 minus the mask value in that octet), find the nearest boundary
> below — that's the network address, and the next boundary minus 1 is the broadcast
> address.

## Diagnostic: client received a 169.254.x.x address

**Symptom.** The computer can't open any website; `ipconfig` shows an address in the
169.254.0.0/16 range.

**What to check.** Work through it client-to-server, not the other way around — DHCP is an
exchange, and it can get stuck at any step:

```cli
C:\> ipconfig /all
   IPv4 Address. . . . . . . . . . . : 169.254.23.108
   Subnet Mask . . . . . . . . . . . : 255.255.0.0
   Default Gateway . . . . . . . . . :
```

1. **Physical layer and VLAN.** Is the switch port up and in the correct VLAN?
   (`show interfaces status`.) The wrong VLAN on the port means the DHCP Discover lands in a
   segment with no server.
2. **DHCP relay.** If the server is in a different subnet, the SVI needs an
   `ip helper-address`. Without it, a broadcast DHCP Discover never leaves its own subnet —
   a router doesn't forward broadcast traffic (see the encapsulation chapter).
3. **Server reachability and pool.** Is the server alive? Is the pool for this subnet
   exhausted? (`show ip dhcp pool` — check the `leased addresses` count against `total
   addresses`.)

**What it means.** An empty `Default Gateway` next to a `169.254.x.x` address confirms the
client **received no DHCP reply at all** (not "got the wrong one," but "got none") — the
host honestly assigned itself an address via APIPA just to have some way of talking to its
neighbors on the same segment. From there, follow steps 1–3 above; 9 times out of 10 the
cause is a missing `ip helper-address` on a new VLAN/SVI.

> [!trap] Trap
> An APIPA address is actually functional: two computers with 169.254.x.x on the same
> segment **can** ping each other (they share the /16 mask), but they can't reach anything
> beyond their own L2 segment — there's no gateway. "APIPA means the network is completely
> down" is not a correct statement.

## Diagnostic: part of the network is unreachable because of a mismatched mask

**Symptom.** A PC at `192.168.1.70/25` can't reach the server at `192.168.1.140`, even
though they're both physically on the same switched segment with no router between them.

**What to check.** Apply the /25 mask (255.255.255.128) to both addresses:

```txt
   192.168.1.70  → network 192.168.1.0/25    (0–127)
   192.168.1.140 → network 192.168.1.128/25  (128–255)
```

**What it means.** From the PC's point of view, the server is on **a different subnet**,
even though physically it's the same wire. The PC looks for the gateway's MAC, not the
server's — and either it sends the traffic to a router (which, if one exists and knows
both subnets, faithfully forwards the frame right back onto the same segment — a working
but inefficient "U-turn" path), or there's no gateway at all, and there's no connectivity
whatsoever. The symptom "part of the network is reachable, part isn't" almost always means
exactly this: the mask was set from a template rather than the actual addressing plan, and
some hosts suddenly ended up "on a different subnet" from each other.

## Classes, CIDR, and why classes were dropped

Classful addressing assigned a mask **based on the value of the first octet**, not on
actual need: an organization with 300 hosts got a whole class B (65,534 addresses) — with
65,000 addresses sitting idle. **CIDR** (classless inter-domain routing) allowed slicing a
network with a mask of any length regardless of class and, more importantly for routing,
allowed **aggregation** of routes: instead of announcing eight adjacent /24s to the
internet, you can announce a single /21 that covers all of them.

```txt
   Eight networks:
   203.0.8.0/24 … 203.0.15.0/24

   Summed into one entry:
   203.0.8.0/21   (the first 21 bits match across all eight)
```

Which is why the question "what problem does CIDR solve" isn't answered with "it makes
addressing simpler for clients" — it's specifically that it **shrinks internet routing
tables** through route aggregation, and removes the rigid link between network size and
class.

## What gets asked

- "What is a characteristic of private IPv4 addressing?" — not routed on the internet,
  freely used inside an organization, requires NAT to get out.
- "An appropriate use for private IPv4 addressing" — addressing an organization's internal
  hosts.
- "A host has 169.254.10.5. What happened?" — no response was received from DHCP.
- "Which address is a valid host address in this subnet?" — rule out the network address
  and the broadcast address.
- "Which three parameters must be configured on a host?" — address, mask, gateway.
- Questions where `172.32.x.x` or `192.169.x.x` sneaks into the choices — those are public.
- "A PC receives an IP address in the 169.254.0.0/16 range and cannot reach the default
  gateway field, which is empty. What is the most likely cause?" — the DHCP server is
  unreachable or unavailable (no `ip helper-address` on a new VLAN) — the client never got
  a response at all.
- "Two hosts on the same physical segment cannot communicate, but each has full network
  connectivity to other hosts. What should be checked?" — whether their masks and subnets
  actually match: they might formally be in different /25 subnets on the same wire.
- "What problem does CIDR solve compared to classful addressing?" — it removes the rigid
  link between network size and class and allows aggregating routes into a single summary
  announcement, shrinking routing tables.
- "Given an IP address and prefix, which is the network address?" / "...the broadcast
  address?" — found via the subnet step (256 minus the mask value in the relevant octet)
  and the nearest boundaries below and above.

## Check yourself

```check
?? Is 172.31.255.254 a private address?
!! Yes, the range 172.16.0.0/12 ends at 172.31.255.255.
?? A client received 169.254.3.7. Where should you look?
!! At DHCP: the server is unreachable, isn't handing out addresses, or there's no relay in this VLAN.
?? How many usable addresses are in a /29, and why not eight?
!! Six: two are used up by the network address and the broadcast address.
?? A ping to 127.0.0.1 succeeds, a ping to the gateway doesn't. What does that prove?
!! Only that the local TCP/IP stack is working; it says nothing about the network or its settings.
?? A host is configured with a gateway from a different subnet. What happens?
!! The host can't send traffic outward: it won't find the gateway in its own subnet and won't be able to get its MAC.
?? Find the network, host range, and broadcast address for 10.5.201.9/22.
!! The subnet step in the third octet is 4 (256−252), the nearest boundary below is 200: network 10.5.200.0/22, hosts 10.5.200.1–10.5.203.254, broadcast 10.5.203.255.
?? Two PCs physically on the same segment can't see each other, though each has connectivity to the rest of the network. What's the first hypothesis?
!! They're formally in different subnets due to a mismatched mask — a PC treats its neighbor as "remote" and looks for a gateway instead of sending directly.
?? How does CIDR differ from classful addressing in practice?
!! The mask is no longer tied to the address's first octet, and networks can be aggregated into a single summary route — which is exactly what reduces the load on internet routing tables.
```
