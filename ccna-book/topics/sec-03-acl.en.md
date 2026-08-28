---
title: Access Control Lists (ACL)
lead: Standard and extended lists, wildcard masks, line order, where and in which direction to apply them, and why there's always an implicit deny any at the end.
---

## What an ACL is

An ordered list of permit/deny rules, matched against each packet **top to bottom until
the first match**. Anything that matches nothing falls under the invisible `deny any` at
the end.

Two uses:

- filtering transit traffic on an interface (`ip access-group`);
- restricting access to the device itself (`access-class` on the vty lines, and binding to
  NAT, QoS, route-map).

## Standard and extended

| | Standard | Extended |
|---|---|---|
| Numbers | 1–99, 1300–1999 | 100–199, 2000–2699 |
| Checks | **source IP** only | source and destination IP, protocol, ports, flags |
| Where to place | **closer to the destination** | **closer to the source** |

The placement logic: a standard ACL doesn't know where a packet is headed, so placing it
near the source would cut off too much; an extended ACL knows everything and should drop
junk as early as possible, before it wastes bandwidth on the rest of the network.

```cfg
! Standard: deny one subnet, permit everyone else
access-list 10 deny 192.168.5.0 0.0.0.255
access-list 10 permit any
!
interface GigabitEthernet0/1
 ip access-group 10 out

! Named extended: HR can't reach the DB server, everything else is allowed
ip access-list extended HR-FILTER
 deny tcp 10.1.5.0 0.0.0.255 host 10.9.9.10 eq 1433
 permit ip any any
!
interface GigabitEthernet0/0
 ip access-group HR-FILTER in
```

Named lists are preferable: a meaningful name, and lines can be edited by sequence number
(`no 20`, `15 permit …`) without rewriting the whole list.

## Wildcard mask

An inverse mask: 0 means the bit must match, 1 means the bit is a don't-care.

| What it describes | Address and wildcard |
|---|---|
| A single host | `10.1.1.5 0.0.0.0` or `host 10.1.1.5` |
| A /24 subnet | `10.1.1.0 0.0.0.255` |
| A /26 subnet | `10.1.1.64 0.0.0.63` |
| Any address | `0.0.0.0 255.255.255.255` or `any` |

Computed by subtracting from 255: mask 255.255.255.192 → wildcard 0.0.0.63.

## Line order decides everything

```cfg
! WRONG -- the second line will never fire
access-list 101 permit ip any any
access-list 101 deny tcp any host 10.9.9.10 eq 23

! RIGHT -- specific first, general last
access-list 101 deny tcp any host 10.9.9.10 eq 23
access-list 101 permit ip any any
```

> [!trap] Trap
> The invisible **`deny any` at the end** of every ACL is the reason behind "I applied the
> list and everything stopped working." If the task is only to block one thing, you need
> an explicit `permit ip any any` line at the end.

New lines added to a numbered list get appended **at the end** — which is why "I added a
deny and it didn't work" comes up regularly. In a named list, a line can be inserted at a
specific sequence number.

## Direction and where to apply it

`in` means packets **entering** the interface from the network; `out` means packets
**leaving** the interface into the network. One interface can have **one ACL per protocol
per direction**.

Reasoning framework for problems:

1. Determine whose traffic needs to be stopped (source) and where it's headed
   (destination).
2. Identify the device and interface the traffic actually passes through.
3. Decide the direction: if the ACL sits `in` on the interface the traffic enters, it
   won't even reach routing.
4. Check whether the rule accidentally blocks needed traffic (return packets, DNS, DHCP,
   ICMP).

Example: "block subnet 10.1.5.0/24 from SSH access to server 10.9.9.10, permit everything
else" — an extended ACL on the inbound interface of the router facing 10.1.5.0/24.

## Verification

