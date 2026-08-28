---
title: Wireless Network Security
lead: WEP, WPA, WPA2, and WPA3, personal versus enterprise, what SAE is, and how to configure WPA2-PSK in the controller GUI.
---

## Why everything is harder over radio

On a wired network, an attacker needs physical access to a port. Over the air, frames are
available to anyone within range — which is why encryption in Wi-Fi isn't optional, it's a
baseline requirement, and a weak scheme is broken by passive eavesdropping alone.

## Evolution of the standards

| Standard | Year | Encryption | Integrity | Status |
|---|---|---|---|---|
| **WEP** | 1997 | RC4, static key | CRC-32 | broken, must not be used |
| **WPA** | 2003 | TKIP (RC4 with key rotation) | MIC | obsolete |
| **WPA2** | 2004 | **AES-CCMP** | CCMP | today's baseline minimum |
| **WPA3** | 2018 | AES-GCMP, **SAE** | GCMP | the modern choice |

What specifically gets asked:

- **WEP** — a static shared key and a weak initialization vector; the key can be recovered
  from captured traffic.
- **WPA** — a transitional fix for old hardware: still RC4, but the key changes on every
  packet (TKIP).
- **WPA2** — the first standard with real **AES**; this is the answer to "which standard
  uses AES."
- **WPA3** — replaces the four-way handshake with **SAE** (Simultaneous Authentication of
  Equals, "dragonfly"): offline brute forcing of a captured handshake no longer works, and
  forward secrecy is added. Plus **OWE** for open networks — encryption without a password.

## Personal and Enterprise

| | Personal (PSK) | Enterprise (802.1X) |
|---|---|---|
| Authenticates with | a shared network password | an account or certificate |
| Who verifies it | the AP/controller itself | a **RADIUS server** |
| Revoking one user's access | change the password for everyone | disable one account |
| Where it's used | home, guest, IoT | corporate networks |

In WPA3, these modes are called **WPA3-Personal** (SAE instead of PSK) and
**WPA3-Enterprise** (stronger cipher suites, optionally a 192-bit mode).

> [!key] Remember
> "Corporate network, access via employee accounts" → **WPA2/WPA3-Enterprise +
> RADIUS**. "Small network, one shared password" → **Personal (PSK/SAE)**.

## What doesn't actually provide security

Measures that look convincing in exam questions but aren't real protection:

- **Hiding the SSID** — the name is still sent when a client connects.
- **MAC filtering** — a MAC address is spoofed with a single command.
- **Reducing transmit power** — makes interception harder, but doesn't rule it out.
- **An open network with a portal (web auth)** — traffic before and after login is
  unencrypted (except with OWE).

Real measures: a strong encryption standard, 802.1X wherever accounts exist, a separate
guest VLAN, rogue-AP detection on the controller.

## Protecting the controller's management itself

Wireless security doesn't stop at the clients — the WLC itself is also managed over the
network, and the same logic of "turn off open protocols" that applies to an ordinary
router (see the device access chapter) applies here too: **Telnet and HTTP get disabled**,
leaving **SSH and HTTPS** — a controller's management sessions are no different from any
other in terms of exposure to plaintext interception.

## Configuring WPA2-PSK in the controller GUI

The sequence covered in screenshot-based questions:

1. **WLANs → Create New**: Profile Name and SSID, WLAN ID.
2. **General**: choose the Interface/Interface Group — the VLAN wireless clients live on.
3. **Security → Layer 2**: WPA+WPA2 (or WPA2/WPA3), set **WPA2 Policy** and **AES**,
   uncheck TKIP.
4. **Auth Key Mgmt**: **PSK**; enter the key (ASCII) below it, 8 to 63 characters long.
5. For Enterprise, choose **802.1X** instead of PSK and specify RADIUS on the
   **AAA Servers** tab.
6. **QoS**: Bronze for guests, Platinum for voice.
7. **General → Status: Enabled**, then save.

Verifying from the client side: the network is visible, the connection succeeds, and the
address comes from the right subnet.

## Guest network

A typical requirement in scenario questions: guests should reach the internet but not see
the internal network.

- a separate SSID → a separate dynamic interface → a **separate VLAN**;
- an ACL that permits guests only to reach the internet;
- web authentication (a portal) or WPA2-PSK with regular key rotation;
- a Bronze QoS profile, bandwidth limiting.

## Walkthrough: why offline brute forcing of WPA2-PSK is possible at all

Understanding one detail explains several questions about WPA2 versus WPA3 at once.

When connecting, the client and access point exchange a **four-way handshake** to jointly
derive a temporary session key from the shared password (PSK) and the handshake data. The
key detail: **the entire handshake exchange is sent over the air in the clear** — there's
no encryption yet at this stage; encryption is exactly what the handshake establishes.

```txt
1. Capture the 4-way handshake by passive eavesdropping (or provoke a client
   reconnect via deauthentication -- the exchange itself doesn't change).
2. Offline, with no further contact with the access point, try passwords from a
   dictionary: for each candidate, recompute the same cryptographic material and
   compare it against the captured handshake.
3. A match means the password has been recovered.
```

The consequence: **the attack happens entirely offline**, the access point never sees it
and has no way to block it (unlike online password guessing against a web form, where you
can limit the number of attempts). In the WPA2-Personal world, the only protection is a
password long and unpredictable enough that brute forcing takes an impractical amount of
time.

