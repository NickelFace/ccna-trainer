---
title: Wireless Networking Basics
lead: Bands and channels, the nonoverlapping 1-6-11 rule, SSID, CSMA/CA, cell overlap, and the 802.11 standards — the physics and concepts, without controller configuration.
---

## Radio Is a Shared Medium

A switched wired Ethernet network gives every port its own collision domain and full
duplex. Radio can't do that: **all clients on the same channel share one medium and take
turns**, and in half duplex — an access point can't transmit and receive at the same
time.

That sets the rules of the game:

- **CSMA/CA** is used — "listen before you talk and avoid collisions": a station waits
  for a clear channel, backs off for a random interval, and only then transmits.
  Detecting a collision on the radio the way CSMA/CD does is impossible — a transmitter
  can't hear itself.
- Every frame is acknowledged with an ACK. No ACK means a retransmission, and
  retransmissions eat into airtime.
- The more clients on a channel, the less time each one gets: **throughput is divided**,
  not summed.

## Bands and Channels

| | 2.4 GHz | 5 GHz | 6 GHz (Wi-Fi 6E) |
|---|---|---|---|
| Nonoverlapping channels | **3** (1, 6, 11) | 20+ | even more |
| Range | longer | shorter | shortest |
| Penetration | better | worse | worse |
| Interference from household devices | a lot (microwaves, Bluetooth, baby monitors) | little | little |
| Channel width | 20 MHz | 20/40/80/160 MHz | up to 160 MHz |

In 2.4 GHz there are nominally 11–13 channels, but each one is 22 MHz wide with a 5 MHz
spacing — adjacent channels overlap. Exactly three don't overlap: **1, 6, and 11**. Any
other set (for example, 1-4-8) causes overlap and degradation.

> [!key] Remember
> "What should you do so 2.4 GHz access points don't interfere with each other" — assign
> neighboring access points channels **1, 6, 11** in a staggered pattern. This is the
> most common correct answer on interference.

### Two Types of Interference

- **Co-channel interference** — neighboring access points on the **same** channel. They
  hear each other and politely wait their turn — the airtime gets shared, throughput
  drops.
- **Adjacent channel interference** — access points on **partially overlapping** channels
  (1 and 3). They can't understand each other, but they still distort each other's
  signal — worse than co-channel interference.

## Cells and Overlap

The coverage area of a single access point is a **cell**. So a client doesn't lose
connectivity while moving, neighboring cells need to **overlap by roughly 10–15%** (for
voice, 15–20%), and neighboring cells must be on different channels.

```txt
   ch1        ch6        ch11
  (   (   ) (   (   ) (   (   )
      ~15% overlap between neighbors
```

Too little overlap causes "dead zones" and drops. Too much overlap on the same channel
causes co-channel interference and excess roaming.

Coverage terminology:

- **BSS** — one access point and its clients; its identifier, the **BSSID**, is the MAC
  address of the access point's radio interface.
- **ESS** — multiple access points sharing one SSID, combined into a single network;
  roaming works between them.
- **IBSS / ad hoc** — clients talking directly, with no access point.

## SSID

**The SSID is the network's name**, up to 32 characters, case-sensitive. What gets asked
about it, and what's actually true:

- The SSID **logically separates** wireless networks: the client chooses which one to
  connect to.
