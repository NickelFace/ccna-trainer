---
title: Passwords and Device Access Protection
lead: enable secret versus enable password, local users and privilege levels, password policy, MFA, and certificates.
---

## Passwords on a Cisco device

| Command | What it protects | How it's stored |
|---|---|---|
| `enable password` | privileged mode | **plaintext** |
| `enable secret` | privileged mode | hash (type 5/8/9) |
| `line console 0` + `password` | console login | plaintext |
| `line vty` + `password` | remote login | plaintext |
| `username … secret` | a specific user | hash |
| `service password-encryption` | every plaintext password in the config | weak, reversible **type 7** |

The rule the exam tests: **`enable secret` overrides `enable password`** when both are
configured. And a second rule: `service password-encryption` isn't real protection, it's
obfuscation — type 7 can be decrypted online in seconds. Real protection comes from hashes
(`secret`).

```cfg
enable secret S0me-Strong-Pass
service password-encryption
!
username admin privilege 15 secret Admin-Pass
username monitor privilege 1 secret View-Pass
!
line console 0
 login local
 exec-timeout 5 0
line vty 0 15
 login local
 transport input ssh
 exec-timeout 10 0
 access-class 10 in
!
banner motd ^Authorized access only. Activity is logged.^
```

## Privilege levels

- **0** — almost nothing (`logout`, `enable`, `exit`).
- **1** — normal user mode (`>`), view-only.
- **15** — full access (`#`).
- The levels in between, 2–14, are configured manually by permitting individual commands:

```cfg
privilege exec level 5 show running-config
username helpdesk privilege 5 secret Help-Pass
```

This is least privilege implemented on the device itself: a support engineer gets viewing
rights, an administrator gets everything. A more flexible option is **role-based CLI**
(views), but the exam more often asks about privilege levels specifically.

## Password policy

What counts as a strong policy:

- length of 8–12 characters or more, a mix of case, digits, and special characters;
- no dictionary words, no reuse;
- regular rotation — and a **mandatory** change of default passwords;
- lockout after a number of failed attempts;
- multifactor authentication wherever access is critical.

```cfg
security passwords min-length 10
login block-for 120 attempts 3 within 60      ! 3 failures within a minute -> 2-minute lockout
login on-failure log
login on-success log
```

`login block-for` is the direct answer to "how do you make password brute-forcing on the
device harder."

## What's stronger than a password

- **MFA** — a second factor (token, app, hardware key). A compromised password stops being
  sufficient on its own.
- **Certificates** — an asymmetric key pair; there's nothing to guess and nothing to
  observe. Used in 802.1X (EAP-TLS), VPN, and API access.
- **Biometrics** — convenient, but not a full replacement for a password: a fingerprint
  can't be changed after it's compromised.
- **Centralized authentication** (RADIUS/TACACS+) — accounts don't live on the device
  itself, and disabling a terminated employee's access in one place is enough.

## RSA and preparing to generate SSH keys

**RSA** is an asymmetric algorithm (public-key cryptosystem): a key pair where one key
encrypts and the other decrypts, and the shared secret is never sent over the network.
That's the direct answer to "what is a characteristic of RSA" — not "uses a preshared key"
and not "requires identical keys on both sides" (that would describe a symmetric
algorithm).

SSH on a Cisco device is built on this same key pair. Before you can run
`crypto key generate rsa`, the device needs a fully qualified domain name — the command
derives it from `hostname` + `ip domain-name`, and without a configured domain, IOS
refuses to generate a key at all. This is the same sequence covered in the device access
chapter, but here it's worth seeing from the key-generation requirement side:
**`ip domain-name` is a mandatory prerequisite**, not just a good practice.

## A few more required measures

- **Banner** `motd`/`login` with a legal-notice warning about access — a small detail with
  legal weight that gets tested.
- **`exec-timeout`** — a forgotten open session closes itself.
- **`access-class`** on the vty lines — login is only possible from management addresses.
- Turn off what's unused: `no ip http server`, unneeded services, unused ports set to
  `shutdown`.

## Walkthrough: hash types behind the word secret

`enable secret` and `username … secret` don't always use an equally strong hash — the type
is visible right in the running-config:

```txt
enable secret 5 $1$mERr$hx5rVt7rPNoS4wqbXKX7m0     ! type 5, MD5-based -- outdated
enable secret 9 $9$8pjSXpm7VmJdSA$...               ! type 9, scrypt -- modern, slow to brute-force
```

The exam point isn't algorithm internals — it's the direction: **newer types (8, 9) are
deliberately slow** — this intentionally slows down offline password cracking (an attacker
with a stolen config needs orders of magnitude more time to guess passwords), unlike the
fast MD5 in type 5. If the platform supports `algorithm-type scrypt` (type 9), prefer it
over the default:

```cfg
username admin algorithm-type scrypt secret Admin-Pass
```

Key fact: type 7 (`service password-encryption`) **isn't a hash at all** — it's reversible
encryption, and the answer to "how long does it take to recover a type 7 password" is
"practically instant with an online tool" — that's what fundamentally sets it apart from
5/8/9.

## Diagnosis: the administrator locks themselves out

