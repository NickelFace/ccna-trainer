---
title: VPN and IPsec
lead: Site-to-site versus remote-access, what IPsec provides, why IKE matters, how tunnel mode differs from transport mode, and where GRE fits in.
---

## Why VPN

A link over the internet is cheap, but exposed: traffic can be seen and can be tampered
with. A VPN turns an untrusted network into a private one — data is encrypted entering the
tunnel and decrypted leaving it.

Two scenarios, and you're always asked to tell them apart:

| | Site-to-site | Remote access |
|---|---|---|
| Who connects | two networks (branch ↔ data center) | a single user ↔ a network |
| Where the tunnel sits | between routers/firewalls | between the user's device and a gateway |
| Client needed | no, users aren't even aware of it | yes: AnyConnect/Secure Client or a browser |
| Technologies | IPsec, GRE over IPsec, DMVPN | IPsec, **SSL/TLS VPN** |

Remote access over SSL/TLS is convenient because it works from any network over port 443 —
exactly where IPsec often gets blocked.

## What IPsec provides

Four properties that get asked about together:

1. **Confidentiality** — encryption (AES).
2. **Integrity** — a hash confirms the packet wasn't altered (SHA).
3. **Peer authentication** — pre-shared key or certificates.
4. **Anti-replay protection** — packet numbering.

Two protocols within IPsec:

| | AH | ESP |
|---|---|---|
| Integrity and authentication | yes | yes |
| **Encryption** | **no** | **yes** |
| NAT compatibility | poor | needs NAT-T |

In practice, **ESP** is what's used — precisely because AH doesn't encrypt. This is a
separate question in the bank on its own.

## PKI: the infrastructure certificates rely on

When IKE authentication uses certificates instead of a PSK, **PKI** (Public Key
Infrastructure) is working behind the scenes. Two required components that get asked
about:

- **CA** (Certificate Authority) — the entity that **issues and signs certificates**,
  confirming that a public key genuinely belongs to the claimed party.
- **CRL** (Certificate Revocation List) — a list of revoked certificates: a way to say
  "stop trusting this certificate" without waiting for it to expire.

A pre-shared key or a plain password aren't part of PKI at all — that's an entirely
different authentication method, the very one certificates replace.

**A common real-world problem** isn't the protocol itself, but the chain of trust: a
client will refuse to trust a server's certificate (say, a Cisco ISE portal) if the
client's trust store doesn't contain the certificate of **the CA** that signed the
portal's certificate. For devices the organization doesn't manage (personal devices
belonging to contractors or guests — not domain-joined, with no internal CA in their trust
store), the correct side to fix is the **server, not the client**: install a certificate
on ISE that's signed by a **publicly trusted CA** (rather than an internal/self-signed
one) — root certificates from such CAs are already preinstalled as trusted in most OSes
and browsers, including on devices that have never seen the organization's internal CA.
Manually distributing the internal CA certificate to third-party devices is technically
possible, but it doesn't scale and requires action on every single device — exactly what
the task is trying to avoid.

## How the tunnel comes up

**IKE** (Internet Key Exchange) negotiates parameters and keys:

- **Phase 1** — a protected control channel between the gateways: algorithms, the
  Diffie-Hellman group, authentication (PSK or certificates). Result: an ISAKMP SA.
- **Phase 2** — negotiating parameters for the data itself: what to encrypt (interesting
  traffic), which algorithm to use. Result: an IPsec SA, one per direction.

**Diffie-Hellman** lets two parties derive a shared secret without ever sending it over the
channel — that's its only job, and it's phrased exactly that way on the exam.

## Tunnel and transport modes

| | Tunnel mode | Transport mode |
|---|---|---|
| What's encrypted | **the entire original packet**, with a new IP header added | only the payload |
| Where it's used | site-to-site between gateways | communication between two end hosts, inside GRE |

Site-to-site VPNs use **tunnel** mode — the original addresses are hidden.

