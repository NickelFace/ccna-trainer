---
title: IPv6 Addressing
lead: Address abbreviation, address types, link-local and EUI-64, SLAAC, and the multicast groups you need to recognize on sight.
---

## Reading an IPv6 Address

128 bits, eight 16-bit groups written in hexadecimal and separated by colons:

```txt
2001:0db8:0000:0000:0000:ff00:0042:8329
```

Two abbreviation rules:

1. **Leading zeros in a group are dropped**: `0db8` → `db8`, `0000` → `0`.
2. **One** longest run of all-zero groups is replaced with `::` — exactly once per
   address, otherwise the original length can't be reconstructed.

```txt
2001:db8::ff00:42:8329
```

The reverse task — "expanding" an address — comes up too: `2001:db8::1` is
`2001:0db8:0000:0000:0000:0000:0000:0001`.

> [!trap] Trap
> `2001:db8::ab::1` is an invalid address: two `::` in the same notation are not allowed.
> This variant shows up regularly as a distractor answer.

## Global Unicast Structure

```txt
 2001:0db8:aaaa : bbbb : host........................
 └── global prefix ─┘ └ subnet ┘ └ interface ID ┘
        /48                  /64            64 bits
```

- Global addresses are allocated from `2000::/3` (i.e., they start with 2 or 3).
- The standard subnet length is **/64**, and almost everything in IPv6 is built around
  it (SLAAC doesn't work with any other length).
- A provider typically hands an organization a /48, which is then carved into /64s, one
  per VLAN.

## Address Types

| Type | Prefix | Meaning |
|---|---|---|
| Global unicast | 2000::/3 | routable on the internet |
| Unique local (ULA) | FC00::/7 (in practice FD00::/8) | the "private" counterpart of RFC 1918, not routed externally |
| Link-local | FE80::/10 | mandatory on every interface, valid only within the local link |
| Multicast | FF00::/8 | group of recipients |
| Anycast | from a normal unicast range | an address assigned to multiple nodes; delivered to the nearest one |
| Loopback | ::1 | the node itself |
| Unspecified | :: | "no address"; used as a source during autoconfiguration |

**IPv6 has no broadcast** — this is the single most common correct answer in "what is
true about IPv6" questions.

### Link-Local Is Not Decoration

A `FE80::/10` address appears on an interface automatically as soon as IPv6 is enabled.
All neighbor interaction rides on it: NDP, router advertisements, as well as **OSPFv3 and
EIGRPv6 neighbor relationships** and the next hop in the routing table. A packet with a
link-local source address never leaves the local link.

## Multicast Groups You Need to Know

| Address | Who listens |
|---|---|
| FF02::1 | all nodes on the link (broadcast equivalent) |
| FF02::2 | all routers on the link |
| FF02::5 / FF02::6 | OSPFv3: all routers / DR and BDR |
| FF02::9 | RIPng |
| FF02::A | EIGRPv6 |
| FF02::1:FFxx:xxxx | solicited-node — used in NDP instead of ARP |

The first two come up most often: `ping FF02::1` is a way to see neighbors on the link.

## How a Node Gets an Address

1. **Statically** — by hand, as in IPv4.
2. **SLAAC** (stateless autoconfiguration) — the node hears a Router Advertisement, takes
   a /64 prefix from it, and **generates its own** interface identifier: either via
   EUI-64 or randomly (privacy extensions). No server is required, but DNS information
   doesn't come from it either (that's what stateless DHCPv6 is for).
3. **Stateful DHCPv6** — a server assigns the address and parameters, as in IPv4.

A mandatory part of every method is **DAD** (duplicate address detection): before using
an address, the node checks via NDP whether it's already taken.

### EUI-64 by Hand

To derive the interface identifier from MAC `00:1A:2B:3C:4D:5E`:

1. Split it in half and insert `FFFE` in the middle:
   `001A:2BFF:FE3C:4D5E`.
2. **Flip the seventh bit** of the first byte (the U/L bit): `00` = 00000000 →
   00000010 = `02`.
3. Result: `021A:2BFF:FE3C:4D5E`, and the full address with a prefix is
   `2001:db8:1:1:21a:2bff:fe3c:4d5e`.

The telltale sign of EUI-64 in a finished address is `FF:FE` in the middle of the
interface portion. That's the giveaway for "which address was generated using EUI-64"
questions.

## NDP Instead of ARP

| Task | IPv4 | IPv6 |
|---|---|---|
| Learn a neighbor's MAC | ARP request/reply | Neighbor Solicitation / Advertisement |
| Find a router | DHCP or static config | Router Solicitation / Advertisement |
| Check for a duplicate address | gratuitous ARP | DAD (NS to its own address) |
| Redirect | ICMP redirect | ICMPv6 redirect |

All of this rides on **ICMPv6** messages, so simply "blocking ICMPv6" on an IPv6 network
means breaking it — this comes up in security-related questions.

## Configuring on Cisco

```cfg
ipv6 unicast-routing
!
interface GigabitEthernet0/0
 ipv6 address 2001:db8:acad:1::1/64
 ipv6 address fe80::1 link-local
!
interface GigabitEthernet0/1
 ipv6 address 2001:db8:acad:2::/64 eui-64
```

```cli
R1# show ipv6 interface brief
GigabitEthernet0/0     [up/up]
    FE80::1
    2001:DB8:ACAD:1::1
R1# show ipv6 neighbors
IPv6 Address        Age Link-layer Addr State Interface
2001:DB8:ACAD:1::10   0 0050.7966.6800  REACH Gi0/0
```

Without `ipv6 unicast-routing`, the device behaves like a host: it has addresses, but no
routing and no Router Advertisement — a frequent cause of "clients aren't getting SLAAC."

