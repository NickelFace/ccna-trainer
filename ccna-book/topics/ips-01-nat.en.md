---
title: NAT and PAT
lead: Inside local, inside global, and the other four names for one address; static NAT, pool-based NAT, and overload — with commands and how to read the translation table.
---

## Why NAT

Public IPv4 addresses are scarce, while internal networks run on private addresses (RFC
1918), which aren't routable on the internet. **NAT swaps the address in the packet
header** as it crosses the network boundary, then restores it for the reply.

A side effect that shows up regularly in questions: internal addressing is **hidden**
from the outside world, and an external host can't initiate a connection to a host that
has no explicit translation.

## Four names for one address

| Term | Whose address | What it looks like |
|---|---|---|
| **Inside local** | internal host, as seen from inside | 192.168.1.10 |
| **Inside global** | the same host, as seen from outside | 203.0.113.5 |
| **Outside global** | external server, as seen from outside | 93.184.216.34 |
| **Outside local** | external server, as seen from inside | usually the same 93.184.216.34 |

Mnemonic: **local means "what it's called on that side," global means "what it's called
on the other side"; inside means the address is ours, outside means it belongs to
someone else.** These four terms come up in nearly every NAT question set.

## Three kinds

### Static NAT — one to one

```cfg
ip nat inside source static 192.168.1.10 203.0.113.10
!
interface GigabitEthernet0/1
 ip nat inside
interface GigabitEthernet0/0
 ip nat outside
```

Used for servers that need to be reached from outside: the address is fixed and
permanent. A port-based variant (**port forwarding**):

```cfg
ip nat inside source static tcp 192.168.1.10 80 203.0.113.5 8080
```

### Dynamic NAT — from a pool

```cfg
ip nat pool OFFICE 203.0.113.10 203.0.113.20 netmask 255.255.255.0
access-list 1 permit 192.168.1.0 0.0.0.255
ip nat inside source list 1 pool OFFICE
```

Each internal host gets a free address from the pool for the duration of its session.
**Once the addresses run out, new hosts can't get out** (packets are dropped, and an
ICMP unreachable goes back to the sender). This is the standard question about pool
exhaustion.

### PAT (NAT overload) — many to one

```cfg
access-list 1 permit 192.168.1.0 0.0.0.255
ip nat inside source list 1 interface GigabitEthernet0/0 overload
```

All internal hosts go out under **one** address, distinguished by their **source port
numbers**. This is exactly how any home router works. A single public address is enough
for thousands of concurrent sessions.

> [!key] Remember
> The keyword **`overload`** turns NAT into PAT. Without it, the same line with a pool
> gives you ordinary one-to-one dynamic NAT.

## The required steps

Whichever variant you pick, three things are needed, and the third is usually the one
people forget:

1. A translation rule (`ip nat inside source …`).
2. `ip nat inside` on the internal interface.
3. `ip nat outside` on the external interface.

Without marking the interfaces, the router simply has no way to know where the boundary
is, and no translation happens.

## Reading the table

```cli
R1# show ip nat translations
Pro Inside global      Inside local       Outside local      Outside global
--- 203.0.113.10       192.168.1.10       ---                ---
tcp 203.0.113.5:1055   192.168.1.20:1055  93.184.216.34:80   93.184.216.34:80
tcp 203.0.113.5:1056   192.168.1.21:3344  93.184.216.34:80   93.184.216.34:80

R1# show ip nat statistics
Total active translations: 3 (1 static, 2 dynamic; 2 extended)
Outside interfaces: GigabitEthernet0/0
Inside interfaces: GigabitEthernet0/1
Hits: 12043  Misses: 12
```

A row with no protocol is a static translation; rows with `tcp` and ports are PAT
(extended). The same inside global address on two entries with different ports is
overload in action.

Clearing: `clear ip nat translation *`.

## What breaks

| Symptom | Cause |
|---|---|
| No translations at all | interfaces not marked with `ip nat inside/outside` |
| Some hosts can't get out | the ACL in the rule doesn't cover their subnet |
| "Ran out of addresses" | dynamic NAT pool exhausted — needs `overload` |
| Can't reach a server from outside | no static translation/port forwarding |
| Works, but FTP/SIP breaks | protocols that carry an address inside the payload need an ALG |