- A single SSID can be served by multiple access points (that's what an ESS is) — and is
  usually mapped to a specific VLAN on the wired side.
- An access point **advertises** its SSID in beacon frames; broadcasting can be disabled
  (hidden SSID), but that isn't a security measure — the name is still visible in a
  client's association frames.
- The SSID does **not** encrypt traffic and does **not** authenticate the user — that's
  the job of WPA2/WPA3.

> [!trap] Trap
> Options like "the SSID encrypts traffic," "the SSID provides security," or "the SSID
> must be unique on every access point" are all wrong. There's one network name for the
> whole ESS.

## 802.11 Standards

| Standard | Marketing name | Band | Speed order of magnitude |
|---|---|---|---|
| 802.11b | — | 2.4 GHz | 11 Mbps |
| 802.11a | — | 5 GHz | 54 Mbps |
| 802.11g | — | 2.4 GHz | 54 Mbps, backward-compatible with b |
| 802.11n | Wi-Fi 4 | 2.4 and 5 GHz | hundreds of Mbps, MIMO |
| 802.11ac | Wi-Fi 5 | 5 GHz | Gbps, wide channels |
| 802.11ax | Wi-Fi 6/6E | 2.4/5/6 GHz | efficiency in dense environments, OFDMA |

The exact numbers matter less than the logic: **backward compatibility costs speed**.
One 802.11b client on an 802.11g network forces the access point to enable protection
mechanisms, and throughput drops for everyone. Hence the recommendation to "spread access
points across channels 1-6-11 in an 802.11b/g design and avoid mixing old standards where
possible."

## What Affects Signal Quality

- **RSSI** — received signal level in dBm; closer to zero is better (−45 is good, −80 is
  bad).
- **SNR** — signal-to-noise ratio in dB; 20 dB or better is acceptable for data, 25 dB or
  better for voice.
- **Attenuation** from walls, metal, mirrors, water; **reflection** and **multipath**.
- **Transmit power** — cranking it up without limit is harmful: the access point can
  "shout" to the client, but a weak client can't shout back, and the interference zone
  for neighboring access points grows.
- **Antenna type**: omnidirectional for even coverage, directional (yagi, patch) for
  range and a narrow sector — for example, a bridge link between buildings.

## Designing Coverage

1. **Site survey** — assess where access points are needed, what the walls are like,
   where interference sources are.
2. Place access points so neighboring cells overlap and don't share a channel.
3. Verify after installation (post-deployment survey): signal levels, SNR, roaming.

"Just put one powerful access point per floor" is a classic wrong answer — coverage will
technically exist, but capacity and quality won't.

## Troubleshooting: Strong Signal, Low Throughput

**Symptom.** A client sits right next to the access point, the signal indicator reads
"excellent," but file-transfer speed is noticeably lower than for peers on another floor.

**What to check.** Not just signal level (RSSI), but also how many **other** clients are
sharing the channel, and whether there's a neighboring access point on the same
frequency:

```txt
Client:        RSSI −42 dBm, SNR 38 dB    (excellent signal)
On channel 6:  12 active clients on its own access point
               + a neighboring access point on another floor, also on channel 6, RSSI −60 dBm from it
```

**What we found.** A strong signal says nothing about **airtime utilization**. There are
two causes of the slowdown here: first, 12 clients on the same access point are
physically sharing one radio medium in turns (CSMA/CA isn't parallel transmission, it's
sequential); second, the access point on the other floor on the **same** channel 6
creates co-channel interference — both access points hear each other and politely wait
their turn, even though they serve different clients. The exam-level fix isn't "increase
power" (this isn't a coverage problem) — it's to redesign the channel plan between
floors, and, if Wi-Fi 6 is in play, enable OFDMA for more efficient time-sharing between
clients.

> [!trap] Trap
> "The signal is excellent — Wi-Fi should be fast" is the single most common wrong
> intuition in this topic. RSSI only shows signal strength, not whether the medium is
> free. A slow network with a strong signal almost always means a congested channel, not
> a coverage problem.

## Troubleshooting: Wi-Fi Calls Drop While Walking, Not While Stationary

**Symptom.** A Wi-Fi voice call works fine while the user stays put, and drops as soon as
they walk down the hallway between access points.

**What to check.** How much neighboring cells actually overlap in practice, not on paper:

```txt
Access point A: channel 1, reliable coverage — up to the middle of the hallway
Access point B: channel 6, reliable coverage — starts past the middle of the hallway
Overlap between zones: ~3%
```

**What we found.** Voice traffic needs **15–20%** cell overlap, not the roughly 10%
that's enough for data: the client needs enough time to discover access point B and roam
to it while access point A's signal is still holding, otherwise there's a brief gap with
no coverage at all — inaudible on background file sync, but heard as a dropped call on a
voice conversation. That's exactly the practical reasoning behind the "15–20% for voice"
rule: it isn't margin on paper, it's the time the client actually needs to complete the
roaming process.

## Worked Problem: Channel Plan for a Hallway of Three Access Points

Three access points in a row along one hallway, each one's coverage noticeably
overlapping its neighbor's (but not the one two doors down). How many unique 2.4 GHz
channels are needed, and how should they be assigned?

```txt
[ AP1 ] ---- [ AP2 ] ---- [ AP3 ]
  ch1          ch6          ch1
```

**Two** channels out of the available three (1, 6, 11) are enough, as long as the access
points are in a straight line: AP1 and AP3's zones don't touch directly, so they can be
given the same channel with no co-channel interference between them, while AP2 must get a
different channel so it doesn't conflict with both neighbors at once. In a denser grid
(several parallel hallways, floors stacked on top of each other) all three channels are
needed in a staggered pattern, and wherever there are more access points than channels,
some co-channel interference becomes an unavoidable cost of density — solved not by
channel selection anymore, but by lowering access point power to shrink the zone where
they can hear each other.

## What Gets Asked

- "What is the role of nonoverlapping channels?" — eliminating mutual interference
  between neighboring access points in 2.4 GHz.
- "What is a recommended approach to avoid co-channel congestion?" — assign channels 1,
  6, 11 to neighboring access points.
- "What are two characteristics / functions of an SSID?" — network name, logical
  separation of WLANs, advertised in beacons; it doesn't encrypt or authenticate.
- "Which two standard designs are recommended for new coverage cells?" — overlapping
  neighboring cells (10–15%) and different, nonoverlapping channels.
- "Which design element is a best practice when deploying 802.11b?" — channels 1-6-11.
- "What is a characteristic of encryption in wireless networks?" — encryption protects
  the contents of a frame over the air, but doesn't hide the fact that a transmission
  happened and doesn't replace authentication.
- "A client reports excellent signal strength but poor throughput. What is the most
  likely cause?" — a congested channel (many clients and/or co-channel interference from
  a neighboring access point), not a weak signal.
