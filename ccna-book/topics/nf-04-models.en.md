---
title: The OSI and TCP/IP Models, Encapsulation
lead: Seven layers, four layers, who adds what to the data, and why the exam keeps asking "at which layer does this happen."
---

## Why have a model if the network works without one

A model is a shared vocabulary. When a question asks "at which layer does the device make
its decision" or "what happens to the frame once it leaves the router," what's really being
tested is one thing: understanding **which header gets read by whom, and who rewrites it**.

## The seven layers of OSI

| # | Layer | Responsible for | Unit (PDU) | Examples |
|---:|---|---|---|---|
| 7 | Application | interface to the application | data | HTTP, DNS, DHCP, FTP, SNMP |
| 6 | Presentation | format, encoding, encryption | data | TLS, JPEG, ASCII |
| 5 | Session | establishing and maintaining a dialogue | data | RPC, NetBIOS |
| 4 | Transport | end-to-end delivery, ports, reliability | segment (TCP) / datagram (UDP) | TCP, UDP |
| 3 | Network | logical addressing and routing | packet | IPv4, IPv6, ICMP, OSPF |
| 2 | Data link | media access, physical addressing | frame | Ethernet, 802.11, PPP |
| 1 | Physical | bits on the medium | bits | cables, connectors, fiber, radio |

The **TCP/IP** model is shorter: Application (7-6-5), Transport (4), Internet (3), Network
access (2-1). The exam uses both and often asks you to map one onto the other.

> [!key] Remember
> Who operates at which layer: a hub — 1, a switch — 2, a router and an L3 switch — 3, a
> regular firewall — 3-4, an NGFW and a proxy — up through 7. An access point — 2 (a bridge
> between radio and wire).

## Encapsulation, top to bottom

As application data moves down, it picks up headers along the way:

```txt
   [ Data                                  ]  L7
   [ TCP hdr | Data                        ]  L4  segment
   [ IP hdr  | TCP hdr | Data              ]  L3  packet
   [ Eth hdr | IP hdr | TCP hdr | Data|FCS ]  L2  frame
   [ 101010101010101010101010101010101010  ]  L1  bits
```

On the receiving side, everything is unwrapped in reverse order — **de-encapsulation**. Each
layer reads its own header and hands the contents up to the layer above.

The "top to bottom" order gets phrased in questions as a sequence: data → segment → packet →
frame → bits.

## What changes as a packet crosses a router

This is the central question of the whole topic, and it arrives in a dozen different
phrasings.

- **The source and destination IP addresses don't change** (unless NAT is involved).
- **The source and destination MAC addresses get rewritten at every hop**: the source MAC
  becomes the router's outbound interface, and the destination MAC becomes the next router,
  or the host itself if the destination network is directly connected.
- **TTL decreases by one** at every router; when it hits 0, the packet is dropped and an
  ICMP Time Exceeded message is sent back (this is exactly how traceroute works).
