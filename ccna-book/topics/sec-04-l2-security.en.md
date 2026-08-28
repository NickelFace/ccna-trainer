---
title: Layer 2 Security
lead: Port security, DHCP snooping, and Dynamic ARP Inspection -- three mechanisms against three classic attacks inside a segment.
---

## Three attacks, three responses

| Attack | What the attacker does | Defense mechanism |
|---|---|---|
| **MAC flooding** | floods the switch with fake MAC addresses, overflowing the table and forcing the switch to flood all traffic | **port security** |
| **Rogue DHCP** | stands up its own DHCP server and presents itself as the gateway | **DHCP snooping** |
| **ARP spoofing** | answers ARP requests with someone else's address and inserts itself into the exchange | **Dynamic ARP Inspection** |

All three operate inside a single segment, where neither an ACL nor a firewall can help --
the traffic never reaches them.

## Port security

Restricts **how many** and **which** MAC addresses are allowed on a port.

```cfg
interface GigabitEthernet1/0/5
 switchport mode access
 switchport port-security
 switchport port-security maximum 2
 switchport port-security mac-address sticky
 switchport port-security violation restrict
 switchport port-security aging time 60
```

- `maximum` — how many addresses are allowed (a port with a phone and a PC behind it
  needs 2–3).
- `mac-address sticky` — the switch learns the address itself and writes it into the
  configuration as static; after `write memory` it survives a reload.
- The port **must be explicitly access or trunk**: port security can't be enabled on a
  dynamic (DTP) port.

Violation modes — a table that's asked about almost every time:

| Mode | Violating traffic | Port | Syslog/SNMP | Counter |
|---|---|---|---|---|
| **protect** | dropped | stays up | no | no |
| **restrict** | dropped | stays up | **yes** | **yes** |
| **shutdown** (default) | -- | **err-disabled** | yes | yes |

```cli
SW1# show port-security interface gigabitethernet1/0/5
Port Security              : Enabled
Port Status                : Secure-shutdown
Violation Mode             : Shutdown
Maximum MAC Addresses      : 2
Total MAC Addresses        : 2
Last Source Address:Vlan   : 0050.7966.6810:10
Security Violation Count   : 1
```

After a violation, the port is brought back up manually (`shutdown` / `no shutdown`) or
automatically via `errdisable recovery cause psecure-violation`.

## DHCP snooping

The switch starts parsing DHCP messages and splits ports into trusted and untrusted.

```cfg
ip dhcp snooping
ip dhcp snooping vlan 10,20
no ip dhcp snooping information option        ! often needed when there's no relay agent
!
interface GigabitEthernet1/0/24
 description uplink to distribution
 ip dhcp snooping trust
!
interface range gigabitethernet1/0/1 - 20
 ip dhcp snooping limit rate 10
```

Rules:

- **Trusted** ports are the ones behind a legitimate server or the path to one (uplinks).
- On **untrusted** ports, server messages are dropped — **Offer, Ack, NAK**: a client
  behind such a port can only ask, never answer.
- A side effect is the **binding table**: MAC ↔ IP ↔ port ↔ VLAN mappings built from
  actual leases.

```cli
SW1# show ip dhcp snooping binding
MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface
00:50:79:66:68:00   192.168.10.21    85321       dhcp-snooping   10   Gi1/0/5
```

## Dynamic ARP Inspection

DAI checks every ARP packet on an untrusted port against **that same binding table**. If a
device claims 192.168.10.1 belongs to its MAC address, but the table says otherwise, the
packet is dropped.

```cfg
ip arp inspection vlan 10,20
!
interface GigabitEthernet1/0/24
 ip arp inspection trust
!
! for devices with a static address that aren't in the binding table
arp access-list STATIC-HOSTS
 permit ip host 192.168.10.50 mac host 0050.7966.6899
ip arp inspection filter STATIC-HOSTS vlan 10
```

