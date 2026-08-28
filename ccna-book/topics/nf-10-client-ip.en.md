---
title: IP on Client Operating Systems
lead: ipconfig, ifconfig, and ip — where Windows, macOS, and Linux show address, mask, gateway, and DNS, and how to diagnose a problem from that output.
---

## Three Commands for Three Systems

| OS | Quick | Detailed |
|---|---|---|
| Windows | `ipconfig` | `ipconfig /all` |
| macOS | `ifconfig` | `networksetup -getinfo Wi-Fi` |
| Linux | `ip addr` (`ifconfig` is deprecated) | `ip addr show` + `ip route` + `resolvectl status` |

```cli
C:\> ipconfig /all
Windows IP Configuration
   Host Name . . . . . . . . . . . . : PC-1
Ethernet adapter Ethernet0:
   Description . . . . . . . . . . . : Intel(R) 82574L
   Physical Address. . . . . . . . . : B8-76-3F-7C-57-DF
   DHCP Enabled. . . . . . . . . . . : Yes
   IPv4 Address. . . . . . . . . . . : 192.168.1.20(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Lease Obtained. . . . . . . . . . : Monday, 12:04:11
   Lease Expires . . . . . . . . . . : Tuesday, 12:04:11
   Default Gateway . . . . . . . . . : 192.168.1.1
   DHCP Server . . . . . . . . . . . : 192.168.1.254
   DNS Servers . . . . . . . . . . . : 192.168.1.254
                                       8.8.8.8
```

What gets tested here: **Physical Address** is the MAC; **DHCP Server** is who assigned
the address; **Lease** is how long the address stays reserved for the client; **Default
Gateway** is who carries everything outside the subnet; **DNS Servers** is who resolves
names.

`ipconfig` with no switches only shows address, mask, and gateway — no MAC address and no
DHCP server there. That's a separate question in itself: "which command shows the MAC" →
`ipconfig /all`.

## macOS and Linux

```cli
$ ifconfig en0
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
        ether 3c:22:fb:1a:2b:0c
        inet 10.10.13.100 netmask 0xffffff80 broadcast 10.10.13.127
        inet6 fe80::14e2:1a3b:5c7d:9e1f%en0 prefixlen 64
```

macOS prints the mask **in hexadecimal**: `0xffffff80` = 255.255.255.128 = **/25**. This
is exactly the question the bank includes with an `en0` exhibit: from `0xffffff80` and
address 10.10.13.100, the subnet is 10.10.13.0/25, broadcast 10.10.13.127.

Conversion cheat sheet: `ff` = 255, `80` = 128 (/25), `c0` = 192 (/26), `e0` = 224 (/27),
`f0` = 240 (/28), `f8` = 248 (/29), `fc` = 252 (/30).

```cli
$ ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP
    link/ether 00:0c:29:3d:4e:5f brd ff:ff:ff:ff:ff:ff
    inet 172.16.5.44/24 brd 172.16.5.255 scope global dynamic eth0
$ ip route
default via 172.16.5.1 dev eth0
172.16.5.0/24 dev eth0 proto kernel scope link src 172.16.5.44
```

On Linux, the gateway does **not** live in the `ip addr` output — it's in the routing
table (`ip route`, the `default via` line). Another frequent detail in questions.

## Diagnosing from the Output

| What you see | Diagnosis |
|---|---|
| an address of `169.254.x.x` | DHCP never answered — server, VLAN, or relay issue |
| address present, no gateway | can't leave the subnet, everything local works |
| gateway in a different subnet | misconfiguration, outbound traffic won't work |
| DNS empty or unreachable | "works by IP, fails by name" |
| mask differs from neighbors | the node thinks part of its own subnet is external and sends traffic to the gateway (or the reverse) |
| `Media disconnected` | physical layer: cable, port, driver |

The verification sequence expected in troubleshooting questions:

1. `ipconfig /all` — is there a valid address at all.
2. `ping 127.0.0.1` — is the stack alive (this proves only that).
3. `ping <own address>` → `ping <gateway>` — does the segment work.
4. `ping 8.8.8.8` — is there routing to the outside.
5. `ping ya.ru` / `nslookup ya.ru` — does DNS work.

Splitting steps 4 and 5 is the essence of the classic conclusion: **IP connectivity
works, name resolution doesn't → it's a DNS problem**, not a network problem.

## Other Useful Commands

```cli
C:\> ipconfig /release        :: release the address
C:\> ipconfig /renew          :: request a new one
C:\> ipconfig /flushdns       :: clear the name cache
C:\> arp -a                   :: IP-to-MAC mappings
C:\> getmac                   :: adapter MAC addresses
C:\> route print              :: the host's routing table
C:\> tracert 8.8.8.8          :: hop-by-hop path (Linux/macOS — traceroute)
C:\> nslookup www.cisco.com   :: DNS check
```

> [!key] Remember
> Windows `tracert` sends ICMP Echo with an increasing TTL; Linux/macOS `traceroute`
> defaults to UDP on high ports. That's why they behave differently through a firewall —
> one gets through, the other doesn't.

## Worked Exhibit: Full Output and Diagnosis

The question gives the full output and asks you to find the problem:

```cli
C:\> ipconfig /all
Ethernet adapter Ethernet0:
   Physical Address. . . . . . . . . : B8-76-3F-7C-57-DF
   DHCP Enabled. . . . . . . . . . . : No
   IPv4 Address. . . . . . . . . . . : 192.168.1.20
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.2.1
   DNS Servers . . . . . . . . . . . : 192.168.1.254
```

