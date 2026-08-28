---
title: Why Networks Need Automation
lead: What changes when you move from manual configuration to automation, how controller-based management differs from the traditional approach, and where the risks lie.
---

## What's Wrong with Manual Configuration

An engineer configures fifty switches one at a time. The result is predictable:

- **Errors** — a typo in a mask, a missing line on one device out of fifty.
- **Configuration drift** — devices that should be identical gradually diverge, and
  nobody knows exactly how.
- **Speed** — rolling out a new VLAN at a site takes days.
- **Tribal knowledge** — how things are configured lives in one person's head.

Automation doesn't eliminate the engineer: it turns "type commands" into "describe the
desired state and apply it to everything at once."

## What Automation Delivers

| Benefit | What it looks like in practice |
|---|---|
| **Speed** | a new site is deployed from a template in minutes |
| **Consistency** | the same configuration on every device in a given role |
| **Fewer human errors** | changes are validated before they're applied |
| **Auditability** | configuration lives in git: who changed what, and when |
| **Scalability** | maintenance cost grows slower than the device count |
| **Fast rollback** | the previous configuration is just one commit away |

The flip side, which also shows up on the exam: a mistake in automation is applied to
**every device at once**. That's why validation, lab/staging environments, and gradual
rollout matter.

## Traditional vs. Controller-Based Model

| | Traditional | Controller-based |
|---|---|---|
| Where routing decisions are made | on each device | centrally, on the controller |
| How it's configured | CLI on each device | policy defined on the controller, which pushes it out |
| How you view network state | piecemeal, device by device | as a whole, in one place |
| What the engineer needs to know | CLI syntax | intent and the data model |
| Example | classic campus network | Catalyst Center (DNA Center), SD-Access, SD-WAN, Meraki |

Important detail: the controller does **not** eliminate the protocols running on
devices — it sets their policy and collects their state. In the controller-based
model, devices still forward packets themselves.

## The Intent Model

Intent-based networking: the administrator describes **what should be true** ("guests
have no access to accounting"), and the system translates that into specific VLANs,
ACLs, and profiles, then continuously verifies that reality matches the intent.

The same idea underlies **infrastructure as code**: configuration is stored as text in
a repository, changes go through review, and a tool (Ansible, Terraform) applies
them — not a person at the console.

## Data, APIs, and Tools

The building blocks automation is made of (details in later chapters):

- **Data formats**: JSON, YAML, XML — what programs exchange with each other.
- **APIs**: REST over HTTPS — how a program asks a device or controller to do
  something.
- **Tools**: Ansible, Terraform, Puppet, Chef — what applies the described state.
- **Models**: YANG — how configuration structure is described; NETCONF/RESTCONF — how
  it's transmitted.
- **Scripts**: Python — the glue that ties all of this together.

## Walkthrough: How Configuration Drift Is Found in Practice

Fifty identical access switches are supposed to have identical baseline settings (NTP,
syslog server, banner, VLAN list). Once a week, a script compares each device's actual
configuration against the reference copy in the repository:

```txt
1. The script connects to each switch (SSH/NETCONF) and pulls the running-config
2. Normalizes the output (strips what's legitimately unique: hostname, interface IPs)
3. Compares it line by line against the reference template in git
4. Generates a report: SW-14 — missing logging host 10.0.0.60
              SW-31 — extra line ntp server 192.0.2.1 (not in the template)
```

**What this revealed.** On SW-14, someone had temporarily disabled log forwarding
during troubleshooting and forgot to restore the setting; on SW-31, someone had added a
test NTP server and never removed it. Neither one visibly breaks the network — both
switches keep working normally — but that's exactly what makes it dangerous: **drift
stays invisible until the moment you need it not to be**. If SW-14 goes down, its logs
never reach the server, and the incident investigation is left without data at exactly
the moment it's needed most. Regular automated comparison against the reference is what
turns discrepancies like these from an invisible problem into a line in a weekly
report.

## Walkthrough: Limiting the Risk of an Automation Mistake

Understanding that "a mistake replicates instantly" leads to specific practices worth
knowing by name:

- **Staged rollout** — a new change is first applied to one or two devices
  ("canaries"), not all fifty at once; if something goes wrong, only a small part of
  the network is affected, not all of it.
- **Lab/staging environment** — the change is tested on a copy of the production
  environment before it's applied to real devices.
- **Pre-deployment review (pull request)** — a second pair of eyes looks at the change
  before it merges into the git branch that automation deploys from.
- **Fast rollback** — since configuration lives in git as text, rolling back means
  applying the previous commit, not manually reconstructing it from memory.

All four practices aren't about avoiding mistakes altogether (that's impossible) —
they're about **limiting the blast radius** and **shortening the time to fix**. It's
the same defense-in-depth logic from the security fundamentals chapter, just applied to
the change process instead of to attacks.

## Exam Angle

- «What is a benefit of network automation?» — configuration consistency, speed, fewer
  errors, repeatability.
- «How does controller-based networking differ from traditional?» — centralized
  management and a single point of policy versus configuring each device.
- «What is configuration drift?» — divergence in the actual configurations of devices
  that are supposed to be identical.
- «Which risk does automation introduce?» — a mistake replicates across the entire
  network instantly.
- «What does intent-based networking mean?» — you describe the desired outcome, and the
  system implements and verifies it.
- «How is configuration drift typically detected before it causes an outage?» —
  through regular automated comparison of each device's actual configuration against
  the reference in the repository, not after a failure occurs.
- «What is the purpose of a staged (canary) rollout in network automation?» — to limit
  the blast radius of a potential mistake by applying the change to a small subset of
  devices first, rather than to all of them at once.
- «Why is storing configuration in git valuable beyond version history?» — rolling back
  to a working state becomes applying the previous commit, rather than manually
  reconstructing it from memory.

## Check Yourself

```check
?? What is configuration drift, and why is it dangerous?
!! The gradual divergence of configurations across identical devices: network behavior becomes unpredictable, and the cause of a failure becomes non-obvious.
?? The main risk of automation, in one sentence?
!! A mistake is applied to every device at once, not just one.
?? Do devices in the controller-based model stop forwarding packets on their own?
!! No: they still handle forwarding themselves — it's management and policy that become centralized.
?? What does "infrastructure as code" mean?
!! Configuration is described as text in a repository, goes through review, and is applied by a tool rather than by hand.
?? Why does automation reduce the number of errors if humans are the ones writing it?
!! The change is described once, validated before it's applied, and then repeated identically across every device.
?? A configuration comparison script finds a missing logging host line on one switch. Is the danger obvious right away?
!! No — the switch keeps working normally; the drift stays invisible until the moment its logs are specifically needed for an incident investigation and turn out to be missing.
?? Why is a change first rolled out to one or two devices (canaries) instead of all fifty at once?
!! To limit the blast radius of a potential mistake — if something goes wrong, only a small part of the network is affected, not all of it at once.
?? Configuration is stored in git. What's the practical benefit of that when rolling back a failed change?
!! Rolling back means the automation applies the previous commit, rather than the engineer manually reconstructing settings from memory.
```
