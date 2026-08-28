---
title: NTP and Accurate Time
lead: Why a network needs a shared clock, what stratum means, client, server, and symmetric modes, and how to read show ntp status.
---

## Why time is infrastructure

Without a shared clock, a network becomes impossible to troubleshoot: logs from
different devices don't line up into a single picture, certificates "expire" early,
Kerberos fails, and an incident investigation turns into guesswork.

That's why NTP isn't a nice-to-have but a foundational service, and questions about it
always circle back to the same things: **why** it's needed, **what roles** exist, and
**how to verify** it.

## Stratum

Stratum is the distance from a reference time source:

| Stratum | What it is |
|---:|---|
| 0 | the reference itself: an atomic clock, a GPS receiver (not part of the network) |
| 1 | a server connected directly to a reference |
| 2 | a device synchronized with a stratum 1 source |
| … | each subsequent stratum is one hop further |
| 16 | **unsynchronized**, its time can't be trusted |

A lower stratum means a more authoritative source. A value of 16 in the output means
synchronization never happened.

Transport is **UDP 123**.

## Roles and configuration

```cfg
! Client: synchronize with an external server
ntp server 216.239.35.0
ntp server 10.0.0.10 prefer

! Own time source, when reaching outside isn't possible
ntp master 3

! Authentication — so nobody can feed in fake time
ntp authenticate
ntp authentication-key 1 md5 S3cretKey
ntp trusted-key 1
ntp server 10.0.0.10 key 1

! Time zone and daylight saving
clock timezone AEST 10 0
clock summer-time AEDT recurring
```

If NTP is unavailable for some reason, the time can also be set manually, right from
privileged (EXEC) mode — not from configuration mode:

```cli
R1# clock set 00:00:00 1 January 2020
```

`clock timezone` and `clock summer-time` only change how the time is **displayed**;
`clock set` changes the system clock itself. It's a manual, one-time setting — it
doesn't synchronize with other devices and will "drift" without NTP just like any clock
that never gets checked against a reference.

A useful fact that gets asked about: devices keep their internal time in **UTC**, and
the time zone is only applied for display. That's what makes logs from different sites
comparable.

## Verification

```cli
R1# show ntp status
Clock is synchronized, stratum 3, reference is 10.0.0.10
nominal freq is 250.0000 Hz, actual freq is 249.9999 Hz, precision is 2**18
reference time is E9A3B2C1.7C4D5E00 (09:14:25.486 UTC Wed Aug 19 2026)

R1# show ntp associations
  address         ref clock       st   when   poll reach  delay  offset   disp
*~10.0.0.10       216.239.35.0     2     34     64   377  1.234   0.045  0.512
 ~10.0.0.11       216.239.35.4     2     41     64   377  1.512  -0.031  0.688
* master (synced), ~ configured

R1# show clock detail
09:14:31.204 AEST Wed Aug 19 2026
Time source is NTP
```

How to read it:

- `Clock is synchronized` is the key phrase; `unsynchronized` means a source wasn't
  found or wasn't accepted.
- `*` in `show ntp associations` marks the server currently synchronized with.
- `reach 377` (octal, all eight of the last polls succeeded) means the link is stable.
- `Time source is NTP` in `show clock` means the time came from NTP, not a manual
  setting (`Time source is user configuration`).

## Tying it to logs

The whole point of this topic shows up in syslog: without NTP, every device sets its own
time, and there's no way to reconstruct the actual order of events.

```cfg
service timestamps log datetime msec localtime show-timezone
service timestamps debug datetime msec
```

These commands make IOS stamp a full date and time on every log line — combined with
NTP, that's what gives you logs you can actually compare.

## Walkthrough: why an incident investigation falls apart without NTP

Two switches with no NTP, each running its own internal clock, drifted by a few minutes:

```txt
SW1 (clock running 3 min fast): 09:14:31 — %LINEPROTO-5-UPDOWN: Gi0/1 down
SW2 (clock running 2 min slow): 09:09:52 — %SW_MATM-4-MACFLAP_NOTIF: MAC flapping detected
```

Based on the timestamps, it looks like MAC flapping happened on SW2 first (at 09:09),
and only six minutes later (at 09:14) did the link on SW1 go down — as if these were two
unrelated events. In reality, SW1's clock is 3 minutes fast and SW2's is 2 minutes slow,
so the **actual** sequence is the reverse: the link on SW1 went down first, which
triggered a topology recalculation and the resulting MAC flapping on SW2 — related
events end up looking separate and out of order. With NTP enabled, both logs use the
same time source, and the actual order of events can be reconstructed unambiguously —
this is exactly the practical reason NTP gets deployed in the first place, well ahead of
the more formal considerations around certificates and Kerberos.

