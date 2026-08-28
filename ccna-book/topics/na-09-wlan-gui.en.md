---
title: Configuring a WLAN in the Controller GUI
lead: The click-through order for creating an SSID — General, Security, QoS, Advanced — and exactly what gets asked about each tab.
---

## What gets filled in, and in what order

Creating a wireless network on the controller is a single form with four tabs. The exam
checks **what lives where**, not your clicking skills.

| Tab | What you set |
|---|---|
| **General** | Profile Name, SSID, WLAN ID, Status (on/off), Radio Policy, **Interface/Interface Group** |
| **Security** | Layer 2 (WPA2/WPA3, PSK or 802.1X), Layer 3 (web auth), AAA Servers |
| **QoS** | Platinum/Gold/Silver/Bronze profile, WMM, bandwidth limits |
| **Advanced** | session timeouts, client exclusion, FlexConnect, Band Select, DHCP |

The difference between **Profile Name** and **SSID**: the former is the object's name
inside the controller (visible only to the admin), the latter is the name clients see.
That distinction is asked about directly.

## General

- **Interface/Interface Group** — this is where the WLAN gets mapped to a dynamic
  interface, i.e., to a wired-network VLAN. Without the right mapping, a client
  associates but ends up without an address.
- **Radio Policy** — which bands to broadcast on: All, 2.4 GHz only, 5 GHz only. A guest
  network with older devices is usually left on 2.4 GHz; for speed, 5 GHz only.
- **Status** — a WLAN is created but doesn't work until it's enabled. The classic cause of
  "the SSID isn't visible."
- **Broadcast SSID** (in General or Advanced depending on the version) — announces the
  name in beacons. Turning it off is not a security measure.

## Security

Layer 2 is the primary choice:

| Option | When to use it |
|---|---|
| **WPA2 + PSK** | small network, guest, IoT |
| **WPA2 + 802.1X** | corporate network with RADIUS and user accounts |
| **WPA3 + SAE** | modern network, resistant to password guessing |
| **None** | only combined with web auth (guest portal) |

For PSK you set the key format (ASCII or HEX) and the key itself: **ASCII — minimum 8
characters**, maximum 63; HEX — exactly 64 hex digits. For 802.1X, the **AAA Servers** tab
selects the RADIUS servers for authentication and accounting — without this, a corporate
WLAN won't come up. An added server shows up in the list by default, but doesn't handle
logins until its **Enabled** checkbox is checked — that's a separate flag, not just the
server's presence in the list.

Layer 3 is typically **Web Policy / Web Authentication**: the guest gets an address, but
before going through the portal can only reach DNS and the authentication page.

### Restricting access at the WLAN level

Beyond the Wi-Fi password itself, the GUI offers finer-grained restrictions, which are
often asked about separately from the general Security topic:

- **MAC Filtering** (Security → Layer 2, next to WPA2 Policy) — admits only clients whose
  MAC is on an allowed list, on top of the normal password check. A question like "allow
  only specific clients to join with WPA2 PSK" is exactly the combination of **WPA2 Policy
  + MAC Filtering**, not a single setting.
- **P2P Blocking Action** — stops clients on the same WLAN from seeing each other
  directly; **Drop** silently discards this traffic, **Forward-UpStream** forwards it
  upstream for further policy handling.
- **Local EAP** with **Lifetime (seconds) = 0** — a local credential database on the
  controller itself (no external RADIUS) with an **unlimited** session lifetime; a
  non-zero value, by contrast, would force the client to reauthenticate after that many
  seconds.
- **AAA Override** (Advanced) — lets RADIUS/ISE override a client's VLAN based on its
  credentials, on top of whatever VLAN the WLAN itself specifies — this is exactly the
  mechanism for assigning different VLANs to different users on the same SSID.

After standing up a new WLC, the typical "what else needs configuring" checklist isn't
about infrastructure details — it's **VLANs for different client groups** and **security
policies**: the AP and controller already work, but without this there's nowhere to sort
user traffic and nothing protecting it.

## QoS

Four profiles, and the order is worth memorizing:

| Profile | For what | Priority |
|---|---|---|
| **Platinum** | voice | highest |
| **Gold** | video | high |
| **Silver** | regular data (default) | medium |
| **Bronze** | background traffic, guests | lowest |

Assigning Platinum to a guest network is a classic wrong answer; guests get **Bronze**,
voice gets **Platinum**.

This tab is also where you enable **WMM** (required for voice and video) and set
per-client and per-SSID bandwidth limits.

## Advanced

What shows up here in questions:

- **Session Timeout** — forces reauthentication after N seconds.
- **Client Exclusion** — temporarily blocks a client after several failed login attempts
  (brute-force protection).
- **Band Select** — nudges dual-band clients toward 5 GHz.
- **FlexConnect Local Switching** — this WLAN's traffic is switched at the AP, not the
  controller.
- **DHCP Addr. Assignment Required** — the client must get an address via DHCP; a static
  one won't be accepted.

## Deployment order

1. Create a **dynamic interface** in the target VLAN (address, mask, gateway, DHCP
   server).
2. Create the WLAN: Profile Name, SSID, WLAN ID.
3. Map the WLAN to that interface.
4. Configure Security: WPA2/WPA3, PSK or 802.1X + AAA.
5. Choose a QoS profile.
6. Enable the WLAN (**Status: Enabled**) and apply.
7. Verify: the client sees the SSID, associates, gets an address, reaches the outside
   network.

> [!key] Remember
> Three things break a new WLAN most often: **Status isn't enabled**, **the interface
> isn't mapped** (client with no address), **AAA isn't configured** for 802.1X.

## Worked problem: a guest WLAN with a web portal, start to finish

The task: stand up a guest network where clients can't see the internal network, access
goes through a web portal with terms acceptance, and priority is low so it doesn't
interfere with corporate traffic.

1. **Dynamic interface** — a separate VLAN, physically isolated from the internal network
   (its own SVI, its own route, no access to internal subnets via ACL or VRF).