## GRE, and why it's paired with IPsec

**GRE** is a simple tunnel that can carry anything, including **multicast and routing
protocol traffic**. But it **doesn't encrypt**.

Plain IPsec, on the other hand, encrypts but doesn't carry multicast — so you can't run
OSPF or EIGRP over it. Hence the standard pairing, **GRE over IPsec**: GRE provides
versatility, IPsec provides protection.

**DMVPN** takes the idea further: dynamic, any-to-any tunnels between branches instead of
a rigid hub-and-spoke, built on top of GRE + IPsec + NHRP.

## What shows up in the configuration

```cfg
crypto isakmp policy 10
 encryption aes 256
 hash sha256
 authentication pre-share
 group 14
!
crypto isakmp key S3cretKey address 203.0.113.9
!
crypto ipsec transform-set TS esp-aes 256 esp-sha256-hmac
 mode tunnel
!
access-list 110 permit ip 10.1.0.0 0.0.255.255 10.2.0.0 0.0.255.255
!
crypto map CMAP 10 ipsec-isakmp
 set peer 203.0.113.9
 set transform-set TS
 match address 110
!
interface GigabitEthernet0/0
 crypto map CMAP
```

The ACL here describes **interesting traffic** — what should go into the tunnel, not what
should be blocked. A mismatch between these ACLs on the two sides is a classic cause of
"phase 2 won't come up."

## Diagnosis: the tunnel doesn't come up at all (phase 1)

**Symptom.** Both routers are configured for site-to-site VPN, and `show crypto isakmp sa`
shows no established connection (or shows one stuck in an incomplete state).

**What to look at.** Whether the ISAKMP policy parameters match on both sides:

```cli
R1# show crypto isakmp sa
IPv4 Crypto ISAKMP SA
dst             src             state          conn-id status
203.0.113.9     203.0.113.5     MM_NO_STATE        1    ACTIVE
```

**Conclusion.** The `MM_NO_STATE` state means the sides exchanged the first message, but
negotiation never progressed further — a fingerprint of a **phase 1** parameter mismatch:
encryption algorithm, hash, Diffie-Hellman group, or authentication method. Every parameter
in `crypto isakmp policy` must match **exactly**, not approximately: if one router has
`group 14` and the other has `group 2`, the peers are physically unable to derive a shared
secret using the same method, and IKE won't get past the first exchange. If the problem
were a wrong pre-shared key instead, the state would usually progress a bit further (to
`MM_KEY_EXCH` or similar) before failing with an authentication error — different failure
points point to different causes. Check by comparing `crypto isakmp policy` line by line
on both sides, rather than rebuilding the configuration from scratch.

## Diagnosis: phase 1 is up, phase 2 isn't

**Symptom.** `show crypto isakmp sa` shows `QM_IDLE` (phase 1 completed successfully), but
traffic between the sites still isn't encrypted and doesn't pass.

**What to look at.** Whether "interesting traffic" matches on both sides:

```cli
R1# show access-lists 110
Extended IP access list 110
    10 permit ip 10.1.0.0 0.0.255.255 10.2.0.0 0.0.255.255

R2# show access-lists 110
Extended IP access list 110
    10 permit ip 10.2.0.0 0.0.255.255 10.1.0.0 0.0.255.255
```

**Conclusion.** At first glance the ACLs look like proper mirror images — source and
destination simply swapped, exactly as they should be on the opposite end of the tunnel.
Look for a specific detail here: if R2 had `10.2.0.0 0.0.15.255` by mistake (a different
wildcard mask, covering a smaller range than the mirrored side on R1), traffic to part of
R1's address range would be considered "interesting" by R1 but not by R2. A mismatched size
of the **interesting traffic** range on the two ends is a classic reason phase 1 (the
shared protected control channel) comes up fine while the specific **pair** of IPsec SAs
for the data doesn't: the two sides need to agree not just on "traffic between these
networks," but on an **identically sized** address range on both ends.

