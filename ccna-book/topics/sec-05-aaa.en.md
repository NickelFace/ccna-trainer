---
title: AAA, RADIUS, TACACS+, and 802.1X
lead: The three A's individually, how TACACS+ differs from RADIUS, and how 802.1X port authentication works.
---

## The three A's

| | Question | Example |
|---|---|---|
| **Authentication** | Who are you? | username and password, certificate, token |
| **Authorization** | What are you allowed to do? | privilege level, set of permitted commands, VLAN |
| **Accounting** | What did you do? | command log, session duration, traffic volume |

The distinction is asked about directly: "the user logged in" is authentication; "they
were only permitted show commands" is authorization; "every command entered is logged" is
accounting.

## RADIUS and TACACS+

| | RADIUS | TACACS+ |
|---|---|---|
| Standard | open (RFC) | Cisco |
| Transport | **UDP** 1812/1813 (or 1645/1646) | **TCP 49** |
| What's encrypted | only the password | **the entire packet** |
| A-A-A separation | authentication and authorization are **combined** | all three are **separate** |
| Typical use | user network access: 802.1X, Wi-Fi, VPN | device administration: who can enter which commands |

Selection mnemonic: **network access for users → RADIUS; equipment management →
TACACS+** (that needs per-command authorization, which RADIUS can't do).

```cfg
aaa new-model
!
radius server ISE
 address ipv4 10.0.0.80 auth-port 1812 acct-port 1813
 key R@diusKey
!
tacacs server TAC1
 address ipv4 10.0.0.81
 key T@cacsKey
!
aaa authentication login default group tacacs+ local
aaa authorization exec default group tacacs+ local
aaa accounting commands 15 default start-stop group tacacs+
```

> [!key] Remember
> The keyword **`local` at the end** is a fallback login method for when the server is
> unreachable. Without it, an AAA server failure means nobody can log in, including the
> administrator.

## 802.1X: port authentication

The port doesn't pass traffic until the device proves who it is.

Three roles:

- **Supplicant** — the client (the computer's OS, a phone);
- **Authenticator** — the switch or access point, acting as an intermediary;
- **Authentication server** — RADIUS (typically Cisco ISE).

Exchange: the client and server speak **EAP**, and the switch wraps EAP inside RADIUS.
Before successful authentication, **only EAPOL** passes through the port.

```cfg
aaa authentication dot1x default group radius
dot1x system-auth-control
!
interface GigabitEthernet1/0/5
 switchport mode access
 authentication port-control auto
 dot1x pae authenticator
```

Beyond simply granting access, the server can also return a **dynamic VLAN**, ACL, or QoS
profile — the device lands in exactly the network it's supposed to. For devices without a
supplicant (printers, cameras), use **MAB** (MAC Authentication Bypass) or a guest VLAN.

## Where this shows up in practice at the CCNA level

- Wi-Fi **WPA2/WPA3-Enterprise** — the same 802.1X, just over radio; on the WLC, RADIUS is
  selected under Security → AAA Servers.
- Administrator login to switches and routers — TACACS+ with per-command authorization.
- VPN access — RADIUS with MFA.

## Walkthrough: the full 802.1X exchange from cable connection to network access

```txt
1. Client plugs in the cable. Port is in the unauthorized state -- only EAPOL passes through.
2. Supplicant -> Authenticator: EAPOL-Start (client announces it's ready to authenticate)
3. Authenticator -> Supplicant: EAP-Request Identity
4. Supplicant -> Authenticator: EAP-Response Identity (e.g., username)
5. Authenticator wraps EAP inside a RADIUS Access-Request -> Authentication Server
6. Authentication Server and Supplicant exchange EAP inside RADIUS
   (the method depends on the EAP type: EAP-TLS -- certificates, PEAP -- username/password inside a TLS tunnel)
7. Authentication Server -> Authenticator: RADIUS Access-Accept
   (may carry VLAN assignment, ACL, session timeout -- RADIUS attributes)
8. Authenticator moves the port to authorized -- normal traffic starts flowing
```

The key detail for understanding the architecture: the **authenticator (the switch) never
validates the password itself and doesn't store any accounts** — it only relays EAP
messages between the supplicant and the authentication server, wrapping them in RADIUS.
All the validation logic lives on the server. This explains why switching the
authentication method (say, PEAP to EAP-TLS) requires changes on the client and the
server, but not on the switch itself — it sees the same EAP frames regardless of their
content.

## Diagnosis: 802.1X grants access to the wrong VLAN

**Symptom.** A device successfully passes 802.1X authentication (the port moves to
authorized), but ends up in the port's default VLAN instead of the expected corporate one.

**What to look at.** Whether the RADIUS server is returning VLAN assignment attributes in
the Access-Accept, and whether the switch is applying them:

```cli
SW1# show authentication sessions interface gi1/0/5
            Interface:  GigabitEthernet1/0/5
                 Status:  Authz Success
                    Vlan:  1
```

**Conclusion.** Authentication succeeded (`Authz Success`), but the VLAN stayed at the
default — which means either the RADIUS server isn't configured to send the
`Tunnel-Type`/`Tunnel-Medium-Type`/`Tunnel-Private-Group-ID` attributes (these are exactly
what carries the dynamic VLAN number in the Access-Accept), or the switch received them but
couldn't apply them (for instance, no VLAN with that number exists on this switch). That
splits the cause into two sides: first check the policy on the RADIUS server itself (the
authorization profile for this user/device), then check whether the target VLAN exists and
is active on the switch — exactly as in the VLAN chapter.

## Diagnosis: an administrator can't log in because the TACACS+ server is unreachable

**Symptom.** The primary TACACS+ server goes down (planned maintenance or a failure), and
no administrator can log in to the switches — not even the ones who could log in fine
before.

**What to look at.** The full `aaa authentication login` line, not just whether TACACS+ is
configured:

```cli
SW1# show running-config | include aaa authentication login
aaa authentication login default group tacacs+
```

**Conclusion.** The method list has **no `local`** at the end — when the `tacacs+` group is
unreachable, authentication simply fails outright, with no fallback method. This is exactly
the trap the callout above warns about: `group tacacs+ local` would mean "try TACACS+
first, and if the server is unreachable, fall back to the local database," while a bare
`group tacacs+` leaves no way back for anyone, including an administrator with console
access. The fix is to add a fallback method, but that can only be done if there's at least
one working way in (for example, via ROMMON, if there's truly no other option).

## What gets asked

- "Which protocol separates authentication and authorization?" — TACACS+.
- "Which protocol encrypts the entire packet?" — TACACS+ (RADIUS only encrypts the
  password).
- "Which transport and port does TACACS+ use?" — TCP 49.
- "What is the role of the supplicant/authenticator/authentication server?" — the client,
  the switch, RADIUS.
- "Which AAA element records what a user did?" — accounting.
- "What happens if the AAA server is unreachable and no local fallback is configured?" —
  login becomes impossible.
- "Does the switch itself validate the user's password during 802.1X?" — no, the switch
  only wraps EAP inside RADIUS and relays it between the supplicant and the server;
  validation happens entirely on the authentication server.
- "A device passes 802.1X authentication but ends up in the default VLAN instead of the
  expected one. What should be checked?" — whether the RADIUS server is sending the
  Tunnel-Type/Tunnel-Private-Group-ID attributes in the Access-Accept, and whether the
  specified VLAN exists on the switch.
- "Administrators cannot log in to switches after the TACACS+ server goes down. What is
  misconfigured?" — the `local` fallback method is missing from `aaa authentication
  login`.

## Check yourself

```check
?? You need to restrict the set of commands a support engineer can run on switches. Which protocol?
!! TACACS+ -- it supports per-command authorization and keeps the three A's separate.
?? What passes through an 802.1X port before authentication succeeds?
!! Only EAPOL frames; all other traffic is blocked.
?? What transport does RADIUS use, and exactly what does it encrypt?
!! UDP; only the password is encrypted, the rest of the packet is sent in the clear.
?? How do you connect a printer that has no supplicant to the network?
!! Via MAB -- MAC-address-based authentication -- or by placing the port in a guest VLAN.
?? Why put local last in the aaa authentication login command?
!! As a fallback: if the server is unreachable, you can still log in with a local account.
?? Does the switch itself check the user's password during 802.1X?
!! No -- it only relays EAP messages between the supplicant and the authentication server inside RADIUS; the server performs all the validation.
?? A device passed 802.1X (Authz Success) but stayed in the default VLAN instead of the expected one. Where do you look first?
!! First on the RADIUS server -- whether it's sending the Tunnel-Type/Tunnel-Private-Group-ID attributes in the Access-Accept; then on the switch -- whether the specified VLAN exists.
?? The TACACS+ server went down, and no administrator can log in to the switches. What's missing from aaa authentication login?
!! The local fallback method at the end of the list -- without it, the server being unreachable blocks login for everyone, including administrators.
```
