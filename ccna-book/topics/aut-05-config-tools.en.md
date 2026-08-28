---
title: Ansible, Terraform, Puppet, and Chef
lead: Push versus pull, agent or agentless, declarative versus procedural — and which tool is responsible for what.
---

## What they have in common

All four solve the same problem: **bring devices to a described state and keep them
there**. Shared traits:

- **Declarative** — you describe the outcome, not a sequence of commands.
- **Idempotent** — running it again doesn't break anything: whatever already matches the
  description is left alone.
- The description lives in text files under version control.

## The table you'll be asked about

| | Ansible | Terraform | Puppet | Chef |
|---|---|---|---|---|
| Model | **push** | push | **pull** | **pull** |
| Agent on the device | **not needed** | not needed | **needed** | **needed** |
| Description language | **YAML** (playbook) | HCL | Puppet DSL (**manifest**) | Ruby (**cookbook/recipe**) |
| Transport | SSH / API | provider API | its own (TCP 8140) | its own |
| Strength | simplicity, network gear | building infrastructure (cloud) | server state control | flexibility for developers |

Mnemonic for the terms: **Ansible — playbook, Puppet — manifest, Chef — cookbook and
recipe, Terraform — HCL configuration and a state file.**

## Push vs. pull

- **Push** — the central node connects to devices itself and applies changes (Ansible).
  Upside: nothing needs to be installed on the devices, which matters for switches and
  routers.
- **Pull** — an agent on the device periodically asks the server "what state should I be
  in" and brings itself in line (Puppet, Chef). Upside: configuration can't "drift away" —
  the agent fixes discrepancies on its own.

This is exactly why **Ansible dominates network automation**: you can't install an agent on
an IOS device, but SSH and APIs are available everywhere.

## What a playbook looks like

```yaml
---
- name: Configure VLAN on access switches
  hosts: access_switches
  gather_facts: false
  tasks:
    - name: Create VLAN 30
      cisco.ios.ios_vlans:
        config:
          - vlan_id: 30
            name: GUEST
        state: merged

    - name: Save configuration
      cisco.ios.ios_config:
        save_when: modified
```

What's read out of this on the exam: **YAML** format, a list of tasks, the target group of
devices (`hosts`), and the absence of step-by-step commands — only the desired state.

The device inventory is a separate file:

```yaml
access_switches:
  hosts:
    sw1.example.com:
    sw2.example.com:
  vars:
    ansible_network_os: ios
    ansible_connection: network_cli
```

## Terraform: not quite the same thing

Terraform isn't responsible for configuring an existing device — it's responsible for
**building infrastructure**: virtual networks, machines, load balancers, cloud resources.
It keeps a **state file** — its own record of what's already been created — and uses the
difference between the description and that state to decide what to add, change, or remove.

Blueprint v1.1 added Terraform specifically as a **provisioning** tool, paired with Ansible
as a **configuration management** tool — that distinction is what gets tested.

## Where this fits into the pipeline

The typical pipeline described in general terms on the exam:

1. Infrastructure and configuration descriptions live in **git**.
2. A change goes through **review** and automated syntax checks.
3. CI applies it to a staging environment first.
4. After validation, it goes to production via the tool (Ansible/Terraform), not by hand.
5. Discrepancies are caught by a repeat run: since it's idempotent, it will show exactly
   what changed.

## Walkthrough: how idempotency shows up in a second run's output

The playbook from the example above is run twice in a row with nothing changing in between.

```txt
First run:
PLAY RECAP
sw1.example.com : ok=2  changed=2  unreachable=0  failed=0

Second run (immediately after, nothing had changed):
PLAY RECAP
sw1.example.com : ok=2  changed=0  unreachable=0  failed=0
```

`changed=2` on the first run means Ansible actually applied both tasks — VLAN 30 didn't
exist yet, and the configuration had to be saved. `changed=0` on the second run isn't a bug
or "did nothing by mistake" — it's direct proof of idempotency: the `cisco.ios.ios_vlans`
module **checks the switch's current state** before making a change, sees that VLAN 30
already exists with exactly those parameters, and doesn't reissue the command. This is the
key difference from simply running a list of CLI commands over SSH: a plain script with the
command `vlan 30` would execute it identically both times (harmless in this particular case,
but without ever checking whether the action was actually needed) — the Ansible module
actually **checks**, rather than blindly repeating.

## Troubleshooting: Terraform wants to recreate a resource nobody touched

