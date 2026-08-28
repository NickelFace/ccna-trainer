---
title: AI and Machine Learning in Networking
lead: Predictive versus generative AI, supervised and unsupervised machine learning, AIOps, and what's actually tested from blueprint version 1.1.
---

## Why this is in CCNA at all

Blueprint version **1.1** added a topic on how AI and machine learning affect network
operations. The questions are conceptual: distinguishing types of AI, understanding where it
helps and what its limits are. There's nothing to configure.

## Predictive vs. generative AI

| | Predictive AI | Generative AI |
|---|---|---|
| What it does | forecasts from historical data | **creates** new content |
| Question it answers | "what will happen?" | "make this for me" |
| In networking | predicts a link failure, load growth, Wi-Fi degradation | writes a configuration, explains an error, drafts a script |
| Foundation | statistical models, ML | large language models (LLMs) |

> [!key] Remember
> **Predictive** means forecasting from data; **generative** means creating new content.
> This pairing is the main thing tested on this topic.

## Machine learning: three types

| Type | How it learns | Example in networking |
|---|---|---|
| **Supervised** | from labeled examples: "this is a failure, this is normal" | traffic classification, device type recognition |
| **Unsupervised** | finds structure in unlabeled data on its own | anomaly detection, Wi-Fi client clustering |
| **Reinforcement** | tries actions and gets rewarded for the outcome | radio parameter tuning, route optimization |

Anomaly detection is most often built on **unsupervised** learning: what a new problem
looks like isn't known in advance, but a deviation from normal behavior is visible.

## AIOps: where it works in the network

- **Baseline and anomalies** — the system learns normal behavior (utilization, latency,
  Wi-Fi quality) and flags a deviation before a user complains.
- **Event correlation** — a thousand alarms collapse into a single probable root cause.
- **Capacity forecasting** — when a link or access point will hit its limit.
- **Troubleshooting assistance** — a generative assistant explains a command's output,
  suggests the next step, drafts a configuration.
- **Radio optimization** — channel and power selection based on history, not just a current
  snapshot.

This is what's implemented in the assurance features of controllers like Catalyst Center.

## Limitations worth stating out loud

- A model is only as good as the **quality of the data** it was trained on.
- Generative AI can confidently produce a **plausible but wrong** configuration — human
  review is mandatory.
- Network data is sensitive: sending configurations to an external service is a security
  policy question.
- AI **doesn't replace the engineer**: it cuts down time spent searching and on routine
  work, but the decision and the responsibility stay with the person.

## Walkthrough: how AIOps collapses a thousand alarms into one cause

Campus network: one distribution switch's uplink goes down. Without correlation, in
traditional monitoring these events would look like an independent flood:

```txt
- 340 "client lost connectivity" alarms from various access points
- 12 "interface down" alarms on access switches
- 1 "throughput drop" alarm at the network core
- 89 "RADIUS authentication failing" alarms (the server sits behind the failed link)
```

**What correlation does.** The system builds a topology model of the network in advance
(what sits behind what) and, upon seeing a simultaneous spike of hundreds of unrelated-looking
alarms, looks for a **common topological ancestor** — a device or link whose failure explains
all the downstream symptoms at once. In this case, all 442 alarms collapse into one: "uplink
failure on distribution switch SW-DIST-2, interface Gi1/0/1" — flagged as the cause the other
events directly follow from, rather than separate problems. The engineer doesn't need to
manually correlate timing and topology across 442 records — the system points straight to the
root cause and marks the rest as derivative.

This is exactly the payoff AIOps is built into controller assurance features for: not "find
the problem faster than a human could at all," but **keeping the real cause from getting
buried under the noise of derivative symptoms**, which there are always orders of magnitude
more of than root causes.

## Walkthrough: reinforcement learning in radio parameter tuning

Classic RRM (Radio Resource Management, see the Wi-Fi architectures chapter) has
historically chosen channel and power using fixed rules — "if a neighbor on this channel is
louder than X dBm, switch channels." Reinforcement learning works differently:

