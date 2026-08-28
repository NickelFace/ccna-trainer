---
title: SNMP and Syslog
lead: Polling vs. traps, SNMP versions and why v3, syslog severity levels 0 through 7, and how to read a log line.
---

## SNMP: polling devices

Three roles:

- **Manager (NMS)** — the monitoring system that polls.
- **Agent** — the process on the device that responds.
- **MIB** — the agent's database of objects; each parameter is addressed by a numeric
  **OID**.

Operations:

| Operation | Who initiates | Meaning |
|---|---|---|
| `get` / `getnext` / `getbulk` | manager | read a value |
| `set` | manager | **change** a parameter on the device |
| `trap` | agent | report an event on its own, without being polled |
| `inform` | agent | the same, but with confirmation from the manager |

Ports: the agent listens on **UDP 161**, the manager receives traps on **UDP 162**.

> [!key] Remember
> A `trap` is initiated by the device, not by the monitoring system — this underlies
> questions like "how does the NMS learn about an interface failure without waiting for
> a poll." The only difference from `inform` is delivery confirmation.

## Versions

| Version | Authentication | Encryption |
|---|---|---|
| v1 | community string in plaintext | no |
| v2c | same, plus getbulk and inform | no |
| **v3** | users, HMAC | **yes** (AES/DES) |

The community string in v1/v2c is effectively a password sent in the clear; `RO` grants
read access, `RW` grants write access. Hence the correct answers to security questions:
**use v3**, and if v2c is unavoidable, restrict it with an ACL and never leave
`public`/`private` in place.

```cfg
! v2c — only barely acceptable, and only with an ACL
access-list 10 permit 10.0.0.50
snmp-server community R3adOnly RO 10
snmp-server host 10.0.0.50 version 2c R3adOnly
snmp-server enable traps

! v3 — the correct choice
snmp-server group MON v3 priv
snmp-server user nms MON v3 auth sha AuthPass priv aes 128 PrivPass
```

## Syslog: the event log

IOS log line format:

```txt
*Aug 19 09:14:31.204 AEST: %LINEPROTO-5-UPDOWN: Line protocol on
    Interface GigabitEthernet0/1, changed state to down
             │        │ │
             │        │ └─ event mnemonic
             │        └─── severity level
             └──────────── facility
```

Eight levels, from 0 to 7. Lower number means more severe:

| Level | Name | What falls into it |
|---:|---|---|
| 0 | Emergency | system is unusable |
| 1 | Alert | immediate action required |
| 2 | Critical | critical condition (overheating, unit failure) |
| 3 | Error | an error (interface in err-disabled) |
| 4 | Warning | a warning |
| 5 | **Notification** | a normal, significant event — an interface changing state |
| 6 | Informational | informational |
| 7 | Debugging | debug output |

A mnemonic for the order: **E**very **A**wesome **C**isco **E**ngineer **W**ill **N**eed
**I**ce cream **D**aily.

Setting a level means "this and everything more severe": `logging trap 4` sends levels
0–4.

```cfg
logging host 10.0.0.60
logging trap informational          ! levels 0–6 to the server
logging buffered 16384 debugging    ! local buffer
logging console warnings            ! console gets only 0–4
service timestamps log datetime msec localtime show-timezone
```

```cli
R1# show logging
Syslog logging: enabled
    Console logging: level warnings
    Buffer logging: level debugging, 214 messages logged
    Trap logging: level informational, host 10.0.0.60
```

The syslog port is **UDP 514**.

## Where messages go

| Destination | Command | Notes |
|---|---|---|
| Console | `logging console` | visible only in a console session |
| vty session | `terminal monitor` | **must be re-enabled in every session** |
| Local buffer | `logging buffered` | lost on reload |
| External server | `logging host` | the only option for storage and analysis |

Classic question: "I connected over SSH and don't see messages that show up on the
console" → needs the `terminal monitor` command.

## Walkthrough: a complete SNMP poll from request to response

The NMS wants to know the state of interface `GigabitEthernet0/1` on a router.

```txt
1. The NMS sends a GetRequest on UDP 161: "what's the value of OID
   1.3.6.1.2.1.2.2.1.8.<interface index>" (this is ifOperStatus — the interface's operational state)
2. The agent on the router looks up this OID in its MIB, finds the current value
3. The agent replies with GetResponse: value "1" (up) or "2" (down)
```

If the interface goes down **between** the NMS's scheduled polls, there's no way to find
out instantly through `get` — polling happens on a schedule (say, every 5 minutes), and
the NMS knows nothing until the next cycle. This is exactly what `trap` exists for: the
agent sends a short message about a specific event on its own, without being asked, the
moment it happens, rather than waiting to be polled. This leads to a direct practical
conclusion that gets tested: **polling gives you the full picture, but with a delay
until the next cycle; a trap gives instant notification, but only about the specific
event it's configured for** — the two models are used together, not as a substitute for
one another.