## NAT and IPv6

IPv6 has plenty of addresses, so NAT in its usual form isn't needed — instead, **NAT64**
is used to give an IPv6 client access to an IPv4 resource. Flag the statement "IPv6
requires NAT to reach the internet" as incorrect wherever it appears among answer
choices.

## Walkthrough: a packet's round trip through PAT

A PC (`192.168.1.20`) opens a page on server `93.184.216.34:80` through a router with
`overload` on its outside interface `203.0.113.5`.

```txt
1. PC sends a packet: src 192.168.1.20:51223 → dst 93.184.216.34:80
2. The router sees the outbound packet on its inside interface, matches it against the
   NAT rule's ACL, and translates the source: 192.168.1.20:51223 → 203.0.113.5:1055
   (the port usually changes too — the original 51223 might already be in use by
   another host; the table remembers the "before / after" pair)
3. The packet leaves: src 203.0.113.5:1055 → dst 93.184.216.34:80
4. The server replies to the address it saw: src 93.184.216.34:80 → dst 203.0.113.5:1055
5. The router receives the reply on its outside interface, looks up 203.0.113.5:1055 in
   the translation table, and rewrites the destination back: 93.184.216.34:80 → dst
   192.168.1.20:51223
6. The packet reaches the PC with the server's original address, as if NAT never happened
```