**WPA3 closes exactly this mechanism**, not brute forcing in general: SAE (the dragonfly
handshake) is designed so that a captured exchange alone isn't enough for offline password
guessing — every guess requires a **new** active interaction with the access point, which
can be detected and rate-limited. That's the actual content behind "WPA3 resists offline
brute forcing," not a vague "WPA3 encrypts more strongly."

## Diagnosis: WPA2 clients can't connect after a Layer 2 Security change

**Symptom.** After a WLAN security setting update, some older client devices stop
connecting to the network, even though they're entering the correct password.

**What to look at.** The set of ciphers permitted on the WLAN:

```cli
WLC# show wlan 5 | include WPA|TKIP|AES
  WPA2 Support.......................... Enabled
    WPA2 Encryption................. AES
```

**Conclusion.** The administrator removed **TKIP** support, leaving only AES (the correct
default practice, but with a consequence) — older devices whose Wi-Fi adapter or driver
only supports WPA/TKIP physically cannot negotiate encryption with the AP and never
complete the handshake at all, even though the password has nothing to do with it. This is
a classic security-versus-compatibility dilemma: TKIP is weaker and should be phased out,
but disabling it retroactively breaks connectivity for older hardware without warning —
the symptom looks like "wrong password," but the cause is the cipher suite, which the
client never even checks before the user types a password.

## Diagnosis: guests can see the internal network through an "isolated" SSID

**Symptom.** The guest VLAN is formally configured separately from the internal network,
but guest Wi-Fi users can still reach internal servers.

**What to look at.** The rule that's supposed to block inter-segment traffic, not just the
fact that the VLANs are separate:

```cli
R1# show access-lists GUEST-ISOLATION
Extended IP access list GUEST-ISOLATION
    10 permit udp any any eq 53
    20 permit ip any any            ! <- extra permit line at the end
```

**Conclusion.** A separate VLAN by itself **doesn't block** routing between networks — it
only creates a separate broadcast domain (see the VLAN chapter). Without an explicit deny
rule from the guest subnet to the internal ranges, applied on the routing device, guest
traffic is routed normally to anywhere, including the internal network. Here, the second
line, `permit ip any any`, permits literally everything except DNS — a typical mistake of
"the ACL shows the intended direction but doesn't actually isolate anything." A correct
configuration explicitly denies the internal ranges first, and only then permits everything
else (the internet):

```cfg
ip access-list extended GUEST-ISOLATION
 permit udp any any eq 53
 deny ip any 10.0.0.0 0.255.255.255
 permit ip any any
```

> [!key] Remember
> "Guest VLAN" and "guest isolation" aren't synonyms. A VLAN separates segments
> logically, but any route without an explicit deny can reconnect them — isolation comes
> from an ACL (or a separate VRF), not from the mere fact of being on a different VLAN.

## What gets asked

- "Which wireless security protocol uses AES?" — WPA2 (and WPA3 with GCMP).
- "Which authentication method requires a RADIUS server?" — WPA2/WPA3-Enterprise
  (802.1X).
- "What replaced the four-way handshake in WPA3?" — SAE.
- "Which two settings must be configured for WPA2-PSK on the WLC?" — Layer 2 Security
  WPA2 with AES, and the PSK itself.
- "Is hiding the SSID a security control?" — no.
- "Why is WEP not acceptable?" — a static key and a weak IV, recoverable from captured
  traffic.
- "Why can a WPA2-PSK password be attacked entirely offline?" — the four-way handshake is
  sent in the clear over the air, and the captured exchange alone is enough to test
  password candidates with no further contact with the access point.
- "Why does SAE in WPA3 resist offline dictionary attacks where PSK does not?" — every
  password guess in SAE requires a new active exchange with the access point, rather than
  being checkable against a single captured handshake.
- "Older client devices fail to connect after TKIP support is removed from a WLAN, even
  with the correct password. What is the cause?" — the devices don't support AES-only
  encryption negotiation; the problem isn't the password, it's the set of permitted
  ciphers.
- "A guest SSID is mapped to its own VLAN, but guest users can still reach internal
  servers. What is missing?" — an explicit deny ACL from the guest subnet to the internal
  ranges; a separate VLAN by itself doesn't block routing between segments.

## Check yourself

```check
?? Which standard first brought AES encryption to Wi-Fi?
!! WPA2 -- it introduced AES-CCMP in place of RC4.
?? How is WPA3-Personal better than WPA2-Personal with the same password?
!! SAE prevents offline brute forcing of the password from a captured handshake and provides forward secrecy.
?? Employees log in to Wi-Fi with their domain accounts. Which mode, and what's needed on the network?
!! WPA2/WPA3-Enterprise with 802.1X and a RADIUS server.
?? Does MAC address filtering actually help?
!! Practically not: a MAC address is trivially spoofed.
?? Where in the controller GUI do you select AES and PSK?
!! The Security -> Layer 2 tab: WPA2 Policy with AES, and Auth Key Mgmt = PSK.
?? Why is capturing the WPA2-PSK four-way handshake enough for offline password guessing?
!! The handshake exchange itself is sent in the clear, unencrypted; with it captured, an attacker tests password candidates locally, with no contact with the access point, so the AP never sees this activity.
?? After disabling TKIP on a WLAN, older devices with the correct password stopped connecting. Is the password the cause?
!! No: the device simply doesn't support AES-only negotiation -- the problem is the set of permitted ciphers, not the credentials entered.
?? A guest SSID is bound to its own VLAN, but guests can still reach internal servers. What's missing?
!! An explicit deny ACL from the guest subnet to the internal ranges -- a separate VLAN alone doesn't block routing between segments; filtering does.
```
