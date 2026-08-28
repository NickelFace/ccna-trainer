---
title: "SSH, FTP, and TFTP: Device and File Management"
lead: Configuring SSH step by step, how TFTP differs from FTP, copying configurations and IOS images, and the device boot sequence.
---

## SSH: configuration step by step

```cfg
hostname R1
ip domain-name example.com
crypto key generate rsa modulus 2048
ip ssh version 2
username admin privilege 15 secret S3cret!
!
line vty 0 15
 transport input ssh
 login local
```

The order isn't arbitrary: the key's name is built from **hostname + domain-name**, so
the third command won't succeed without the first two. This is covered in detail in the
chapter on device access as well — what matters here is that the same set of commands
also gets asked about as part of the IP services domain.

Verification: `show ip ssh` (version and key length), `show ssh` (active sessions).

## TFTP and FTP

| | TFTP | FTP |
|---|---|---|
| Transport | **UDP 69** | TCP 20/21 |
| Authentication | none | username and password |
| Capabilities | only reading and writing files | directory listing, renaming, deletion, resume |
| Reliability | handled crudely within the protocol itself | provided by TCP |
| Where it's used | loading device images and configurations | general-purpose file exchange |

Because it's so simple, TFTP fits inside a device's bootloader — it's used for recovery,
but it's inconvenient and insecure for everyday tasks.

**SCP** copies files over SSH; it's the preferred option wherever security matters.

## Working with configurations

Two configuration files, often confused:

- **running-config** — in memory, in effect right now, lost on reload.
- **startup-config** — in NVRAM, loaded at boot.

```cli
R1# copy running-config startup-config     ! save (same as write memory)
R1# copy running-config tftp:              ! back up to a server
Address or name of remote host []? 10.0.0.70
Destination filename [r1-confg]? r1-backup

R1# copy tftp: running-config              ! restore (MERGES, doesn't replace!)
R1# copy startup-config running-config     ! same kind of merge
```

> [!trap] Trap
> `copy tftp: running-config` **merges** the file with the current configuration:
> commands from the file are added, but anything not in the file is not removed. To end
> up with exactly the configuration in the file, copy it to **startup-config** and
> reload.

Reset: `erase startup-config` (or `write erase`) + `reload`.

## IOS images

```cli
R1# show flash:
-#- --length-- -----date/time------ path
  1  108312884 Aug 12 2026 10:22:14 c2900-universalk9-mz.SPA.157-3.M.bin

R1# copy tftp: flash:                       ! upload a new image
R1# verify /md5 flash:c2900-...bin          ! verify integrity
R1(config)# boot system flash:c2900-universalk9-mz.SPA.157-3.M.bin
R1# show version                            ! which image is loaded, and from where
```

Before uploading, check the free space (`show flash:`); afterward, verify the checksum,
and only then set `boot system` and reload.

## Device boot sequence

1. **POST** — power-on hardware self-test.
2. **Bootstrap** from ROM.
3. Locating IOS: `boot system` commands → first image in flash → TFTP → ROMmon.
4. Locating a configuration: **startup-config** in NVRAM → if it's missing, the initial
   setup dialog (setup mode) launches.

A **configuration register** value of `0x2102` means a normal boot; `0x2142` skips
startup-config, which is exactly what's used for password recovery.

## Worked problem: why a "restored" config didn't match the backup

An administrator accidentally deleted several ACLs and VLANs and decided to roll back to
yesterday's backup:

```cli
R1# copy tftp: running-config
Address or name of remote host []? 10.0.0.70
Source filename []? r1-backup
Destination filename [running-config]?
```

Afterward, the deleted ACLs and VLANs **weren't restored**, while old entries the
administrator had added earlier that same day — entries that weren't in yesterday's
file — **stayed in place**. The reason is the same `copy ... running-config` behavior
already covered: the command doesn't **replace** the current configuration, it **adds**
the file's contents to it, line by line. If an ACL existed yesterday and was deleted
today with `no access-list ...`, yesterday's backup file still has `access-list ...`
written in it (a positive definition), but merging it with running-config contains no
command that **undoes a deletion** — it just reapplies whatever's written in the file,
and whatever isn't there (like an explicit "delete everything extra") simply isn't
applied either. The correct procedure for a full rollback:

```cli
R1# copy tftp: startup-config
R1# reload
```

Copying to **startup-config** followed by a reload guarantees the device ends up in
exactly the state recorded in the file — because at boot, running-config is built
**from scratch** out of startup-config, rather than merged with something that already
exists.

## Diagnosis: copying to a TFTP server hangs or times out

**Symptom.** `copy running-config tftp:` prompts for the address and filename, but then
the output stalls on a line of dots (`!!!...`) and eventually fails with a timeout.