- "Voice calls drop while roaming between access points but are stable when stationary.
  What should be adjusted?" — increase neighboring cell overlap to the recommended
  15–20% for voice traffic.
- "Two access points are placed so their cells do not touch, with a third AP between
  them. How many nonoverlapping channels are strictly required?" — two: the two outer
  access points can share the same channel, since their zones don't touch directly.

## Check Yourself

```check
?? How many nonoverlapping channels are there in 2.4 GHz, and which ones?
!! Three: 1, 6, and 11.
?? Two neighboring access points are both running on channel 6. What kind of interference is that, and what happens?
!! Co-channel interference: the access points hear each other and share the airtime in turns — throughput drops for their clients.
?? What overlap between cells is considered correct for seamless roaming?
!! Roughly 10–15% (15–20% for voice), with different channels on neighboring cells.
?? Is a hidden SSID a security measure?
!! No: the name is still transmitted during client association and is easy to capture; security comes from WPA2/WPA3.
?? Why is simply increasing an access point's power a bad fix for a coverage problem?
!! A client with a weak transmitter still can't "shout" back far enough, and the interference zone for neighboring access points grows.
?? Why does Wi-Fi use CSMA/CA instead of CSMA/CD?
!! A transmitter can't hear the medium while it's transmitting and can't detect a collision — so it has to avoid one in advance and acknowledge every frame instead.
?? A client next to the access point shows RSSI −42 dBm (excellent signal), but throughput is low. First hypothesis?
!! A congested channel: many clients on that access point, or co-channel interference from a neighboring access point on the same channel — a strong signal doesn't mean free airtime.
?? Wi-Fi voice calls drop while walking between access points, though everything is stable while stationary. What should change?
!! Increase neighboring cell overlap to 15–20% (the norm for voice) so the client has time to roam to the new access point before losing the old one's signal.
?? Three access points sit in a straight line along a hallway, and the outer two zones don't touch. What's the minimum number of channels needed?
!! Two: the outer access points (1 and 3) can share the same channel, and the middle one gets a different channel so it doesn't conflict with both neighbors at once.
```