**Symptom.** `terraform plan` unexpectedly shows that an existing virtual network will be
destroyed and recreated, even though nobody changed anything in the configuration
repository.

**What to check.** The gap between Terraform's state file and the actual state of the
infrastructure:

```txt
terraform plan
  # aws_vpc.main has been changed outside of Terraform
  ~ resource "aws_vpc" "main" {
      ~ tags = {
          - "Environment" = "prod" -> null
        }
    }
```

**What was found.** Someone modified the resource **directly**, through the cloud
provider's console or another tool, bypassing Terraform — the actual state diverged from
what's recorded in the state file. Terraform detects this on the next `plan` by comparing
three sources: the code's description, the saved state, and the actual state in the cloud —
and proposes to bring reality back in line with the description, because the code is treated
as the source of truth. This is exactly the same configuration drift problem covered in the
automation chapter, just at the level of cloud infrastructure instead of switch
configuration: manual changes that bypass the automation tool create a discrepancy that
eventually surfaces.

## Troubleshooting: the Puppet server thinks a node is configured, but it hasn't changed in weeks

**Symptom.** A change to a Puppet manifest was applied on the master server several days
ago, but a specific server keeps running its old configuration.

**What to check.** When the agent on that node last contacted the server:

```cli
puppet agent --test
Warning: Unable to fetch my node definition, but the agent run will continue:
Warning: Error 400 on SERVER: Failed to find sw-legacy.example.com
```

**What was found.** In a pull model, it's the **agent** that initiates contact with the
server on a schedule (typically every 30 minutes) — if the agent on that node isn't
running, has hung, or the node is powered off entirely, the server physically cannot "push"
the change itself: it can only wait passively for the next check-in. This is the exact
opposite of the push model (Ansible), where an unapplied change shows up immediately as an
error from the command run itself — here, the discrepancy goes unnoticed until someone
explicitly checks the node or sets up separate monitoring to confirm that every agent is
actually checking in on schedule.

## What gets asked

- "Which tool is agentless and uses YAML?" — Ansible.
- "Which tools use a pull model?" — Puppet and Chef.
- "What is a playbook / manifest / cookbook?" — the description file in Ansible / Puppet /
  Chef, respectively.
- "Which tool is used to provision infrastructure rather than configure devices?" —
  Terraform.
- "What does idempotent mean in this context?" — reapplying a change doesn't alter a state
  that's already correct.
- "Which protocol does Ansible use to reach network devices?" — SSH (or the device's API).
- "A playbook run shows `changed=0` on the second execution with no errors. What does this
  indicate?" — idempotency at work: the module checked the current state, found no
  discrepancy with the description, and applied nothing again.
- "`terraform plan` reports that a resource will be destroyed and recreated, although
  nobody edited the Terraform code. What is the likely cause?" — the resource was changed
  outside of Terraform (directly in the provider's console), and the state diverged from
  reality.
- "A Puppet manifest was updated days ago, but one node still runs the old configuration.
  What should be checked?" — whether the agent on that node is contacting the server at all
  — in a pull model, the agent initiates the update on its own schedule; the server can't
  push anything on its own.

## Check yourself

```check
?? Which tool doesn't require an agent on the device, and why does that matter for networking?
!! Ansible; you can't install an agent on a Cisco switch or router, but SSH and an API are always available there.
?? What are the description files called in Puppet and in Chef?
!! Manifest and cookbook (containing recipes).
?? Why is the pull model more convenient than push?
!! The agent regularly brings the device back to the reference state on its own, so configuration drift gets corrected without human involvement.
?? What does Terraform do that Ansible doesn't?
!! It creates the infrastructure itself and tracks it in a state file, whereas Ansible configures nodes that already exist.
?? What does idempotency mean for a playbook?
!! Running it again won't cause repeat changes: tasks that are already done get skipped.
?? The first playbook run showed changed=2, and the second one right after showed changed=0. Is that a bug?
!! No — that's idempotency in action: the module checked the switch's current state, saw it already matched the description, and made no further changes.
?? terraform plan unexpectedly wants to recreate a resource that nobody changed in the code. Where should you look for the cause?
!! A manual change to that resource made outside Terraform — directly through the provider's console; the state file has diverged from the actual state.
?? A Puppet manifest was updated several days ago, but one node is still running the old configuration. Who was supposed to initiate applying the change?
!! The agent on that node itself — in a pull model, it's the agent that periodically contacts the server; if the agent isn't running or the node is off, the server won't apply anything on its own.
```