> [!key] Remember
> **DAI is useless without DHCP snooping** — it has nowhere to get the mapping table from.
> On questions like "what must be enabled before DAI," the answer is always DHCP snooping
> (or a static ARP ACL for hosts with static addressing).

## What else belongs to L2 security

- **BPDU guard** and **root guard** — from the STP chapter: protect the tree from a rogue
  switch.
- **Disabling unused ports** and moving them to an unused VLAN.
- **A dedicated native VLAN** — against VLAN hopping via double tagging.
- **`switchport nonegotiate`** — against switch spoofing via DTP.
- **802.1X** — device authentication before network access is granted (see the AAA
  chapter).

## Attack walkthrough: rogue DHCP plus ARP spoofing as a combined traffic-interception chain

The classic MITM scenario inside a segment is built from two steps in sequence, and each
one is closed by a different mechanism — understanding the pair as a unit is a common exam
question.

**Step 1 — rogue DHCP.** The attacker stands up a DHCP server and responds faster than the
legitimate one, presenting itself as both gateway and DNS server. Without DHCP snooping,
the client is equally likely to get an address from the real server or the fake one — both
Offer messages look identical to the client. **DHCP snooping** solves this not by
inspecting the response content, but topologically: server messages are only accepted from
trusted ports, and nobody made the attacker's port trusted.

**Step 2 — ARP spoofing.** Even if the client got the correct gateway address from the
real DHCP server, the attacker can then send forged ARP replies: "the gateway's IP belongs
to my MAC." The client updates its ARP cache and starts sending all outbound traffic to
the attacker instead of the real gateway — classic ARP spoofing / ARP cache poisoning.
**DAI** stops this at the switch level: any ARP reply from an untrusted port is checked
against the binding table (or a static ARP ACL), and a claimed IP-to-MAC mapping that
doesn't match the already-known legitimate one is dropped before it reaches the victim.

**The takeaway that gets tested.** Both steps of the attack happen on the same segment, but
they're stopped by two **different, independent** mechanisms — disabling only DHCP
snooping while leaving DAI enabled won't stop ARP spoofing using a statically configured
(not DHCP-assigned) attacker IP address, and vice versa. On top of that, DAI **depends on**
DHCP snooping (see the callout above) — so the correct enabling order is: DHCP snooping
first, to build the binding table, then DAI, which relies on it.

## Diagnosis: a legitimate server with a static IP can't reach anyone

**Symptom.** After enabling Dynamic ARP Inspection on a VLAN, a server with a manually
assigned address (not via DHCP) completely loses connectivity to the rest of the network —
even though it worked before.

**What to look at.** Whether DAI has anywhere to learn about this specific address from:

```cli
SW1# show ip dhcp snooping binding | include 192.168.10.50
```

**Conclusion.** Empty — and that's expected: the binding table is built **only** from
actual DHCP leases, and this server got its address by some other means. DAI, enabled on
this server's VLAN, checks every one of its ARP packets against a table that simply has no
entry for it, and drops everything as potential spoofing. The fix isn't to disable DAI —
it's to explicitly permit this address via a static **ARP ACL**, as shown in the
configuration above (`arp access-list` + `ip arp inspection filter`): for hosts like this,
DAI checks the packet against the ACL instead of the dynamic table.

> [!trap] Trap
> "DAI broke the network, so disable it" is almost always the wrong exam answer. The right
> one is to configure an exception (ARP ACL) for hosts that legitimately don't participate
> in DHCP, not to remove the protection entirely.

## Diagnosis: clients stop getting addresses right after DHCP snooping is enabled

**Symptom.** `ip dhcp snooping` was enabled and the right VLANs added, expecting only
protection against rogue DHCP — but instead, new clients stop getting addresses entirely,
including ones talking to the real, legitimate server.

**What to look at.** Whether the port carrying replies from the real server is marked
trusted:

```cli
SW1# show ip dhcp snooping
Switch DHCP snooping is enabled
DHCP snooping is configured on following VLANs: 10,20
Interface              Trusted     Rate limit (pps)
------------------------ ------- ----------------
GigabitEthernet1/0/24    no       unlimited
```

**Conclusion.** The uplink toward the real DHCP server was left **untrusted**
(`Trusted: no`) — and DHCP snooping treats **all** ports as untrusted by default until the
administrator explicitly marks the right ones. On an untrusted port, exactly the server
messages (Offer, Ack, NAK) get dropped — meaning the switch in this configuration cuts off
the legitimate server's replies the same way it would cut off a rogue DHCP server's,
because to the switch it's the same case: "a server is answering from a port that isn't
trusted." Fixed with one command on the right port:

```cfg
interface GigabitEthernet1/0/24
 ip dhcp snooping trust
```

> [!key] Remember
> A forgotten `ip dhcp snooping trust` on the uplink is the most common cause of "enabled
> rogue DHCP protection and broke DHCP entirely." The trusted port must be assigned
> explicitly — DHCP snooping doesn't guess where the server is from the topology on its
> own.

## What gets asked

- "Which violation mode drops traffic and sends a log message but keeps the port up?" —
  restrict.
- "What is the default violation mode?" — shutdown.
- "Which feature builds the binding table used by DAI?" — DHCP snooping.
- "Which DHCP messages are dropped on untrusted ports?" — server messages: Offer, Ack, NAK.
- "What does sticky learning do?" — a learned MAC address gets written into the
  configuration as static.
- "Which attack does port security mitigate?" — MAC flooding (and connecting an
  unauthorized device).
- "After enabling DHCP snooping, legitimate clients stop receiving IP addresses. What is
  the most likely misconfiguration?" — the port toward the real DHCP server wasn't marked
  trusted (`ip dhcp snooping trust`); all ports are untrusted by default.
- "A statically addressed server loses connectivity after DAI is enabled on its VLAN.
  What is the correct fix?" — add a static ARP ACL for that address and apply it via
  `ip arp inspection filter`, rather than disabling DAI.
- "Which two mechanisms together stop a combined rogue-DHCP-plus-ARP-spoofing attack, and
  in what order should they be enabled?" — DHCP snooping (first, builds the binding table)
  and DAI (second, uses that table to check ARP) — both are needed, and one without the
  other doesn't close both parts of the attack.

## Check yourself

```check
?? A port went err-disabled after a second device was connected. Which violation mode is configured?
!! shutdown -- also the default mode.
?? Which DHCP messages will the switch drop on an untrusted port?
!! Server messages: Offer, Ack, and NAK.
?? What needs to be enabled for Dynamic ARP Inspection to work?
!! DHCP snooping -- it builds the binding table that DAI uses to check ARP.
?? A port has an IP phone and a PC behind it. What's a reasonable maximum value?
!! Two to three: the phone in the voice VLAN and the computer in the data VLAN.
?? How does protect differ from restrict?
!! Both drop the violating traffic, but restrict also logs it and counts the violations.
?? After enabling DAI on a VLAN, a server with a static IP lost connectivity to everyone. Should you disable DAI?
!! No: add its address to a static ARP ACL and apply it via ip arp inspection filter -- for hosts like this, DAI checks the packet against the ACL instead of the binding table, which has no static entries.
?? ip dhcp snooping was enabled globally, but clients stopped getting addresses even from the real server. What was forgotten?
!! Marking the port toward the real DHCP server as trusted (ip dhcp snooping trust) -- by default all ports are untrusted, and server replies from them are dropped just like rogue DHCP would be.
?? An attacker first stands up a rogue DHCP server, then starts ARP spoofing. Does the same mechanism stop both steps?
!! No: DHCP snooping stops the rogue DHCP (via trusted ports), DAI stops the ARP spoofing (by checking ARP against the binding table); DAI also depends on DHCP snooping and is enabled after it.
```