## Walkthrough: a route into the tunnel, not just the tunnel itself

Even a fully established IPsec tunnel (or GRE over IPsec) won't carry traffic on its own —
you need a route that directs the right packets **into** it:

```cfg
interface Tunnel0
 ip address 172.16.0.1 255.255.255.252
 tunnel source GigabitEthernet0/0
 tunnel destination 203.0.113.9
 tunnel protection ipsec profile GRE-PROTECT
!
ip route 10.2.0.0 255.255.0.0 172.16.0.2       ! specifically via the tunnel interface/next hop
```

Without this routing line, traffic to `10.2.0.0/16` takes the normal path out to the
internet — through the physical interface, bypassing the tunnel — and either gets lost or,
worse from a security standpoint, leaves unencrypted if a route to it exists at all along
the way. This is the exact same principle as in the static routing chapter: next-hop
reachability by itself doesn't mean traffic is automatically sent there — the routing
table decides the direction, not the mere existence of an interface.

> [!trap] Trap
> "The VPN is configured and shows up, so everything's working" — a tunnel interface's up
> state doesn't guarantee the traffic you care about is actually entering it. Also check
> the route to the network beyond the tunnel.

## What gets asked

- "Which VPN type requires client software on the user device?" — remote access.
- "Which IPsec protocol provides encryption?" — ESP (AH doesn't encrypt).
- "What is the purpose of IKE phase 1?" — build a protected negotiation channel and
  authenticate the peers.
- "Why is GRE used with IPsec?" — GRE carries multicast and routing protocol traffic,
  IPsec adds encryption.
- "What does Diffie-Hellman provide?" — a shared secret key without ever sending it over
  the network.
- "Which mode encrypts the entire original packet?" — tunnel mode.
- "`show crypto isakmp sa` shows the state `MM_NO_STATE`. What should be checked?" — an
  exact match of `crypto isakmp policy` parameters (encryption, hash, DH group,
  authentication) on both sides.
- "Phase 1 is up (`QM_IDLE`), but no traffic passes through the tunnel. What is a likely
  cause?" — a mismatched size of "interesting traffic" (ACL/wildcard mask) on the two ends
  of the tunnel — phase 2 won't come up for the mismatched portion.
- "A GRE-over-IPsec tunnel interface shows up/up, but traffic to the remote network still
  fails. What else must be verified?" — whether a route to the remote network exists via
  the tunnel interface specifically; an up tunnel by itself doesn't direct traffic into it.

## Check yourself

```check
?? A branch and a data center are connected over the internet, and users don't configure anything. Which VPN type is this?
!! Site-to-site.
?? Why is ESP used in real tunnels instead of AH?
!! AH provides integrity and authentication, but not encryption; it also handles NAT poorly.
?? Why is GRE run on top of IPsec?
!! So multicast and routing protocols, which plain IPsec can't carry, can pass through the tunnel.
?? What happens during IKE phase 1?
!! The peers authenticate each other and build a protected control channel, negotiating the algorithms and Diffie-Hellman group.
?? What does the ACL in a crypto map describe?
!! Interesting traffic -- what should be encrypted and sent into the tunnel.
?? show crypto isakmp sa is stuck at MM_NO_STATE. Which phase is this, and what should be compared first?
!! Phase 1: compare crypto isakmp policy on both sides -- encryption, hash, Diffie-Hellman group, and authentication method must match exactly.
?? Phase 1 is in the QM_IDLE state, but traffic isn't being encrypted. Where should you look?
!! At the interesting-traffic range (ACL) on both sides -- if it isn't a mirrored match in size, phase 2 won't come up for the mismatched part.
?? Interface Tunnel0 shows up/up, IPsec is configured, but traffic to the remote network isn't flowing. What else should be checked besides the tunnel itself?
!! Whether a route to that network exists via the tunnel interface specifically -- an up tunnel doesn't pull traffic into itself on its own.
```