- The IP header checksum is recalculated (in IPv4; IPv6 simply doesn't have one).

```txt
PC1 --- SW --- R1 === R2 --- SW --- SRV
10.1.1.10        10.1.1.1  10.2.2.1     10.2.2.20

Frame PC1→R1:   src MAC PC1,  dst MAC R1-g0/0 | src IP 10.1.1.10, dst IP 10.2.2.20
Frame R1→R2:    src MAC R1-s0, dst MAC R2-s0  | same IPs
Frame R2→SRV:   src MAC R2-g0, dst MAC SRV    | same IPs
```

To learn the MAC address of the next device, a node uses **ARP** (NDP in IPv6, via Neighbor
Solicitation/Advertisement messages). An ARP request is broadcast (`FF:FF:FF:FF:FF:FF`); an
ARP reply is unicast.

## What's inside the headers

Fields that get named in questions.

**Ethernet II frame:**

| Field | Size | Meaning |
|---|---|---|
| Destination MAC | 6 bytes | who it's for |
| Source MAC | 6 bytes | who sent it |
| (802.1Q tag) | 4 bytes | VLAN ID and CoS priority, only on a trunk |
| Type/Length | 2 bytes | what's inside: 0x0800 — IPv4, 0x0806 — ARP, 0x86DD — IPv6 |
| Payload | 46–1500 bytes | data |
| FCS | 4 bytes | frame checksum |

Minimum 64 bytes, maximum 1518 (1522 with a tag). A shorter frame is a **runt**; a longer one
is a **giant**.

A MAC address consists of an **OUI** (the first 3 bytes — the manufacturer) and a serial
portion. The **I/G** bit in the first byte tells an individual address from a group one:
`01:00:5E:…` is multicast, `FF:FF:FF:FF:FF:FF` is broadcast.

**IPv4 header:**

| Field | Why it's asked about |
|---|---|
| Version | 4 or 6 |
| Header length | length of the header, minimum 20 bytes |
| **DSCP/ToS** | QoS marking |
| Total length | length of the whole packet |
| Identification, Flags, Fragment offset | fragmentation; the **DF** bit forbids it |
| **TTL** | decreases at every router; the packet is dropped at 0 |
| **Protocol** | what's inside: 1 — ICMP, 6 — TCP, 17 — UDP, 89 — OSPF |
| Header checksum | checks the header (absent in IPv6) |
| Source / Destination IP | the addresses |

The **IPv6** header is fixed at 40 bytes: no checksum, no fragmentation fields (only the
sender fragments), **Hop Limit** instead of TTL, **Next Header** instead of Protocol.

## ARP: how a neighbor's MAC gets learned

```txt
PC1 (10.1.1.10) wants to send a packet to 10.1.1.20

1. ARP Request  → broadcast FF:FF:FF:FF:FF:FF
   "who has 10.1.1.20? reply to 10.1.1.10 / AA:AA:AA:AA:AA:AA"
2. ARP Reply    → unicast, sent to PC1
   "10.1.1.20 is BB:BB:BB:BB:BB:BB"
3. PC1 stores the pair in its ARP cache and sends the frame
```

What gets asked about this:

- The request is **broadcast**, the reply is **unicast**. The switch learns the MAC of both
  participants along the way.
- The cache is temporary: on Windows, minutes; on Cisco routers, **4 hours** by default
  (`arp timeout`). To view it: `arp -a` on a host, `show ip arp` on a router.
- For an address **in a different subnet**, a node asks for the MAC of the **gateway**, not
  of the destination. The implication: a host's ARP cache should never contain the MAC of a
  remote server.
- **Gratuitous ARP** — a node announces its own address without being asked: used to check
  for duplicates, and used by FHRP to announce that a virtual address has moved.
- **Proxy ARP** — a router answers an ARP request about a foreign subnet with its own MAC. A
  legacy feature that's usually disabled; it sometimes explains "why everything works despite
  a wrong subnet mask."

```cli
R1# show ip arp
Protocol  Address       Age (min)  Hardware Addr   Type   Interface
Internet  10.1.1.1              -  aabb.cc00.0100  ARPA   GigabitEthernet0/0
Internet  10.1.1.10             4  0050.7966.6800  ARPA   GigabitEthernet0/0
```

A dash in the Age column means it's the interface's own address.

## Same subnet or not: how a host decides

The sender applies **its own** subnet mask to both addresses — its own and the
destination's — and compares the results.

```txt
   own:          192.168.10.25   → 192.168.10.0
   destination:   192.168.10.90   → 192.168.10.0   match → neighbor, send directly
   destination:   192.168.20.5    → 192.168.20.0   no match → send to the gateway
   mask:          255.255.255.0
```

Practical consequences that turn into questions:

- With a **wrong subnet mask**, a node treats a neighbor as "foreign" and sends traffic to
  the gateway — this sometimes still works (via proxy ARP or a route) and sometimes doesn't.
  Classic symptom: "part of the network is reachable, part isn't."
- If the configured gateway address is **not in the node's own subnet**, the node can't get
  its MAC and won't be able to reach anything outside at all.
- A frame to a neighbor carries the neighbor's MAC; a frame headed outward carries the
  **gateway's MAC while the destination IP stays unchanged**.

## End-to-end packet path: a worked example

PC1 (10.1.1.10/24, gateway 10.1.1.1) opens a page on server 10.3.3.30/24. Two routers sit
between them.

```txt
PC1 ── SW1 ── R1 ═══ R2 ── SW2 ── SRV
10.1.1.10   .1  10.2.2.1  .2   10.3.3.1  10.3.3.30
```

1. **PC1**: DNS has already resolved the name. It compares 10.3.3.30 to its own subnet —
   foreign. It needs the gateway's MAC, 10.1.1.1: checks its ARP cache, sends an ARP Request
   if it's not there.
2. **Frame PC1 → R1**: src MAC PC1, dst MAC R1; src IP 10.1.1.10, dst IP 10.3.3.30; TCP SYN
   to port 80, a dynamic source port.
3. **SW1** forwards it based on its MAC table, changing nothing.
4. **R1**: strips the L2 header, looks up 10.3.3.0/24 in its table → next hop 10.2.2.2. TTL
   64 → 63, checksum recalculated. Learns R2's MAC (via ARP), builds a **new** frame: src MAC
   R1, dst MAC R2. **The IP addresses haven't changed.**
5. **R2**: same process; the 10.3.3.0/24 network is directly connected, so it ARPs for the
   server itself. TTL 63 → 62. Frame: src MAC R2, dst MAC SRV.
6. **SRV** receives it and replies — and the whole path repeats in the opposite direction,
   which requires **the server to have a route back** (usually a default gateway).

Three conclusions the questions test: MACs change at every hop, IP doesn't; TTL decreases at
every router; without a return route, connectivity "works in one direction," which is to say
it doesn't work.

## ICMP: how connectivity gets measured

| Type | Message | When |
|---|---|---|
| 8 / 0 | Echo Request / Reply | `ping` |
| 3 | Destination Unreachable | no route, closed port, ACL filtering (code 13) |
| 5 | Redirect | "that other gateway is a better choice" |
| 11 | Time Exceeded | TTL hit zero — this is how `traceroute` works |

`traceroute` sends packets with TTL = 1, 2, 3…: each next router returns a Time Exceeded
message and thereby identifies itself. Asterisks in the output mean the node isn't
responding (it's filtering ICMP), not necessarily that connectivity is lost — the trace can
continue past it.

Symbols in Cisco `ping` output: `!` — reply, `.` — timeout, `U` — unreachable, `M` —
fragmentation needed but DF is set, `?` — unknown reply type.

```cli
R1# ping 10.3.3.30 source 10.1.1.1 size 1500 df-bit repeat 5
Type escape sequence to abort.
Sending 5, 1500-byte ICMP Echos to 10.3.3.30, timeout is 2 seconds:
Packet sent with the DF bit set
M.M.M
```

`M` here is direct evidence of an MTU problem somewhere along the path.

## Address types at L2 and L3

| Type | MAC | IPv4 | Who receives it |
|---|---|---|---|
| Unicast | a node's address | a node's address | one recipient |
| Broadcast | FF:FF:FF:FF:FF:FF | 255.255.255.255 or the subnet's broadcast address | everyone in the broadcast domain |
| Multicast | 01:00:5E:xx:xx:xx | 224.0.0.0/4 | subscribers to the group |

In IPv6, **broadcast doesn't exist as a class** — its role is filled by multicast (for
example, `FF02::1` — all nodes on the link, `FF02::2` — all routers).

## Collision domains and broadcast domains

- **Collision domain** — the area where two transmissions can collide. On a switch, that's
  one port, one domain.
- **Broadcast domain** — the area a broadcast reaches. That's a VLAN. A router or an L3
  interface marks the boundary.

A classic exercise: "how many domains of each type are in this diagram" — count switch ports
(collisions) and VLANs/router interfaces (broadcasts).

## MTU and fragmentation

Ethernet's MTU is **1500 bytes** of frame payload. A router either fragments a larger packet
(IPv4, if the DF bit isn't set) or drops it and replies with an ICMP "Fragmentation Needed."
In IPv6, intermediate routers **never fragment at all** — only the sender does, after
learning the path's MTU via Path MTU Discovery.

Hence the typical symptom: small pings get through while large ones are lost — somewhere
along the path the MTU is smaller, and the ICMP message that should report it is being
filtered by something.

## Troubleshooting methodology: three ways to divide a problem by layer

The OSI model isn't just theory — it provides a vocabulary for troubleshooting. The exam
names three approaches to the order in which you check the layers:

| Approach | How you move | When it's useful |
|---|---|---|
| **Bottom-up** | L1 to L7: cable → interface → addressing → session | when you don't know where to start; often it's a physical-layer problem |
| **Top-down** | L7 to L1: application → port → route → link | when the problem looks application-specific (one application isn't working for everyone) |
| **Divide-and-conquer** | start right in the middle (usually L3 — `ping`), then move up or down based on the result | the fastest approach when you have at least one lead |

In practice, `divide-and-conquer` looks like this: `ping` to the gateway succeeds — L1–L3 up
to the gateway are healthy, so move up (port, application) or continue along the path; it
fails — move down (interface, cable, VLAN). Every successful test at a layer eliminates half
of the possible causes, instead of checking them one at a time.

## Diagnostics: "ping works, the page won't load"

The symptom points to the whole L4–L7 range, not L1–L3 — but it's still worth checking in
order, not guessing.

**Symptom.** From the PC, `ping 10.3.3.30` succeeds, but the browser can't reach
`http://10.3.3.30`.

**What to check.** Since ping (ICMP, L3) succeeded — addressing, routing, and MAC resolution
along the path are all fine, so there's nothing left to divide below L4. So we look at
transport and above.

```cli
PC> telnet 10.3.3.30 80
Trying 10.3.3.30...
% Connection refused
```

**What we found.** TCP port 80 responds with `refused` — meaning we reached the host (L3
confirmed by the ping), but either the web server isn't running there, or an ACL/firewall is
blocking that specific port while letting ICMP through. From here it's no longer a question
about the OSI model, but about checking a specific service — but the model is exactly what
told us where the network's responsibility ended and the application's began: **L3 was
working, so the problem is at L4 or above**.

> [!trap] Trap
> "Ping succeeded, so the network is fine, look at the server" isn't always true: ICMP might
> be explicitly permitted by policy while TCP to the needed port is blocked by the same ACL.
> A successful ping only confirms L3 connectivity, not that a given service is working.

## Diagnostics: tracking down an MTU black hole

**Symptom.** SSH sessions and small requests work fine, but copying a large file or loading a
heavy page hangs with no error — it just never finishes.

**What to check.** Test the hypothesis "MTU somewhere along the path is smaller than 1500" by
pinging with fragmentation disabled and shrinking the size:

```cli
PC> ping 10.3.3.30 -f -l 1472
Packet needs to be fragmented but DF set.

PC> ping 10.3.3.30 -f -l 1400
Reply from 10.3.3.30: bytes=1400 time=8ms TTL=60
```

**What we found.** 1472 bytes of data (plus 28 bytes of IP/ICMP header = a 1500-byte packet)
doesn't get through, while 1400 (a 1428-byte packet) does — meaning somewhere along the path
the MTU is smaller than 1500 but not smaller than 1428; the exact boundary can be pinned down
with further size testing between those two values. Normally, in this situation the sender
receives an ICMP "Fragmentation Needed" (type 3, code 4), shrinks the segment size itself,
and nobody notices anything. Hanging instead of a clean size reduction means that ICMP
message is **being filtered somewhere** — a typical cause is an ACL or firewall at the edge
blocking ICMP entirely "for security," which breaks Path MTU Discovery in the process. The
fix isn't increasing the MTU — it's selectively permitting ICMP type 3 through the boundary.

> [!key] Remember
> "Works with small packets, hangs with large ones" is almost always an MTU issue along the
> path combined with filtered ICMP Fragmentation Needed messages, not ordinary packet loss.
> Ordinary packet loss doesn't depend on packet size this sharply.

## Reading `show interfaces` line by line

Interface error counters are a direct read of the OSI model — exactly where along the link
something broke.

```cli
R1# show interfaces gigabitethernet0/1
GigabitEthernet0/1 is up, line protocol is up
  Hardware is iGbE, address is aabb.cc00.0110
  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec
  Full-duplex, 1000Mb/s, media type is RJ45
     5 minute input rate 132000 bits/sec, 40 packets/sec
     5 minute output rate 210000 bits/sec, 55 packets/sec
     1523421 packets input, 981234123 bytes
     Received 890 broadcasts, 12 runts, 0 giants, 0 throttles
     47 input errors, 31 CRC, 0 frame, 0 overrun, 0 ignored
     0 watchdog, 890 multicast
     1998765 packets output, 1120983455 bytes
     0 output errors, 0 collisions, 0 interface resets
     0 babbles, 0 late collision, 0 deferred
```

What each line means and at what layer to look for the cause:

| Line | Layer | What it says |
|---|---|---|
| `is up, line protocol is up` | L1 / L2 | the first word means the carrier is present (cable, SFP, the peer port is enabled); the second means keepalives/the link protocol are holding up. `up/down` means a cable or peer problem; `down/down` means the port itself is disabled or dead |
| `MTU 1500` | L2/L3 | the negotiated frame size; a mismatched MTU on the two ends of a link is a common cause of "partially works" |
| `Full-duplex, 1000Mb/s` | L1 | the negotiated duplex and speed; a mismatch (auto on one side, fixed on the other) produces exactly the errors listed below |
| `CRC` | L1 | the frame arrived corrupted — the checksum didn't match. Main causes: a bad cable/connector, interference, **duplex mismatch** |
| `runts` | L1 | frames shorter than 64 bytes — fragments from collisions or the same duplex mismatch |
| `giants` | L1/L2 | frames longer than the maximum — usually a misconfigured jumbo MTU on one end of the link |
| `input errors` | L1 | the sum of all receive-side problems (CRC + framing + overrun + ...) — a general indicator that "the link is dirty" |
| `collisions` / `late collision` | L1 | collisions in general mean half duplex or a hub somewhere in the path; **late collision** is almost always a duplex mismatch or a segment longer than the standard allows |
| `output errors` | L1 | a transmit-side problem on this port — a full buffer, or also a duplex mismatch |

**Reading the specific example above.** This output shows `31 CRC` and `12 runts` with zero
`collisions` and `late collision`. Since there are no collisions at all, duplex is most
likely matched on both sides, and CRC with runts but no collisions points more toward the
cable or connector (interference, a damaged pair, an over-length segment) than toward a
duplex mismatch. If `late collision` were climbing alongside CRC, the first move would be to
check `speed/duplex` on both ends of the link, not swap the patch cord.

> [!trap] Trap
> A duplex mismatch doesn't always produce `down/down` or an obvious error — the interface
> often stays `up/up`, but large file transfers crawl while small packets pass through fine.
> Climbing `CRC` and `late collision` on an `up/up` interface is the signature of exactly
> this problem, not of a bad cable.

## What gets asked

- "What is the correct order of encapsulation?" — data → segment → packet → frame → bits.
- "Which addresses change as a packet crosses a router?" — only the MAC addresses (along
  with TTL and the checksum); the IP addresses stay the same unless NAT is involved.
- "At which layer does a switch/router/firewall operate?" — 2 / 3 / 3-4 (an NGFW — 7).
- "For what two purposes does Ethernet use physical addresses?" — to deliver the frame to the
  right device within the segment, and to let the recipient know who sent it.
- "What happens when TTL reaches zero?" — the packet is dropped, and an ICMP Time Exceeded
  message is sent back to the sender.
- Questions about the number of collision/broadcast domains in a diagram.
- "A network engineer wants to isolate the cause of a slow file transfer. Which approach
  starts at a middle layer?" — **divide-and-conquer**, usually starting with `ping`.
- "Users can ping a server but cannot connect to a web application on it. What should the
  administrator check?" — TCP port reachability (ACL/firewall/the service), not the
  network — L3 is already confirmed by the ping.
- "A file transfer to a remote host hangs on large files but small pings succeed. What is
  the most likely cause?" — somewhere along the path MTU is smaller and ICMP Fragmentation
  Needed is being filtered, so Path MTU Discovery isn't working.
- "Which counters in `show interfaces` indicate a duplex mismatch?" — climbing CRC errors,
  runts, and late collisions on an interface that stays `up/up`.
- "What is indicated by input errors on an interface that stays up/up?" — a physical-layer
  problem (cable, connector, interference, duplex), not a loss of L3 connectivity.

> [!trap] Trap
> "Ping doesn't get through — the network is broken" is just as wrong as "ping gets through —
> the network is fine." ICMP can be filtered by policy on its own while TCP/UDP to the needed
> port works fine, and vice versa.

## Check yourself

```check
?? A packet crossed three routers. How many times was the destination MAC rewritten, and how many times the destination IP?
!! The MAC — at every hop, so three times; the IP never changed (assuming no NAT).
?? At what point does a node send an ARP request?
!! When it knows the IP of the destination within its own subnet (or the gateway's IP) but doesn't know the matching MAC.
?? What is the Layer 4 PDU, and how does it differ from the Layer 3 PDU?
!! At L4 it's a segment (TCP) or a datagram (UDP) with port numbers; at L3 it's a packet with IP addresses.
?? Why doesn't IPv6 have broadcast?
!! Its role was handed to multicast groups: FF02::1 — all nodes, FF02::2 — all routers; this reduces the load on nodes the message isn't meant for.
?? What does a router do with an IPv6 packet that's larger than the next link's MTU?
!! Drops it and sends ICMPv6 Packet Too Big — in IPv6, only the sender can fragment.
?? A host sends a packet to a different subnet. Whose MAC does it use as the destination, and why?
!! The gateway's MAC: the destination address isn't in its own subnet, so a router will carry the packet the rest of the way.
?? What does the letter M mean in Cisco ping output?
!! The packet needs fragmentation but the DF bit is set — the MTU somewhere along the path is smaller than the size sent.
?? Which field in the IPv4 header says that TCP is inside?
!! Protocol: 6 — TCP, 17 — UDP, 1 — ICMP, 89 — OSPF.
?? Why isn't a remote server's MAC ever in a host's ARP cache?
!! For a foreign subnet, the host asks for the gateway's MAC, not the destination's — ARP never crosses beyond the local segment.
?? Traceroute shows asterisks at the third hop, but the nodes past it respond. What does that mean?
!! The intermediate node isn't replying to ICMP (it's filtering it); connectivity itself isn't broken.
?? How does divide-and-conquer differ from bottom-up and top-down troubleshooting?
!! It doesn't start at either extreme layer — it starts in the middle (usually L3, via ping) and moves up or down based on the result, which is faster than working through the layers in order.
?? Ping to a server succeeds, but telnet to port 80 returns Connection refused. Where's the problem?
!! Not in the network — L3 is confirmed by the ping. Check the service and any firewall/ACL in front of the host on TCP/80.
?? Copying small files works, large ones hang with no error. First hypothesis?
!! The MTU somewhere along the path is smaller, and ICMP Fragmentation Needed is being filtered, so Path MTU Discovery fails and the sender never learns to shrink the segment.
?? CRC and late collisions are climbing on an interface that stays up/up. What do you check first?
!! Whether speed/duplex match on both ends of the link — that's the signature of a duplex mismatch, not necessarily a bad cable.
?? How do giants differ from runts in show interfaces output?
!! Runts are frames shorter than 64 bytes (fragments/collisions); giants are longer than the maximum (usually mismatched jumbo MTU settings on the two ends of a link).
```