```cli
R1# show access-lists
Extended IP access list HR-FILTER
    10 deny tcp 10.1.5.0 0.0.0.255 host 10.9.9.10 eq 1433 (128 matches)
    20 permit ip any any (54210 matches)

R1# show ip interface gigabitethernet0/0 | include access list
  Outgoing access list is not set
  Inbound  access list is HR-FILTER
```

The `matches` counter is the main debugging tool: if it's not increasing, traffic isn't
reaching the rule at all (wrong interface or wrong direction).

## ACL for device management

```cfg
access-list 10 permit 10.0.99.0 0.0.0.255
line vty 0 15
 access-class 10 in
```

This is how you restrict SSH to only the management network. Notice that this uses a
**standard** list and `access-class`, not `ip access-group`.

## Worked problem: where to physically place an ACL

Topology: `PC (10.1.5.20) — SW1 — R1 (Gi0/0 in 10.1.5.0/24, Gi0/1 in 10.9.9.0/24) — SW2 —
SRV (10.9.9.10)`. Task: **block** subnet 10.1.5.0/24 from SSH access to server 10.9.9.10,
and permit everything else.

**Step 1 — list type.** You need to filter by both source **and** destination, plus a
port — that's only possible with an extended ACL. A standard list (which sees only the
source) would force you to block absolutely everything from 10.1.5.0/24, not just SSH to
one server.

**Step 2 — device and interface.** The only point that all traffic from 10.1.5.0/24 to
10.9.9.10 physically passes through is R1. The question is exactly which interface and
which direction.

**Step 3 — direction.** The rule for an extended ACL is to place it **as close to the
source as possible**, so unwanted traffic is dropped before it wastes network resources
further along. So: interface `Gi0/0` (the one facing 10.1.5.0/24), direction `in` —
traffic is checked the moment it enters the router from the PC, and the blocked traffic
never proceeds to `Gi0/1`.

```cfg
ip access-list extended BLOCK-SSH-TO-SRV
 deny tcp 10.1.5.0 0.0.0.255 host 10.9.9.10 eq 22
 permit ip any any
!
interface GigabitEthernet0/0
 ip access-group BLOCK-SSH-TO-SRV in
```

**Step 4 — checking for side effects.** The `deny` rule only hits TCP/22 to this specific
host — web, mail, and everything else from 10.1.5.0/24 (including to server 10.9.9.10 on
other ports) keep working thanks to the `permit ip any any` at the end of the list.

> [!key] Remember
> For an extended ACL, "closer to the source" specifically means the **inbound** interface
> on the edge device facing the source, not just any port that happens to be nearby.
> Picking the wrong interface or direction is the most common reason an ACL is written
> correctly but doesn't filter anything.

## Diagnosis: the ACL lets requests through, but the client never gets a response

**Symptom.** An extended ACL permits outbound SSH traffic from clients to a server, but
sessions never establish — the client sees a timeout, as if the server were unreachable.

**What to look at.** The rule set on the **reverse** direction of the same interface — if
an ACL sits inbound on both sides separately, it's easy to forget that TCP is always
bidirectional:

```cli
R1# show access-lists
Extended IP access list OUTBOUND-ALLOW
    10 permit tcp 10.1.5.0 0.0.0.255 host 10.9.9.10 eq 22 (340 matches)

Extended IP access list INBOUND-FILTER
    10 deny tcp any any
    20 permit icmp any any
```

**Conclusion.** A separate ACL (`INBOUND-FILTER`) sits on the interface facing the other
direction, blocking **all** inbound TCP, including the return SYN-ACK from the server to
the client. The request from 10.1.5.0/24 reaches the server (the first ACL lets it
through), but the server's response, arriving from the opposite side, falls under
`deny tcp any any` in the second list and never makes it back to the client. A classic
plain (stateless) ACL **doesn't track session state** — it has no idea that this TCP packet
is a reply to an already-permitted request, and evaluates each direction independently.
The fix is either to explicitly permit the return traffic
(`permit tcp host 10.9.9.10 eq 22 10.1.5.0 0.0.0.255 established`, using the ACK flag as a
rough approximation of state), or to use a zone-based firewall if you need real stateful
inspection — a topic beyond a plain ACL.

