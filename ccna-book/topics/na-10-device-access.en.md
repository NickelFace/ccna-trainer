---
title: Device Management Access
lead: Console, Telnet, SSH, HTTP(S), out-of-band and in-band, vty and aux lines, and why Telnet is no longer an option.
---

## Two ways to reach a device

- **Out-of-band** — access that doesn't depend on the network being up: the console port,
  AUX with a modem, a controller's service port, a terminal server. Works even when the
  configuration is broken and there's no IP connectivity.
- **In-band** — access over the network itself: SSH, Telnet, HTTPS, SNMP. Convenient, but
  if the network is down, you can't get in this way.

Hence the rule that gets tested: **initial setup and recovery happen over the console
only**; day-to-day work happens over SSH.

## Console

A rollover cable (RJ-45 or USB), terminal settings: **9600 baud, 8 data bits, no parity, 1
stop bit, no flow control** (8-N-1). These get asked about as a set.

```cfg
line console 0
 password cisco
 login
 exec-timeout 5 0
 logging synchronous
```

`logging synchronous` — keeps log messages from breaking up the line you're typing;
`exec-timeout 5 0` — kicks out an idle session after 5 minutes.

## Telnet and SSH

| | Telnet | SSH |
|---|---|---|
| Port | TCP 23 | TCP 22 |
| Encryption | **none** — the password travels in plaintext | yes |
| Authentication | line password or a local user | a username is required |
| Where it's acceptable | a lab | everywhere |

Setting up SSH is a sequence that's often walked through step by step:

```cfg
hostname SW1                                   ! 1. name
ip domain-name example.com                     ! 2. domain — the key name is built from hostname+domain
crypto key generate rsa modulus 2048           ! 3. keys (minimum 768, 2048 in practice)
ip ssh version 2                               ! 4. version 2 only
username admin privilege 15 secret S3cret!     ! 5. local user
!
line vty 0 15
 transport input ssh                           ! 6. no Telnet at all
 login local                                   ! 7. check against the local database
 exec-timeout 10 0
```

Without steps 1–2, the key-generation command won't run: the device needs a fully
qualified domain name. `transport input ssh` is exactly where Telnet gets shut off; the
option `transport input all` is always the wrong answer on security questions.

## vty lines

`line vty 0 15` — sixteen concurrent remote-access sessions. What gets done with them:

- restrict access with an ACL: `access-class 10 in` — only management addresses can
  connect;
- set an idle timeout;
- enable `login local` (user accounts) instead of a shared line password.

```cli
SW1# show users
    Line       User       Host(s)              Idle       Location
   0 con 0                idle                 00:00:00
*  2 vty 0     admin      idle                 00:00:00   10.0.99.55

SW1# show ssh
Connection Version Mode Encryption  Hmac   State         Username
0          2.0     IN   aes256-ctr  sha1   Session started  admin
```

## Web access and the cloud

- **HTTP (80)** — plaintext, disabled with: `no ip http server`.
- **HTTPS (443)** — kept enabled if a web interface is needed: `ip http secure-server`.
- **Cloud-managed** (Meraki, Catalyst Center/DNA Center) — the device brings up its own
  tunnel to the cloud, and the admin works through a portal. Upside: no inbound access
  needed from outside. Downside: depends on connectivity to the cloud.

On a wireless controller the same logic applies, just with different commands:
`config network webmode enable` opens up HTTP, and enabling **HTTPS**
(`config network secureweb enable`) is specifically what makes the WLC generate its own
local self-signed SSL certificate for web administration — the certificate doesn't appear
on its own, it's a side effect of enabling the secure protocol specifically. Telnet on a
Cisco WLC also has its own management limit: no more than **five** concurrent Telnet
sessions are allowed, which regularly comes up as a standalone numeric fact.

## What's needed for remote access to exist at all

1. The device has an IP: on the interface for a router, on the **SVI** for an L2 switch.
2. A default gateway is set (`ip default-gateway` for an L2 switch).
3. The management port/VLAN is active.
4. Authentication and `transport input` are configured.
5. A password is set on privileged mode: `enable secret` (hashed), not
   `enable password`.

The typical failure chain in questions: pings work but SSH refuses → no user account or no
`login local`; doesn't ping at all → SVI/gateway/VLAN.

> [!trap] Trap
> `service password-encryption` encrypts passwords in the config with a **weak**
> reversible algorithm (type 7) — that protects against someone glancing over your
> shoulder, not against an actual attacker. Real protection comes from `enable secret` and
> `username … secret` (a hash).

## Diagnostics: switch pings fine, but SSH asks for a login and refuses it

**Symptom.** `ping` to the switch's management address succeeds, the SSH client connects
and shows a prompt, but after entering the username and password it prints
`Access denied` or drops the session immediately.

**What we check.** The authentication configuration actually applied on vty:

```cli
SW1# show running-config | section line vty
line vty 0 4
 transport input ssh
 login
line vty 5 15
 transport input ssh
 login local
```

**What we found.** The `vty 0 4` and `vty 5 15` ranges have **different settings** — a
common but easy-to-miss configuration mistake. The first five lines have plain `login`
(checks against a line password, not a user account) with no `password` set — from an
SSH client's point of view, this looks like "it asked for a login, but has no one to
authenticate against." `vty 5 15` is fine — `login local` checks the entered credentials
against the local user database. The diagnosis comes from comparing **both** vty ranges,
not just wherever the first session "happened" to land: up to 16 concurrent lines can be
configured differently, and a "sometimes it lets me in, sometimes it doesn't" symptom
almost always means exactly this.