Read it line by line: `DHCP Enabled: No` means the address was entered manually, so the
error was introduced by whoever configured it by hand, not by a server. Next, check the
networks: address `192.168.1.20/24` sits in network `192.168.1.0/24`, while gateway
`192.168.2.1` sits in `192.168.2.0/24` — a **different subnet**. The host won't be able
to get that gateway's MAC (see the IPv4 addressing chapter — same principle: the gateway
must be in its own subnet) — traffic outside the subnet won't go anywhere, while
everything inside `192.168.1.0/24` keeps working fine. The diagnosis rests on a single
mismatched line, not on the symptom "no internet" — which by itself says nothing about
the cause.

## Diagnosing DNS: Reading `nslookup` Line by Line

**Symptom.** `ping 8.8.8.8` succeeds, `ping cisco.com` returns "Ping request could not
find host."

```cli
C:\> nslookup cisco.com
Server:  UnKnown
Address:  192.168.1.254

*** UnKnown can't find cisco.com: Server failed
```

What to read here, in order: the `Server` / `Address` line is the **DNS server the
client queried**, not the address of the site; `Server failed` means the name server
responded but couldn't resolve the name (unlike a timeout, where the server doesn't
respond at all). Since ICMP to 8.8.8.8 gets through, routing is fine, so the problem is
either the DNS server itself (not resolving, not forwarding externally) or the correctness
of its address in the client's settings. Switch to a known-good public resolver and test
again:

```cli
C:\> nslookup cisco.com 8.8.8.8
Server:  dns.google
Address:  8.8.8.8

Non-authoritative answer:
Name:    cisco.com
Address: 72.163.4.185
```

Success against a third-party server and failure against the local one confirms: the
problem is specifically the internal DNS server, not the network or the client.

## Reading a Host's Routing Table: `route print` / `ip route`

```cli
C:\> route print
IPv4 Route Table
Network Destination     Netmask       Gateway         Interface      Metric
0.0.0.0                 0.0.0.0       192.168.1.1     192.168.1.20      25
192.168.1.0        255.255.255.0     On-link        192.168.1.20     281
```

The `0.0.0.0` / `0.0.0.0` line is the default route — the same meaning as `default via`
on Linux: "anything that doesn't match a more specific route goes through this gateway."
The `192.168.1.0` line with `Gateway: On-link` is the node's own subnet — traffic to it
goes out directly, with no gateway involved. If there's no default line at all, the node
physically cannot send anything outside its own subnet. When configuring manually,
Windows's GUI usually won't even let you save a gateway that isn't in the adapter's own
subnet — it warns immediately; but a configuration set another way (a script, or a DHCP
server with a misconfigured scope) can slip past that check, and in that case `route
print` is exactly what will show that there's no default route.

## What Gets Asked

- "Which command displays the MAC address on a Windows host?" — `ipconfig /all` (or
  `getmac`).
- "Refer to the exhibit… which subnet is configured on the en0 interface?" — convert the
  hex mask and compute the block.
- "A host has an APIPA address. What is the problem?" — DHCP is unreachable.
- "Ping to IP works, ping to name fails. What is wrong?" — DNS.
- "Where does a Linux host show its default gateway?" — in the routing table (`ip
  route`, the default line).
- "A statically configured host has an address and gateway in different subnets. What is
  the effect?" — traffic inside its own subnet works, traffic outside doesn't, because the
  node can't obtain that gateway's MAC.
- "An `nslookup` query returns 'Server failed' from the internal DNS server, but a query
  to a public resolver succeeds. Where is the problem?" — in the internal DNS server, not
  the network or the client.
- "Which line in `route print` or `ip route` represents the default route?" — `0.0.0.0
  0.0.0.0` on Windows, `default via ...` on Linux.

## Check Yourself

```check
?? macOS shows netmask 0xffffffc0. What prefix is that?
!! c0 = 192 → 255.255.255.192 → /26.
?? Which Windows command shows which server assigned the address via DHCP?
!! ipconfig /all — the DHCP Server line.
?? Ping to 8.8.8.8 works, ping to google.com doesn't. What do you fix?
!! DNS: the name server's address, its reachability, the cache (ipconfig /flushdns).
?? Where do you look for the default gateway on Linux?
!! In ip route — the "default via …" line; it's not in the ip addr output.
?? A client gets 169.254.12.9 and can only see neighbors with the same kind of address. Why?
!! It's APIPA: DHCP never answered, so nodes can only talk within the local link and have no gateway.
?? DHCP Enabled: No, address 192.168.1.20/24, gateway 192.168.2.1. What's wrong, and what will keep working?
!! The gateway is in a different subnet (192.168.2.0/24 instead of 192.168.1.0/24) — the node can't get its MAC, so outbound traffic won't work; connectivity within 192.168.1.0/24 will still work.
?? nslookup against the local DNS server returns Server failed, against 8.8.8.8 it succeeds. Where's the problem?
!! In the internal DNS server: the network and the client are fine, since a third-party resolver answers normally.
?? route print has no 0.0.0.0/0.0.0.0 line. What does that mean for the node?
!! No default route — the node can't send traffic outside its own subnet, even if a gateway is shown in ipconfig.
```