> [!trap] Trap
> A standard ACL by itself is not a firewall: it doesn't remember what happened with
> traffic earlier, and each direction is configured **separately and independently**.
> "I permitted requests, so the responses were permitted automatically" — that's not how
> it works.

## Walkthrough: inserting a rule into a named ACL by sequence number

The list already works, and you need to add a deny **before** an existing permit rule,
without touching anything else:

```cli
R1# show access-lists BLOCK-SSH-TO-SRV
Extended IP access list BLOCK-SSH-TO-SRV
    10 deny tcp 10.1.5.0 0.0.0.255 host 10.9.9.10 eq 22
    20 permit ip any any
```

```cfg
ip access-list extended BLOCK-SSH-TO-SRV
 15 deny tcp 10.1.6.0 0.0.0.255 host 10.9.9.10 eq 22
```

Sequence number `15` physically inserts the new line **between** the existing 10 and 20 —
this is exactly why named lists number by default in steps of 10, leaving room to spare.
If the list were **numbered** (`access-list 101 ...`), this trick wouldn't be available:
new lines in numbered lists always get appended at the end, and the only way to insert a
rule earlier is to delete the whole list and recreate it in the right order (or edit the
configuration as text and load it as a whole).

## What gets asked

- "Where should a standard ACL be placed?" — closer to the destination.
- "What is the wildcard mask for a /26?" — 0.0.0.63.
- "Why did all traffic stop after applying the ACL?" — the implicit `deny any` at the end.
- "Which command applies an ACL to an interface?" — `ip access-group <name|number> in|out`.
- "Which ACL restricts vty access?" — a standard list combined with `access-class`.
- "Refer to the exhibit… will this packet be permitted?" — walk the lines top to bottom
  until the first match.
- "An extended ACL must block traffic from a specific subnet to one server on one port.
  Where is the best interface and direction to apply it?" — as close to the source as
  possible, on the inbound (`in`) interface of the edge device facing that subnet.
- "Return traffic from an allowed session never reaches the client, even though outbound
  requests are permitted. Why?" — ACLs are stateless: the reverse direction is filtered by
  a separate list that has no idea the traffic is a reply to an already-permitted request;
  you need an explicit `permit ... established` or stateful inspection via a firewall.
- "How can a rule be inserted between two existing lines of a named ACL without
  recreating it?" — with a command using a sequence number between the existing ones (e.g.
  15 between 10 and 20); this isn't possible in numbered lists, where lines are always
  appended at the end.

## Check yourself

```check
?? A packet doesn't match any line in the ACL. What happens to it?
!! It's dropped by the implicit deny any at the end of the list.
?? Is a standard ACL placed closer to the source or the destination, and why?
!! Closer to the destination: it only sees the source address, and placing it near the source would cut off too much.
?? Which wildcard mask describes exactly one host?
!! 0.0.0.0 (or the host keyword).
?? A deny was added to the end of a numbered ACL, but it doesn't block anything. Why?
!! The line was added after permit ip any any, so it's never reached; you need a named list and an insertion by sequence number.
?? Which command restricts SSH to the device by source address?
!! access-class on the vty lines with a standard ACL.
?? You need to block one subnet's SSH access to one server, and permit everything else. On which interface and in which direction should the extended ACL go?
!! On the inbound interface of the edge device facing that subnet (in) -- as close to the source as possible, so unwanted traffic doesn't proceed further into the network.
?? Outbound SSH requests are permitted by the ACL, but responses from the server never reach the client. Why?
!! ACLs don't track state -- the reverse direction is filtered by a separate list that blocks inbound TCP like any other, without recognizing it as a reply to an already-permitted request.
?? How do you insert a rule between lines 10 and 20 of a named ACL without rewriting the whole thing?
!! Give the new line a sequence number between them, e.g. 15 -- this works in named lists; in numbered lists, lines are always appended at the end.
```