> [!trap] Trap
> Seeing `transport input ssh` match on both ranges at a glance doesn't guarantee matching
> behavior — the authentication method (`login` vs. `login local`) is configured on a
> separate line and can differ between vty ranges on the same device.

## Diagnostics: the SVI is up, but there's still no management over the network

**Symptom.** An L2 switch has `interface vlan 10` configured with an address, the
interface is `up/up`, but SSH access to the switch fails from every host.

**What we check.** The packet path from a host to the SVI — the same set of checks as for
any IP on an L3 device, except it's easy to forget the L2-switch-specific twist here:

```cli
SW1# show ip default-gateway
No default gateway is set
```

**What we found.** Unlike a router, an L2 switch has no full routing table — there's only
a single **default gateway** (`ip default-gateway`), which handles all management traffic
leaving the local subnet. If it isn't set, the SVI answers pings fine from within its own
subnet, but no request from another subnet can ever reach it — there's nowhere for the
reply to go. This is a trap specific to L2 switches: on a router or L3 switch the same
symptom would mean checking a full routing table, but here a single command fixes it.

```cfg
ip default-gateway 10.10.10.1
```

The second common variant of this same story: the SVI is up, but VLAN 10 isn't included
in the **allowed list** of the trunk between the switch and the rest of the management
network — in that case traffic never reaches the SVI at Layer 2 at all, well before any IP
diagnostics come into play.

## Diagnostics: the privileged-mode password is forgotten

**Symptom.** You need to get into privileged mode to recover access, but `enable secret`
is unknown, and you have physical access to the device.

**What we check and do.** The password-recovery procedure via ROMMON — a standard
sequence that gets tested step by step, not just by its outcome:

1. Reboot the device and interrupt the boot process (typically `Ctrl+Break`, or holding
   the Mode button on a switch) before IOS loads — get into **ROMMON**.
2. Change the configuration register so the startup configuration **doesn't load**:
   `confreg 0x2142`, then `reset`.
3. The device boots with an empty configuration. Copy the saved configuration from NVRAM
   into running: `copy startup-config running-config`.
4. Set a new `enable secret`, restore the register (`config-register 0x2102`), save, and
   reboot normally.

**What we found.** The point of step 2 isn't "reset the password" — it's to **skip
reading the startup-config** at boot, which is exactly why step 3 requires copying the
configuration back manually; otherwise every other setting (VLANs, ports, ACLs) would be
lost too, not just the password. A common wrong answer in questions is "just reboot the
device" — that does nothing, since the password lives in NVRAM and survives a normal
reboot without a register change.

> [!key] Remember
> Password recovery requires **physical access to the console** — one more reason the
> console should always be physically secured (locked in a cabinet), not protected by a
> password alone.

## What gets asked

- "Which method provides out-of-band access?" — the console (or service port / AUX modem).
- "Which commands are required to enable SSH?" — hostname, ip domain-name, crypto key
  generate rsa, username, transport input ssh, login local.
- "Why is Telnet not recommended?" — data and passwords travel in plaintext.
- "What restricts which addresses may open a vty session?" — `access-class` on the vty
  line.
- "What is the default console speed?" — 9600 baud, 8-N-1.
- "Which command hashes the privileged-mode password?" — `enable secret`.
- "SSH works on some vty lines but not others on the same switch. What should be checked?"
  — authentication settings (`login` vs. `login local`) can differ between vty line
  ranges even when `transport input` matches.
- "An SVI is up/up but a Layer 2 switch cannot be managed from another subnet. What is
  missing?" — `ip default-gateway` — an L2 switch has no routing table, just a single
  default gateway for all management traffic.
- "What is the purpose of changing the configuration register to 0x2142 during password
  recovery?" — to skip loading startup-config at boot, so you can get into the system
  without a password and without the old configuration.
- "Why must the configuration be copied from NVRAM to running-config during password
  recovery?" — with the modified register, the saved configuration isn't applied
  automatically at boot; skipping this step loses not just the password but every other
  setting too.

## Check yourself

```check
?? The configuration is broken and there's no IP at all. How do you get onto the device?
!! Through the console port — out-of-band access doesn't depend on the network.
?? Which two commands are missing if SSH key generation fails?
!! hostname and ip domain-name — the key name is built from them.
?? How do you allow SSH while blocking Telnet on the vty lines?
!! transport input ssh.
?? Why is enable secret better than enable password?
!! It's stored as a hash, while password is stored in plaintext (or under reversible type 7 encryption).
?? A device pings fine, but SSH refuses access. Two likely causes?
!! No local user account or login local isn't set; or the vty transport input doesn't include ssh.
?? vty 0 4 has login, vty 5 15 has login local, both with transport input ssh. What will a user see if they happen to land on one of the first five lines?
!! SSH will ask for a login, but it'll be checked against the line password rather than the local database — if no line password is set, the login fails, even though it would have worked fine on vty 5 15.
?? An L2 switch with a working SVI won't allow SSH from outside its own subnet. What should be checked first?
!! show ip default-gateway — an L2 switch has no routing table, and all management traffic leaving the subnet depends on this single gateway.
?? Why does password recovery involve changing the register to 0x2142 instead of just rebooting the device?
!! A normal reboot changes nothing — the password lives in NVRAM and survives it; register 0x2142 makes the device skip reading startup-config at boot, which is the only way to get into the system without a password.
```