**What to check.** Basic reachability to the server — TFTP runs over UDP and doesn't
report failure details the way TCP-based FTP does:

```cli
R1# ping 10.0.0.70
Success rate is 0 percent (0/5)
```

**What was found.** The server is unreachable at L3 — either the address was entered
wrong, the TFTP server itself is down, or there's no route between the router and the
server. Since TFTP runs over **connectionless UDP**, the router gets no explicit
"refused" from the network — it just keeps retrying until the timeout expires, which
looks like a hang in the output rather than an immediate error (compare this to a TCP
connection, where an unreachable port would immediately return an RST — the topic of the
TCP/UDP chapter). If `ping` succeeds but the copy still fails, the next thing to check is
whether the TFTP service is even running on the server at all (unlike SSH/FTP, TFTP
often has no persistent service — it has to be started separately for the duration of
the operation), and whether the filename is correct.

## Diagnosis: a device boots into ROMMON after an IOS upgrade

**Symptom.** A new IOS image was uploaded to flash, `boot system` was set, the device
was rebooted — and instead of a normal boot, it lands at the `rommon 1>` prompt.

**What to check.** Whether the image itself is intact and present, and matches the boot
list:

```cli
rommon 1> dir flash:
   108312884  c2900-universalk9-mz.SPA.157-3.M.bin

R1# show bootvar
BOOT variable = flash:c2900-universalk9-mz.SPA.158-3.M.bin,12   ! typo in the version
```

**What was found.** The boot variable points to `...158-3.M.bin`, but what's actually in
flash is `...157-3.M.bin` — a typo (or an incomplete file) in the `boot system` command.
The device honestly tries to find the exact file specified, doesn't find it, and with no
other source to load IOS from, drops into ROMMON as a last resort. This is precisely why
the "IOS images" section recommends `verify /md5` after copying — not just to confirm
the file wasn't corrupted in transit, but also that the name in `boot system` matches
the actual filename **character for character**. Recovery means either correcting `boot
system` to the right filename and reloading, or, if the image really is missing or
corrupted in flash, loading IOS directly from ROMMON via `tftpdnld`, if the platform
supports it.

## What gets asked

- "Which protocol uses UDP port 69?" — TFTP.
- "Which two capabilities does FTP have that TFTP lacks?" — authentication and directory
  operations (listing, deletion, renaming).
- "Which command backs up the configuration to a server?" — `copy running-config tftp:`.
- "What happens when a file is copied to running-config?" — a merge, not a replacement.
- "Which command shows the IOS image in use?" — `show version`.
- "Where is startup-config stored?" — in NVRAM.
- "An administrator copies a backup file to running-config to undo unwanted changes, but
  deleted ACLs do not reappear. Why?" — the command merged the file with the current
  configuration instead of replacing it; an exact rollback requires copying to
  startup-config and reloading.
- "A `copy` to a TFTP server hangs and eventually times out instead of failing
  immediately. Why does this differ from a failed FTP transfer?" — TFTP runs over
  connectionless UDP, so an unreachable server never returns an immediate failure — only
  the retry timeout expiring.
- "A device boots into ROMMON after an IOS upgrade. What is a likely cause?" — `boot
  system` points to a filename that isn't in flash (typo or an incomplete copy) — the
  device has nothing to boot from.

## Check yourself

```check
?? What transport and port does TFTP use, and why is it used at all?
!! UDP 69; it's extremely simple, which is why it can be implemented even inside a device's bootloader.
?? A config was copied from TFTP into running-config. Why doesn't the device behave as expected?
!! A merge happened: old commands not present in the file remain in effect.
?? Where is startup-config stored, and what happens if it's erased?
!! In NVRAM; after a reload, the device boots with an empty configuration and offers setup mode.
?? Why is SCP better than TFTP for copying a configuration?
!! It runs over SSH — with authentication and encryption.
?? What does configuration register 0x2142 mean?
!! Skip startup-config at boot — the password recovery mode.
?? A backup config was loaded into running-config to undo today's ACL deletions. Why didn't the deleted ACLs come back?
!! A merge doesn't restore what was deleted — it only adds what's written in the file on top of the current configuration; an exact rollback requires copying to startup-config and reloading.
?? Copy running-config tftp: hangs and eventually times out instead of returning an immediate error. Why does this differ from FTP?
!! TFTP runs over connectionless UDP — an unreachable server sends no explicit refusal, so the router just keeps retrying until the timeout expires.
?? After uploading a new IOS image, the device boots into rommon >. Show bootvar shows a filename with a typo in the version. What's the cause?
!! boot system points to a file that isn't in flash under that name — the device can't find an image to boot and drops into ROMMON as a last resort.
```
