---
title: DHCP and DNS
lead: DORA, leases, relay via ip helper-address, the role of DNS, and typical "addresses aren't being assigned" and "name doesn't resolve" diagnostics.
---

## DHCP: how a host gets an address

Four messages, and the order is asked about constantly — **DORA**:

| Step | Who | Type | Addressing |
|---|---|---|---|
| **D**iscover | client | broadcast | src 0.0.0.0 → dst 255.255.255.255 |
| **O**ffer | server | unicast or broadcast | offers an address |
| **R**equest | client | **broadcast** | confirms the chosen offer |
| **A**ck | server | unicast | lease is finalized |

Request is broadcast deliberately: if there were multiple offers, the other servers need
to find out their addresses weren't accepted.

Ports: client uses **UDP 68**, server uses **UDP 67**.

The client tries to renew the lease once it reaches **50%** of its duration (T1), and
tries again at **87.5%** (T2). If it gets no response by the end of the lease, it starts
over from scratch, and if there's no response at all, it falls back to **APIPA
169.254.x.x**.

## Router as a DHCP server

```cfg
ip dhcp excluded-address 192.168.10.1 192.168.10.20
!
ip dhcp pool LAN10
 network 192.168.10.0 255.255.255.0
 default-router 192.168.10.1
 dns-server 192.168.10.5 8.8.8.8
 domain-name example.com
 lease 3 0 0                       ! 3 days
```

`excluded-address` is **mandatory** for gateway, server, and printer addresses —
otherwise the server will hand them out to clients and you'll get a conflict. A missing
exclusion is a classic cause of "duplicate address in the network."

```cli
R1# show ip dhcp binding
IP address       Client-ID/Hardware address   Lease expiration        Type
192.168.10.21    0100.5079.6668.00            Aug 20 2026 09:12 AM    Automatic

R1# show ip dhcp pool
R1# show ip dhcp conflict           ! addresses where a conflict was detected
```

## Relay: server on a different subnet

DHCP requests are broadcast, and a router doesn't forward broadcasts. For clients in
VLAN 10 to get addresses from a server in the data center, relay is enabled on that
VLAN's gateway interface:

```cfg
interface Vlan10
 ip address 192.168.10.1 255.255.255.0
 ip helper-address 10.0.0.50
```

The router turns the broadcast into a unicast to the server and **inserts its own
interface address (giaddr)** — this tells the server which subnet the request came from
and which pool to hand out an address from.

> [!key] Remember
> `ip helper-address` is applied to the interface **facing the clients**, and the address
> configured in it is the server's. Placing it on the interface facing the server is a
> classic mistake in exam questions.

Besides DHCP, by default this command also relays other broadcast UDP services: TFTP,
DNS, the legacy Time service (port 37, not to be confused with NTP on 123 — it's not in
the default list and requires a separate `ip forward-protocol udp 123`), NetBIOS, and
TACACS — this is a side effect that occasionally comes up in questions.

## Client on a router

```cfg
interface GigabitEthernet0/0
 ip address dhcp
```

This is how the external interface of a SOHO router getting an address from an ISP is
configured.

## What breaks in DHCP

| Symptom | Cause |
|---|---|
| All clients show 169.254.x.x | server unreachable: down, no relay, wrong VLAN |
| Address assigned, but no internet | `default-router` not set in the pool |
| Address conflicts | static addresses not excluded from the pool |
| Some clients get no address | pool exhausted or too small |
| Works for the server's own VLAN, not others | `ip helper-address` not configured |

## DNS

DNS translates a name into an address. Without it, connectivity exists, but from the
user's point of view "the internet doesn't work."

- Port **53**: UDP for ordinary queries, TCP for zone transfers and large responses.
- Record types that show up in questions: **A** (name → IPv4), **AAAA** (name → IPv6),
  **CNAME** (alias), **MX** (mail), **PTR** (reverse zone).
- Resolution follows a hierarchy: client cache → configured DNS server → recursive walk
  starting from the root servers.