```txt
1. The system tries a change (for example, lowering an AP's power by 3 dB)
2. It observes the outcome: did client retransmissions, complaints, or throughput change —
   this is the "reward" (positive or negative)
3. If the outcome improved, it increases the likelihood of similar decisions in similar conditions
4. If it got worse, it avoids such decisions going forward
5. The cycle repeats continuously, adapting to the changing conditions in the building
```

The difference from a predictive model: reinforcement-based RRM doesn't just **predict**
what will happen — it actively **experiments and learns from the consequences of its own
decisions**. That's precisely what defines reinforcement learning as a distinct type of
learning, not just fancier statistics.

## Walkthrough: a plausible but wrong configuration from generative AI

An engineer asks an assistant: "configure an access port with port security for a maximum
of 2 addresses and sticky learning." The assistant produces:

```cfg
interface GigabitEthernet1/0/5
 switchport port-security
 switchport port-security maximum 2
 switchport port-security mac-address sticky
```

**What's wrong here.** The configuration looks completely plausible and is almost working —
but the `switchport mode access` command is missing. Without it, port security on a port
left in DTP negotiation mode won't come up at all (see the port security chapter), and
applying this configuration will either return an error or create a misleading impression of
protection where none actually exists. This is exactly what's meant by the warning that
"generative AI confidently produces a plausible but incomplete or incorrect result": the
mistake isn't in the syntax of any individual command (each one is correct on its own), but
in a **missing dependency**, which is much harder to check for formally than a spelling
mistake — only an engineer who knows the subject matter will notice that a required
prerequisite step is missing.

## What gets asked

- "What is the difference between predictive and generative AI?" — forecasting versus
  creating new content.
- "Which type of machine learning uses labelled data?" — supervised.
- "How is AI used in network operations?" — anomaly detection, event correlation, capacity
  forecasting, troubleshooting assistance.
- "What is a limitation of generative AI for network configuration?" — it can produce a
  plausibly wrong result, so review is required.
- "Which learning type detects previously unknown anomalies?" — unsupervised.
- "Hundreds of alarms fire at once across a campus network after a single uplink fails.
  What does event correlation provide that raw alarms do not?" — it collapses all the
  derivative symptoms into a single identified root cause using the network's topology
  model, instead of leaving the engineer to sort through hundreds of records individually.
- "Which type of machine learning improves its behavior based on the outcome of its own
  past actions?" — reinforcement learning — unlike supervised/unsupervised learning, it
  experiments and learns from the consequences of its own decisions.
- "A generative AI assistant produces a syntactically correct configuration that is still
  wrong. What kind of mistake is most likely?" — a missing dependency or prerequisite step
  (such as a forgotten port-mode command), not a spelling error in the commands themselves.

## Check yourself

```check
?? A system warns that a link will hit its capacity limit within a month. What type of AI is this?
!! Predictive — a forecast based on historical data.
?? How does supervised learning differ from unsupervised?
!! The first learns from labeled examples; the second finds structure and deviations in unlabeled data on its own.
?? Why is anomaly detection usually built on unsupervised learning?
!! What a new problem will look like isn't known in advance; the model catches deviations from normal behavior instead.
?? What's the main risk of using generative AI for configurations?
!! A confidently stated but incorrect result — human review is mandatory.
?? Does AIOps replace the engineer?
!! No: it speeds up finding the cause and removes routine work, but the decision and the responsibility stay with the person.
?? One uplink fails, and monitoring logs 442 different alarms across the network. What does event correlation provide that the alarm list alone doesn't?
!! It points to a single topological root (the failed link) that all the other symptoms stem from, instead of leaving the engineer to find the connection between hundreds of records by hand.
?? How does reinforcement learning in RRM fundamentally differ from a predictive model?
!! It doesn't just predict the outcome — it actively tries changes (like lowering an AP's power) and learns from the result; a predictive model only forecasts, without experimenting.
?? An assistant produced a syntactically correct port security configuration, but protection didn't actually work — the switchport mode access command was missing. Is that a syntax error?
!! No — every command is correct on its own; the mistake is a missing dependency (a prerequisite step), which is much harder to check for formally than a spelling mistake in the commands.
```