2. **General** — Profile Name `GUEST-PORTAL`, SSID `Guest-WiFi`, Radio Policy: usually
   `All` (guests aren't restricted to one band), Interface — the guest dynamic interface.
3. **Security → Layer 2** — `None`: a guest doesn't need a Wi-Fi-level password;
   authentication happens later, through the browser.
4. **Security → Layer 3** — `Web Policy: Authentication`, set the portal address (built-in
   or external).
5. **QoS** — `Bronze`: guest traffic shouldn't compete with internal users' voice and
   video for queue priority.
6. **Advanced** — `Session Timeout`, so a guest doesn't stay on the network for days after
   leaving; optionally `Client Exclusion`, to stop portal password guessing.
7. Enable `Status: Enabled`, apply, verify: SSID visible → client associates without a
   Wi-Fi password → the browser gets redirected to the portal on the first request → after
   accepting the terms, gets internet access but not the internal network.

The key logic being tested here: **Layer 2 security and Layer 3 security solve different
problems** — Layer 2 controls whether you can join the radio channel without a key,
Layer 3 (web auth) adds one more step **on top of** an already-established Wi-Fi
connection. For a guest network, it's typical to leave Layer 2 open and push the entire
check to Layer 3, not the other way around.

## Diagnostics: client associates, gets an address, but has no internet

**Symptom.** A WLAN is configured for employees with WPA2-Enterprise, the client
successfully authenticates, gets an IP address from DHCP, but no website loads.

**What we check.** Exactly which step the traffic stalls at — Wi-Fi itself is no longer
the issue, since the client already associated and got an address:

```txt
1. Association and 802.1X authentication — succeeded (client is on the air, keys negotiated).
2. DHCP — succeeded (got an address, so the dynamic interface and VLAN are correct).
3. Internet access — not working.
```

**What we found.** Since steps 1 and 2 passed, the WLAN is configured correctly on the
wireless side — the interface mapping is right and RADIUS did its job. At this point the
problem almost always lives in the **wired** network behind the controller: is an ACL on
the router blocking this VLAN, does the VLAN have a default route, does NAT work for its
subnet. This is the same separation-of-responsibility principle used in the chapter on
OSI-based diagnostics: once wireless association and DHCP are working, everything past
that point is ordinary L3 diagnostics on the wired network, not a Wi-Fi issue.

## Diagnostics: WPA2-Enterprise locks out every employee

**Symptom.** The guest WLAN on the same controller works fine, but the corporate WLAN with
802.1X rejects every single client, without exception, even when correct corporate
credentials are entered.

**What we check.** The reachability and configuration of the RADIUS server set in the
Security → AAA Servers tab:

```cli
WLC# show radius summary
Vendor Id Backward Compatibility........................ Disabled
Call Station Id Type........................ IP Address

Server Index.....................................  1
Server Address...................................  10.10.50.20
Port..............................................  1812
Admin Status......................................  Enabled
```

**What we found.** Rejecting **every single** client, rather than specific individuals, is
a strong signal that the issue isn't passwords — it's the WLC ↔ RADIUS relationship
itself: either the server is unreachable over the network (check this like any ordinary
L3/L4 issue — `ping`, port reachability on 1812), or the **shared secret** configured on
the controller doesn't match the one on the RADIUS server — this isn't visible from
`show radius summary` and needs a config comparison on both sides. The fact that the guest
WLAN keeps working confirms the diagnosis: the problem isn't the radio channel or the AP
itself, it's specifically the authentication chain that only the corporate SSID uses.

> [!trap] Trap
> "The guest network works — so the APs and controller must be fine" — true, but it
> doesn't rule out a problem specifically in the 802.1X/RADIUS part, which the guest
> network simply doesn't touch.

## What gets asked

- "Which tab is used to map the WLAN to a VLAN?" — General, the Interface/Interface Group
  field.
- "What is the difference between profile name and SSID?" — the internal name vs. the name
  broadcast over the air.
- "Which QoS profile should be assigned to voice / to guest traffic?" — Platinum / Bronze.
- "Where are the RADIUS servers selected?" — Security → AAA Servers.
- "A client associates but has no IP address" — wrong interface/VLAN, or DHCP.
- "Which setting forces re-authentication after a period?" — Session Timeout, in Advanced.
- "A guest WLAN needs open association with authentication happening afterward in a
  browser. Which combination of settings achieves this?" — Layer 2 Security: None, Layer 3
  Security: Web Policy/Authentication.
- "A client associates and receives an IP address but cannot reach the internet. Where is
  the problem most likely located?" — no longer in the wireless part: routing, ACLs, or NAT
  on the wired network behind the controller, for this WLAN's VLAN.
- "All employees fail 802.1X authentication on a corporate WLAN while a guest WLAN on the
  same controller works fine. What should be checked?" — RADIUS server reachability and
  whether the shared secret matches between the WLC and the server — the guest network
  works because it never uses this chain at all.

## Check yourself

```check
?? A client sees the SSID and associates, but never gets an address. Which two things should be checked on the controller?
!! The WLAN's mapping to the dynamic interface (correct VLAN?) and the DHCP settings on that interface.
?? Which QoS profile is assigned to a guest network?
!! Bronze — the lowest priority.
?? Where are RADIUS servers selected for WPA2-Enterprise?
!! The Security → AAA Servers tab.
?? How does Profile Name differ from SSID?
!! Profile Name is the record's name inside the controller; SSID is the network name clients see.
?? A WLAN was created entirely correctly, but it's not on the air. What was forgotten?
!! Enabling it: Status has to be Enabled.
?? A guest WLAN should let clients on without a password, then ask for login in the browser. Which Security settings are needed?
!! Layer 2: None (the radio channel is open, no key), Layer 3: Web Policy/Authentication (the check happens through a portal after the Wi-Fi connection is already up).
?? A client passed 802.1X, got an IP via DHCP, but no sites load. Where should the cause be looked for?
!! In the wired network behind the controller — routing, ACLs, or NAT for this WLAN's VLAN — not in the WLAN's own settings or the radio channel.
?? A corporate WPA2-Enterprise WLAN rejects every employee without exception, while a guest WLAN on the same controller works. Where should you look first?
!! RADIUS server reachability and whether the shared secret matches between the WLC and the server — everyone failing at once, rather than individual users, points straight at the authentication chain, not at passwords.
```