A key detail that's often asked separately: **the PC has no idea NAT exists** — from its
point of view, the session runs directly to `93.184.216.34`; all the swapping happens on
the router, symmetrically in both directions. That's exactly why the translation table
entry is created by the **outbound** packet and then used to reverse-translate the
**inbound** one — without an outbound packet from the PC first, the router would simply
drop an inbound packet with that same port pair as unknown (this is also why an external
host can't reach an internal host on its own without a static translation).

## Diagnosis: part of the office can't reach the internet, the rest works fine

**Symptom.** PAT is configured and works for most employees, but users on one specific
subnet report a total lack of internet access.

**What to check.** Whether the ACL referenced by the NAT rule covers all the internal
networks:

```cli
R1# show access-lists 1
Standard IP access list 1
    10 permit 192.168.1.0, wildcard bits 0.0.0.255 (14021 matches)

R1# show ip route | include connected
C    192.168.1.0/24 is directly connected, GigabitEthernet0/1
C    192.168.2.0/24 is directly connected, GigabitEthernet0/2
```

**What was found.** ACL 1 only permits `192.168.1.0/24` — the second internal subnet,
`192.168.2.0/24`, is physically connected to the router and routes normally, but it's
**not included** in the list NAT considers eligible for translation. Packets from it
reach the router but leave with a private source address — and either get dropped by
the provider (private addresses aren't routable on the internet — see the chapter on
IPv4 addressing) or get lost at the first device that checks the source. The fix is to
add the network to the same (or a separate) ACL:

```cfg
access-list 1 permit 192.168.2.0 0.0.0.255
```

> [!trap] Trap
> "NAT is configured but doesn't work for part of the network" almost never means NAT
> itself is broken — check first whether the specific subnet is included in the ACL the
> translation rule references. `show ip route` will tell you which networks exist at all
> and need to be covered.

## Diagnosis: dynamic NAT pool exhausted

**Symptom.** In the morning users get online fine; by midday new connections stop
working, though already-open sessions keep running.

**What to check.** Pool usage statistics:

```cli
R1# show ip nat statistics
Total active translations: 11 (0 static, 11 dynamic; 0 extended)
Pool OFFICE: netmask 255.255.255.0
        start 203.0.113.10 end 203.0.113.20
        type generic, total addresses 11, allocated 11 (100%), misses 340
```

**What was found.** `allocated 11 (100%)` — the 11-address pool is fully in use, and
`misses 340` shows how many times a new session **couldn't** get a free address. This is
dynamic NAT without `overload` — each host needs its own address for the duration of the
session rather than just a port, and once the pool is exhausted, new hosts get no
translation at all until an existing session ends and frees an address up. The exam
takeaway: the correct fix isn't "expand the pool indefinitely" but **adding
`overload`**, turning NAT into PAT — one or two addresses are then enough for the whole
office, because sessions are distinguished by port, not by a whole address.

## Diagnosis: an internal server is unreachable from outside

**Symptom.** The web server `192.168.1.50:443` works fine internally, but users from the
internet can't open the site at the company's public address.

**What to check.** Whether there's a **static** translation for this host specifically,
rather than just the general PAT rule for outbound traffic:

```cli
R1# show ip nat translations | include 192.168.1.50
```

**What was found.** Nothing — there's no entry for this address at all in the table, and
that's expected: the general rule `ip nat inside source list 1 interface Gi0/0 overload`
only translates **outbound** connections initiated from inside. It doesn't create a
permanent mapping that an **inbound** request from outside could match — PAT simply
can't "guess" which internal host an unsolicited inbound packet is meant for. Publishing
the server requires a separate static translation (in this case, with a port, since a
specific service matters):

```cfg
ip nat inside source static tcp 192.168.1.50 443 203.0.113.5 443
```

## What gets asked

- "Which term describes the address of an inside host as seen from the internet?" —
  inside global.
- "Which command enables PAT?" — the rule with `overload`.
- "Refer to the exhibit… what does this NAT table show?" — static vs. dynamic, presence
  of ports.
- "What happens when the NAT pool is exhausted?" — new hosts don't get a translation.
- "Which two interfaces must be defined?" — `ip nat inside` and `ip nat outside`.
- Drag-and-drop: match the four NAT terms to addresses on a diagram.
- "PAT is configured and works for most hosts, but one subnet has no internet access at
  all. What should be checked?" — whether the ACL in the NAT rule covers that specific
  subnet.
- "`show ip nat statistics` shows a pool allocated at 100% with growing misses. What is
  the correct fix?" — add `overload` (turn it into PAT) rather than endlessly expanding
  the pool.
- "An internal web server is reachable from inside the network but not from the
  internet, even though PAT overload is configured for outbound traffic. What is
  missing?" — a separate static translation (with a static port) for that server — the
  general PAT rule only translates outbound connections.
- "Why can't an external host initiate a connection to an internal host through PAT
  overload without a static translation?" — there's no entry in the translation table
  until the internal host sends an outbound packet first; the router has nothing to
  match an unsolicited inbound packet against.

## Check yourself

```check
?? Host 192.168.1.10 goes online as 203.0.113.5. What is each address called?
!! 192.168.1.10 is inside local, 203.0.113.5 is inside global.
?? What single word separates PAT from dynamic NAT?
!! The keyword overload: sessions are distinguished by port instead of a separate address per host.
?? A NAT rule is configured, but there are no translations. What was forgotten?
!! Marking the interfaces with ip nat inside and ip nat outside.
?? What does a table row with no protocol or ports listed mean?
!! A one-to-one static translation.
?? Is NAT needed in IPv6, and what's used instead?
!! No; NAT64 is used to let an IPv6 client reach an IPv4 resource.
?? One of two internal subnets can't get online through PAT, even though both appear in the routing table. What should be checked?
!! The ACL referenced by the ip nat inside source list rule — does it cover both subnets; NAT only translates what that list permits.
?? Show ip nat statistics shows Pool allocated 100% and a growing misses counter. Is the fix to expand the pool?
!! Not necessarily: the better fix is adding overload and turning NAT into PAT — then sessions are distinguished by port, and one or two addresses cover the whole office.
?? General PAT overload is configured for outbound traffic. Will an entry appear in the translation table for a server no one inside has contacted, but which needs to be reachable from outside?
!! No — an entry is only created by an outbound packet; inbound connections from outside need a separate static translation.
?? Why can't you just configure PAT and expect anyone outside to reach any internal server?
!! Because the translation table is built by outbound packets; an inbound request with no existing entry has nothing for the router to match it against, so it's dropped.
```