## Diagnosis: the NMS isn't receiving traps, even though SNMP is configured

**Symptom.** `snmp-server host` and `snmp-server enable traps` are configured on the
router, `show snmp` shows a growing count of sent packets, but the monitoring system
itself shows no events at all.

**What to check.** The path the trap UDP packets take to the NMS, including any ACLs
along the way:

```cli
R1# show access-lists 100 | include 162
    20 deny udp any any eq 162
```

**What was found.** There's an ACL somewhere between the router and the NMS that
**blocks** UDP port 162 — the exact port traps arrive on. The router is correctly
generating and sending the packets (the counter in `show snmp` keeps growing — as far as
the device is concerned, everything is fine), but they never reach their destination.
This is the same pattern already seen with syslog and other UDP services: the sender
gets no signal at all that the receiver never saw the messages — they just vanish
somewhere along the way. Diagnosis starts not with reconfiguring SNMP, but with checking
the packet's path: ACLs, firewall, the route to the NMS's address.

## Diagnosis: an SNMPv3 user can't authenticate

**Symptom.** The NMS is configured to poll a device over SNMPv3 with the given
credentials, but gets an authentication error on every attempt.

**What to check.** An exact match of the auth/priv protocols between the device's
configuration and the NMS's settings:

```cli
R1# show running-config | include snmp-server user
snmp-server user nms MON v3 auth sha AuthPass priv aes 128 PrivPass
```

**What was found.** On the device, the user is configured with `auth sha` (SHA) and
`priv aes 128`. If the NMS's polling profile specifies, say, `auth md5` instead of
`sha`, that hash algorithm mismatch breaks authentication completely, even if the
password itself (`AuthPass`) is entered identically. Unlike v1/v2c, where the only
secret is the community string, v3 has to agree on **several independent parameters**
at once (username, authentication protocol, authentication password, encryption
protocol, encryption password) — a mismatch on **any** one of them produces the exact
same uninformative authorization error, requiring a line-by-line comparison of the
configuration on both sides.

## What gets asked

- "Which SNMP operation is initiated by the agent?" — trap (or inform).
- "Which SNMP version provides encryption?" — v3.
- "What is the purpose of a community string?" — simple plaintext authentication in
  v1/v2c.
- "Which syslog level corresponds to an interface changing state?" — 5, notification.
- "What does logging trap 4 send?" — levels 0–4 inclusive.
- "Which port does syslog / SNMP use?" — UDP 514 / UDP 161 (traps 162).
- "Why does an SSH session not show log messages?" — `terminal monitor` hasn't been run.
- "Why can't polling alone provide instant notification of an interface failure?" —
  polling runs on a schedule, and the NMS only learns of an event that happened between
  cycles at the next poll; instant notification requires a trap.
- "An SNMP counter on the router shows traps being sent, but the NMS never receives them.
  What should be checked?" — the UDP packet's path to the NMS: an ACL or firewall
  blocking port 162 — the device gets no signal that delivery failed.
- "An SNMPv3 user fails authentication even with the correct password. What else must
  match between the device and the NMS?" — the authentication and encryption protocols
  (auth sha/md5, priv aes/des) — a mismatch on either one breaks authentication just
  like a wrong password would.

## Check yourself

```check
?? How does trap differ from get?
!! Trap is sent by the agent on its own when an event occurs; get is initiated by the monitoring system when polling.
?? Which SNMP version encrypts data, and how does it authenticate?
!! Version 3: users with HMAC authentication and AES/DES encryption.
?? What does the 5 in %LINEPROTO-5-UPDOWN mean?
!! The notification severity level.
?? logging trap 3 — which messages get sent to the server?
!! Levels 0, 1, 2, and 3 — this level and everything more severe.
?? You connected over SSH and don't see any log messages. What do you do?
!! Run terminal monitor in that session.
?? Why isn't polling alone enough to instantly learn that an interface went down?
!! Polling runs on a schedule; the NMS only learns of an event between cycles at the next scheduled get — instant notification requires a trap initiated by the device itself.
?? Show snmp shows a growing counter of sent traps, but the NMS never sees them at all. Where do you look?
!! Along the packet's path to the NMS — an ACL or firewall blocking UDP/162; the device sends traps and gets no signal that they never arrived.
?? An SNMPv3 user enters the correct password, but authentication still fails. What else needs to be checked besides the password?
!! The authentication and encryption protocols (auth sha/md5, priv aes/des) on the device and in the NMS profile — a mismatch on either produces the same error as a wrong password.
```