**Symptom.** After configuring `login block-for` to protect against brute forcing, the
administrator mistypes their own password three times (a plain typo) and now can't get in
over SSH at all — attempts just don't respond.

**What to look at and understand.** `login block-for 120 attempts 3 within 60` doesn't
react to failed attempts **per user** — it reacts to the count of failures **from all
sources combined, over the period**. When it triggers, login is blocked for **everyone**
except addresses in a special exempt ACL, if one is configured:

```cfg
login quiet-mode access-class QUIET-EXEMPT
```

**Conclusion.** Without `quiet-mode access-class`, the administrator locks themselves out
exactly the way they'd lock out an attacker — and until the timer expires (`120` seconds
in the example), network login is unavailable to anyone. The only way in at that point is
the console, which is normally not covered by `login block-for` (the rule technically
applies to login attempts in general, but in practice the console remains a physical
out-of-band path and is treated as a priority separate case). The practical takeaway for
configuration: carve out a trusted range of management addresses in
`quiet-mode access-class` ahead of time, so the lockout doesn't turn into a self-inflicted
denial of service for legitimate administrators.

> [!trap] Trap
> `login block-for` protects against brute forcing, but without an exemption for trusted
> addresses it can become a DoS tool against yourself — this isn't hypothetical, it's a
> real scenario tested with the phrasing "why did the administrator get locked out along
> with the attacker."

## Worked problem: a custom privilege level, step by step

You need to give a support engineer the ability to view the configuration and restart
interfaces, but not change routing or create users.

```cfg
privilege exec level 5 show running-config
privilege exec level 5 configure terminal
privilege configure level 5 interface        ! without this line, interface is unavailable at level 5
privilege interface level 5 shutdown
privilege interface level 5 no shutdown
!
enable secret level 5 Level5Pass
username helpdesk privilege 5 secret Help-Pass
```

It's easy to miss exactly the middle line: permitting `configure terminal` isn't enough to
get further into `interface` — that command inside global config also defaults to
requiring level 15 and must be **separately** lowered with
`privilege configure level 5 interface`. Otherwise `helpdesk` enters configuration mode but
gets `% Invalid input detected` the moment they try `interface Gi1/0/5`, never reaching
`shutdown`.

The logic behind the assignment: the `privilege … level 5 …` commands permit **specific**
commands at level 5 (only the basic level 0–1 commands are available by default), while
`enable secret level 5` sets a separate password for entering exactly this level — the
support engineer never sees the level 15 password. Verifying the result:

```cli
SW1> enable 5
Password: ********
SW1# show running-config
!... available
SW1# router ospf 1
% Invalid input detected
```

`show running-config` is explicitly permitted, while `router ospf 1` is not, because
routing protocol configuration was never opened up at any level below 15. This is least
privilege in practice, exactly as it's meant to work: access is granted **by an explicit
list of commands**, not "a little less than everything."

## What gets asked

- "Which command encrypts the privileged EXEC password with a hash?" — `enable secret`.
- "What does service password-encryption actually provide?" — weak, reversible
  encryption; protection only against a casual glance.
- "Which privilege level gives full access?" — 15.
- "Which two are examples of MFA?" — password + token/fingerprint.
- "Which command limits repeated login attempts?" — `login block-for … attempts …
  within …`.
- "Which command restricts SSH access to specific source addresses?" — `access-class` on
  the vty lines.
- "Why is a type 9 secret preferred over a type 5 secret?" — type 9 (scrypt) is
  deliberately slow to brute-force, while type 5 (MD5-based) is cracked offline
  significantly faster.
- "An administrator configured login block-for and is later locked out along with an
  attacker. What was missing?" — an exempt ACL via `login quiet-mode access-class` for
  trusted management addresses.
- "How can a support engineer be given access to specific commands without full
  privilege 15?" — assign the commands to a specific intermediate level
  (`privilege exec level N <command>`) and create a user at that level.

## Check yourself

```check
?? Both enable password and enable secret are configured. Which one takes effect?
!! enable secret -- it always overrides enable password.
?? How secure is a password protected only by service password-encryption?
!! Not secure at all: type 7 is reversible and can be decrypted instantly; only secret hashes are secure.
?? What privilege level does a user land in at the ">" prompt?
!! Level 1 -- view-only.
?? How do you limit password brute forcing on the device itself?
!! login block-for N attempts M within T -- after M failures within T seconds, login is blocked for N seconds.
?? Why is a certificate better than a password for authentication?
!! It can't be brute-forced or observed during entry; the private key is never transmitted over the network.
?? How does a type 9 secret differ from type 5 in terms of resistance to brute forcing?
!! Type 9 (scrypt) is a deliberately slow algorithm -- offline brute forcing takes orders of magnitude longer than against the fast MD5-based type 5.
?? After configuring login block-for, an administrator mistyped their password three times and got locked out right along with the attacker. What should have been configured in advance?
!! login quiet-mode access-class with an ACL of trusted management addresses -- without it, the lockout applies to every source with no exceptions.
?? A support engineer needs access to show running-config and to restarting interfaces, but not to routing configuration. How do you set this up without granting privilege 15?
!! Assign the needed commands to an intermediate level (privilege exec level 5 show running-config, etc.) and create a user with username ... privilege 5 -- access is limited to an explicit list of commands.
```