## Troubleshooting: Client Has Only a Link-Local Address, No Global Address

**Symptom.** The host has an address like `FE80::...`, but `2001:db8:...` never showed
up — IPv6 internet access doesn't work, even though IPv4 on the same segment is fine.

**What to check.** Since the link-local address exists, the IPv6 stack itself is enabled
and working normally (it appears automatically). So the issue isn't the client — it's
that the client never received a Router Advertisement from anyone. Check the router:

```cli
R1# show running-config | include ipv6 unicast-routing
R1# show ipv6 interface gi0/0 | include dvertisement|oined
```

**What we found.** If `ipv6 unicast-routing` is missing from the configuration — that's
the cause: without this global command, the device behaves as a **host**, not a router:
the interface has its own addresses, but it doesn't send Router Advertisements and
doesn't forward traffic between networks. Clients on the segment dutifully wait for an RA
to run SLAAC and never get one — hence the bare link-local address with no global
address. This is exactly symmetric to the IPv4 case of "a client without DHCP only gets
APIPA": there the cause is an unreachable DHCP server, here it's a missing source of RAs.

> [!key] Remember
> Link-local means "the stack is enabled," not "the network is configured." A global
> address via SLAAC requires a live router with `ipv6 unicast-routing` sending RAs on
> that segment — the same role DHCP plays for IPv4.

## Troubleshooting: DAD Fails, Address Never Gets Assigned

**Symptom.** After an IPv6 configuration change, the interface comes up, but the global
address specifically never appears in `show ipv6 interface brief`, and the log shows a
duplicate-address message.

**What to check.** The device log:

```cli
%IPV6_ND-4-DUPLICATE: Duplicate address FE80::21A:2BFF:FE3C:4D5E on
GigabitEthernet0/1
```

**What we found.** Duplicate Address Detection is a mandatory step before a node starts
using any new address: it sends a Neighbor Solicitation **to its own candidate address**
and waits to see if anyone responds. A response means the address is already taken —
usually two interfaces with EUI-64 derived from identical virtual MACs (a common case in
labs with cloned VMs), or a mistake in a static assignment. Until the conflict is
resolved, the node **does not activate** that address — functionally the same thing
gratuitous ARP does in IPv4, except here it's a built-in mandatory step rather than an
optional check.

## Worked Examples: Abbreviating and Expanding Addresses

**Abbreviate `2001:0db8:0000:1234:0000:0000:0000:0001`.**
The eighth group is `0001`, not zero, so the run of all-zero groups only covers groups 5
through 7 (three groups) — that's the longest run, and it's the one we compress into
`::`. The third group (`0000`, before `1234`) is a separate, shorter run of zeros, so it
doesn't go into the `::`, but its leading zeros are still dropped: `0` instead of `0000`.
Result: `2001:db8:0:1234::1`.

**Expand `fe80::5054:ff:fe12:3456`.**
The `::` sits right after `fe80`, so the missing zero groups need to be inserted between
them — eight groups total, and five are currently visible (`fe80`, `5054`, `ff`, `fe12`,
`3456`), so we insert three `0000` groups: `fe80:0000:0000:0000:5054:00ff:fe12:3456`.
Note that only `ff` needs leading zeros padded out to four full digits (`00ff`) — the
other groups already have all four digits, so they're just copied as-is.

## Coexisting with IPv4

- **Dual stack** — both protocols running simultaneously on the same interface; the
  preferred and simplest migration path.
- **Tunneling** (6in4, GRE, 6to4) — carrying IPv6 inside IPv4 across a network that
  doesn't support IPv6.
- **Translation** (NAT64) — lets an IPv6 host communicate with an IPv4 resource.

## What Gets Asked

- "Which IPv6 address is the correct abbreviation of…" — the abbreviation rules.
- "What is the purpose of the FE80::/10 address?" — on-link communication, protocol
  neighbor relationships, next hop.
- "Which multicast address do all routers listen to?" — FF02::2.
- "Which address was generated using EUI-64?" — spot the `FF:FE` in the middle.
- "What are two characteristics of IPv6?" — no broadcast, 128-bit addresses, no
  fragmentation on intermediate routers, built-in NDP.
- Drag-and-drop: match a prefix to its address type (2000::/3, FE80::/10, FC00::/7,
  FF00::/8).
- "A host has a link-local address but no global unicast address, and IPv4 on the same
  segment works normally. What should be checked on the router?" — whether
  `ipv6 unicast-routing` is enabled and whether the interface is sending Router
  Advertisements.
- "What mechanism prevents two hosts from using the same IPv6 address?" — DAD (duplicate
  address detection) via a Neighbor Solicitation to its own candidate address.
- "Which two addresses cannot both appear as a shortened `::` in the same address?" —
  only one — the longest — run of zero groups can be compressed; any second run must be
  written out explicitly.

## Check Yourself

```check
?? Abbreviate 2001:0db8:0000:0000:00ab:0000:0000:1234 as far as possible.
!! 2001:db8::ab:0:0:1234 — "::" replaces only the first (longest) run of zeros; the second one can't be compressed.
?? Which address is always present on an interface with IPv6 enabled, even with no configuration?
!! A link-local address from FE80::/10.
?? How is ULA similar to 10.0.0.0/8, and how does it differ?
!! It's also private and not routed on the internet, but it's not designed to be NAT'd — outbound traffic uses a global unicast address instead.
?? A node takes a prefix from a Router Advertisement and generates its own address. What's this mechanism called?
!! SLAAC.
?? Which group replaces broadcast for "all nodes on the link"?
!! FF02::1.
?? An address shows ...FF:FE... in the middle. What does this indicate?
!! The interface identifier was built using EUI-64 from a MAC address.
```