```cfg
ip name-server 8.8.8.8
ip domain-lookup
ip host SW1 10.0.99.10          ! static entry on the router itself
```

Diagnosis: `ping 8.8.8.8` works, `ping google.com` doesn't → the problem is DNS and
nothing else. `nslookup` shows which server responded and exactly what it returned.

## Walkthrough: DORA with real addresses and relay

A client in VLAN 10, DHCP server in the data center (`10.0.0.50`), with
`ip helper-address 10.0.0.50` configured on the VLAN 10 SVI.

```txt
1. Client: DHCPDISCOVER, src 0.0.0.0:68 → dst 255.255.255.255:67 (broadcast, doesn't go past its own segment)
2. The router (SVI Vlan10) gets the broadcast, sees ip helper-address, rebuilds the packet:
   src 192.168.10.1:67 (giaddr = the SVI's own address) → dst 10.0.0.50:67, unicast across the network
3. The server sees giaddr = 192.168.10.1 and knows: "request from subnet 192.168.10.0/24,"
   picks the pool for that subnet, replies with DHCPOFFER as unicast back to the router at 192.168.10.1
4. The router unwraps the Offer back toward the VLAN 10 client (again as broadcast/unicast
   depending on the broadcast flag in the client's request)
5. Client: DHCPREQUEST, broadcast again — confirms the chosen offer
6. The router relays the REQUEST to 10.0.0.50 again, the same way as the Discover
7. Server: DHCPACK — lease finalized, sent back the same way
```