## Diagnosis: NTP is configured, but `show ntp status` shows unsynchronized

**Symptom.** `ntp server 10.0.0.10` is configured, the device has been up for over an
hour, but `show ntp status` still shows `Clock is unsynchronized`.

**What to check.** Whether NTP packets are actually making the round trip to the server
and back at all:

```cli
R1# show ntp associations
  address         ref clock       st   when   poll reach  delay  offset   disp
 ~10.0.0.10       .INIT.           16    -      64    0    0.000   0.000  15937.

R1# ping 10.0.0.10
Success rate is 100 percent (5/5)
```

**What was found.** `ref clock: .INIT.` and `reach 0` mean the device has never gotten a
successful reply from this server, even though a plain `ping` (ICMP) to it works. Since
L3 connectivity is confirmed, and NTP still isn't getting any replies, the issue is
either **UDP/123** specifically being blocked somewhere along the path (an ACL or
firewall that lets ICMP through but drops this particular port), or authentication: if
`ntp authenticate` is enabled on the client with a key that's missing or doesn't match
the server, the server does respond, but the client **discards** the reply as untrusted
(since it can't authenticate it) — from the outside this looks identical to no response
at all. `reach 0` with a working ping is the signal to check exactly these two things,
rather than re-checking the server's address for the tenth time.

> [!trap] Trap
> A successful `ping` to an NTP server tells you nothing about NTP itself — it only
> confirms ICMP/L3, the same principle that applies to diagnosing any other UDP service
> (DNS, SNMP, TFTP): each one has to be checked on its own, with its own protocol, not
> with one generic ping.

## What gets asked

- "What is the function of NTP?" — synchronizing the clocks of network devices.
- "What does stratum indicate?" — distance from the reference time source.
- "Which stratum means unsynchronized?" — 16.
- "Which command makes a router an authoritative time source?" — `ntp master <stratum>`.
- "Why is time synchronization important?" — accurate log timestamps, and correct
  operation of certificates and authentication.
- "Which port does NTP use?" — UDP 123.
- "Logs from two switches without NTP appear to show unrelated events in a confusing
  order. What is the actual cause once NTP is enabled?" — the devices' internal clocks
  had drifted apart; once synchronized, the actual order of events on a shared timeline
  can turn out to be the exact opposite of what the mismatched timestamps suggested.
- "`show ntp associations` shows `reach 0` for a configured server, even though `ping` to
  that server succeeds. What should be checked?" — whether UDP/123 specifically is
  blocked along the path, and whether the authentication key (`ntp authenticate`)
  matches, if enabled — ICMP checks neither.
- "A client with NTP authentication enabled receives responses from the server but never
  synchronizes. Why?" — the reply fails key verification (not set, doesn't match, or not
  marked `trusted-key`), and the client discards it as untrusted.

## Check yourself

```check
?? What does stratum 16 mean in the output?
!! The device is unsynchronized; its time can't be trusted.
?? Which command makes a router a time source for everything else?
!! ntp master <stratum>.
?? In which time zone do devices store time internally?
!! UTC; the time zone is only applied at display time.
?? What does the asterisk in show ntp associations indicate?
!! The server the device is currently synchronized with.
?? Why does NTP matter for incident investigations?
!! Only a shared clock lets you assemble logs from different devices into one coherent timeline.
?? SW1's clock runs fast, SW2's runs slow. Based on the timestamps, the event on SW2 looks earlier than the one on SW1. Can you trust that ordering without NTP?
!! No — clock drift between devices can completely invert the apparent order of events; only a single shared time source can reconstruct the actual sequence.
?? Show ntp associations shows reach 0 and ref clock .INIT. for a configured server, while ping to it succeeds. What does that tell you?
!! That NTP packets (UDP/123) aren't arriving or are being dropped — either the port is blocked along the path, or the authentication key doesn't match; a plain ping doesn't check either.
?? A client with ntp authenticate gets responses from the server but never synchronizes. What's the likely cause?
!! The reply fails key verification — the key isn't set, doesn't match, or isn't marked trusted-key — so the client discards it as untrusted, even though the response itself arrived.
```