The key detail for understanding relay: **giaddr is the one thing that lets the server
hand out the right address at all** to a client on a remote subnet. Without relay, the
server would never even see the broadcast from VLAN 10 in the first place (a router
doesn't forward broadcast traffic — see the chapter on encapsulation), and without
giaddr, even if it somehow did see it, it wouldn't know which pool to use.

## Diagnosis: relay is configured, but clients still get APIPA

**Symptom.** `ip helper-address` is set on the SVI, the DHCP server in the data center
is alive and serving other VLANs fine, but this particular VLAN keeps landing on
`169.254.x.x`.

**What to check.** Whether the server even has a scope defined for this subnet:

```cli
DC-DHCP# show subnet 192.168.10.0
Error: subnet not found
```

**What was found.** The server is receiving the relayed requests perfectly fine
(network connectivity is fine — other VLANs aren't affected, so it's not a routing
issue to the server), but it has **no scope configured** for `192.168.10.0/24` — it gets
the DHCPDISCOVER with giaddr 192.168.10.1, dutifully looks for a pool to serve it from,
finds none, and **stays silent**, not responding at all. From the client's perspective
this is indistinguishable from "server unreachable" — both cases end in the same APIPA
after a series of timeouts. The difference only shows up on the server itself: is the
symptom about network reachability (`ip helper-address`, ACLs, routing) or about a
missing scope configuration — the server is either unreachable entirely, or reachable
but not configured for that subnet.

> [!trap] Trap
> "APIPA means the server is unreachable" is not the only explanation. The server can be
> fully reachable and relay configured correctly, while the actual cause is simply a
> missing scope for that particular subnet on the server itself.

## Diagnosis: address conflict on a printer after an office move

**Symptom.** A network printer with a statically assigned address `192.168.10.5`
occasionally loses connectivity, and the router's log shows a conflict entry.

**What to check.** The pool's list of excluded addresses:

```cli
R1# show running-config | section ip dhcp pool LAN10
ip dhcp pool LAN10
 network 192.168.10.0 255.255.255.0
 default-router 192.168.10.1
 dns-server 192.168.10.5 8.8.8.8
```

**What was found.** There's not a single `ip dhcp excluded-address` line in the
configuration — the entire `192.168.10.0/24` range, including `.5`, is available to the
server for dynamic assignment. Sooner or later DHCP will hand this same address to
another client, and both devices will end up with the same IP — the printer sees drops
precisely when the conflicting client is active on the network. Note that the DNS server
address in the pool (`192.168.10.5`) matching the printer's static address in this
example isn't a coincidence — a typical cause of these conflicts is that the pool was
set up without accounting for addresses already assigned manually. The fix is a single
line, added **before** new addresses are actively handed out:

```cfg
ip dhcp excluded-address 192.168.10.1 192.168.10.10
```

## Walkthrough: a DNS query's path from cache to the root servers

`nslookup shop.example.com`, with an empty local cache on the client:

```txt
1. Client → its configured DNS server (resolver, e.g. 8.8.8.8): "shop.example.com?"
2. The resolver doesn't know the answer, and it's not in its cache either → it goes to a root server (.)
3. The root server doesn't hold site records, but knows who's responsible for .com → refers it to the .com TLD server
4. The .com TLD server doesn't know shop.example.com, but knows the NS servers for example.com → refers it to them
5. The example.com server is authoritative for that domain → returns the A record for shop.example.com
6. The resolver caches the answer for the record's TTL and returns it to the client
```

Exam detail: steps 2–5 are the **recursive** lookup performed by the client's resolver,
not by the client itself; the client only performs step 1 and gets back a ready answer.
A repeat query for the same name from a different client to the same resolver will
resolve instantly from cache (step 6) until the record's TTL expires — which explains
the delay after changing a DNS record on the server: the change isn't visible to anyone
whose resolver still has the old address cached.

## What gets asked

- "What is the order of DHCP messages?" — Discover, Offer, Request, Ack.
- "Which message is broadcast by the client?" — Discover and Request.
- "Where is ip helper-address configured?" — on the interface facing the clients, with
  the server's address.
- "A host received 169.254.x.x. What is the cause?" — DHCP is unreachable.
- "Which command excludes addresses from being assigned?" — `ip dhcp excluded-address`.
- "Ping by IP works, by name fails" — DNS.
- "Which port does DNS use?" — 53 (UDP, and TCP for zones).
- "What field does a DHCP relay agent insert so the server knows which subnet's pool to
  use?" — giaddr, the address of the relaying interface facing the clients.
- "`ip helper-address` is correctly configured and the DHCP server is reachable, but
  clients still receive an APIPA address. What else should be checked?" — whether the
  server has a scope configured for that specific subnet — the server may be reachable
  but simply not have a configuration for it.
- "A statically addressed printer intermittently loses connectivity and the router logs
  an address conflict. What is missing from the DHCP pool?" — `ip dhcp excluded-address`
  for the range that includes the printer's static address.
- "Who performs the recursive part of DNS resolution — the client or its configured
  resolver?" — the resolver (the DNS server configured on the client); the client itself
  makes only one query and gets back a ready answer.

## Check yourself

```check
?? Why is a DHCP Request sent as a broadcast?
!! So the other servers that sent offers find out their addresses weren't chosen.
?? On which interface, and with what address, is ip helper-address configured?
!! On the client VLAN's gateway interface, with the DHCP server's address.
?? Clients get addresses but can't reach outside networks. What's missing from the pool?
!! default-router — the default gateway.
?? When does a client start renewing its lease?
!! At 50% of the lease duration, retrying at 87.5%.
?? Ping to 8.8.8.8 works, ping to a name doesn't. Where do you look?
!! DNS: the name server's address, its reachability, cache, and record correctness.
?? What does the giaddr field inserted by a relay give the DHCP server?
!! Knowledge of which subnet the request came from — so the server picks the right address pool instead of guessing.
?? ip helper-address is configured correctly, the server is reachable, but clients are still on APIPA. What should be checked on the server itself?
!! Whether a scope is configured for that specific subnet — the server can honestly receive the requests and simply have nothing to offer.
?? A printer with a static address intermittently loses connectivity, and the log shows an address conflict. What's missing from the DHCP pool?
!! ip dhcp excluded-address for the range that includes the printer's address — without the exclusion, the server will eventually hand that same address to another client.
?? Who performs the recursive walk from the root DNS servers — the client itself, or its resolver?
!! The resolver (the DNS server configured on the client); the client makes one query to the resolver and gets back a ready answer.
```
