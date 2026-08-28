---
title: JSON, XML, and YAML
lead: JSON syntax piece by piece, how to tell an array from an object, why YAML is friendlier for humans, and how to read a nested structure in a question.
---

## Why data formats matter

Programs exchange structured data, not text meant for a human. A format sets the rules for
writing it down so both sides agree on the same meaning. The exam focuses on one format —
**JSON** — plus a general sense of two others.

## JSON: everything built from four elements

```json
{
  "hostname": "R1",
  "uptime": 48213,
  "reachable": true,
  "location": null,
  "interfaces": [
    { "name": "GigabitEthernet0/0", "ip": "10.1.1.1", "enabled": true },
    { "name": "GigabitEthernet0/1", "ip": "10.1.2.1", "enabled": false }
  ]
}
```

| Element | Syntax | Example |
|---|---|---|
| **Object** | `{ }` — "key: value" pairs | `{"name": "R1"}` |
| **Array** | `[ ]` — an ordered list | `["a", "b"]` |
| **String** | always in **double** quotes | `"R1"` |
| **Number / boolean / null** | no quotes | `48213`, `true`, `null` |

Rules that trip people up:

- A key is always a string in double quotes. `{name: "R1"}` is **invalid** JSON (that's
  JavaScript).
- Single quotes aren't allowed.
- **A trailing comma after the last element is forbidden**.
- JSON has no comments.
- `true`/`false`/`null` are written lowercase and unquoted; `"true"` is a string.

## Reading nested structures

A typical question is "how many objects are in this array" or "what's the value of key X."
The approach: track the brackets.

```json
{
  "devices": [
    { "id": 1, "tags": ["core", "primary"] },
    { "id": 2, "tags": [] }
  ]
}
```

- The outer `{ }` is a single object with one key, `devices`.
- Its value is an **array** of **two** objects.
- The first object's `tags` key holds an array of two strings; the second object's is an
  empty array.

Path notation: `devices[0].tags[1]` = `"primary"`.

## XML

```xml
<device>
  <hostname>R1</hostname>
  <interfaces>
    <interface enabled="true">
      <name>GigabitEthernet0/0</name>
      <ip>10.1.1.1</ip>
    </interface>
  </interfaces>
</device>
```

Structure is defined by matched tags, and elements can carry **attributes**. XML is more
verbose than JSON, but it's what **NETCONF** uses, and it's described by schemas. The one
requirement: every opening tag must be closed, and a document has a single root element.

## YAML

```yaml
hostname: R1
uptime: 48213
reachable: true
interfaces:
  - name: GigabitEthernet0/0
    ip: 10.1.1.1
    enabled: true
  - name: GigabitEthernet0/1
    ip: 10.1.2.1
    enabled: false
```

- Structure is defined by **indentation with spaces** — tabs are forbidden.
- A list item starts with `- `.
- Quotes are rarely needed; comments use `#`.
- YAML is a superset of JSON: any valid JSON is also valid YAML.

That's why YAML is chosen anywhere a human reads and writes the file directly: Ansible
playbooks, infrastructure descriptions, CI pipelines.

## Comparison

| | JSON | XML | YAML |
|---|---|---|---|
| Human readability | medium | low | high |
| Verbosity | compact | verbose | most compact |
| Comments | no | yes | yes |
| Where it's used | REST API, RESTCONF | NETCONF, SOAP | Ansible, config files, CI |

## Walkthrough: tracing a path through nesting to a specific value

A RESTCONF response to a switch state query:

```json
{
  "switch": {
    "hostname": "SW1",
    "vlans": [
      { "id": 10, "name": "SALES", "ports": ["Gi1/0/1", "Gi1/0/2"] },
      { "id": 20, "name": "VOICE", "ports": [] }
    ],
    "uplinks": {
      "primary": { "interface": "Gi1/0/24", "status": "up" },
      "backup": { "interface": "Gi1/0/25", "status": "down" }
    }
  }
}
```

Question: "what's the second port in the port list of the VLAN with id 10?" Working through
the brackets top to bottom:

```txt
switch                      → object
  .vlans                    → array of two objects
    [0]                     → the array's first object, id: 10 — this is the one
      .ports                → array of strings
        [1]                 → the second element (zero-based indexing!) = "Gi1/0/2"
```

The full path: `switch.vlans[0].ports[1]` = `"Gi1/0/2"`. A second common variant of this
question is "what state is the backup uplink in": `switch.uplinks.backup.status` =
`"down"` — here it's not an array but a nested **object** inside an object, so you look up
by key rather than by index. Telling these two cases apart (a numeric index in `[ ]` for an
array, a named key after a dot for an object) is the whole trick to reading nesting in
questions like this.

> [!trap] Trap
> Array indexing in JSON (and in most programming languages, including Python) starts **at
> zero**. The "second element" of a list is index `1`, not `2`. The exam regularly tests
> exactly this habit of counting from one.

## Walkthrough: five broken fragments and what's wrong with each

```json
1. {name: "R1"}                        // unquoted key — invalid
2. {"name": 'R1'}                      // single quotes on the value — invalid
3. {"name": "R1",}                     // trailing comma after the last element — invalid
4. {"enabled": "true"}                 // "true" in quotes — valid, but this is a STRING, not a boolean
5. {"tags": ["core", "primary",]}      // trailing comma after the last array element — invalid
```

Line 4 is a different kind of trap on purpose: the JSON itself is syntactically **valid** —
the mistake isn't in the syntax, but in the value's type. The question "is this valid JSON"
about line 4 should get the answer "yes," while "what type is the value of enabled" should
get the answer "a string, not a boolean": these are two different questions with two
different correct answers about the same fragment, and the exam likes to offer both as
distractors for the second one.

## Walkthrough: the same data in three formats

It's useful to see side by side, once, exactly what differs and what doesn't:

```json
{"router": {"hostname": "R1", "interfaces": 2}}
```

```xml
<router>
  <hostname>R1</hostname>
  <interfaces>2</interfaces>
</router>
```

```yaml
router:
  hostname: R1
  interfaces: 2
```

The structure (a `router` object with two fields) is identical — only the
**representation** differs. JSON and YAML are almost letter-for-letter equivalent (YAML is,
essentially, JSON without braces or quotes, using indentation for structure); XML requires a
matched tag pair for every element, which makes it more verbose, but it does let you use
**attributes** (`<interface enabled="true">`) — something neither JSON nor plain YAML have.
That's the substantive answer to "why does NETCONF use XML instead of JSON" — not
historical accident, but the fact that the YANG models NETCONF is built on were designed
from the start with schemas and attributes in the XML style.

## What gets asked

- "Which JSON snippet is valid?" — check for quoted keys, trailing commas, matched brackets.
- "How many objects are in this array?" — count the `{ }` pairs inside the `[ ]`.
- "Which data format uses indentation?" — YAML.
- "What is the value of key X in this payload?" — trace the nesting.
- "Which format does NETCONF use?" — XML.
- Drag-and-drop: match syntax fragments to their names (object, array, key-value pair).
- "Given a nested JSON payload, what is the second element of an array field?" — the
  element at index 1, not 2 — indexing starts at zero.
- "Is `{"enabled": "true"}` valid JSON, and what type is its value?" — syntactically valid,
  but the value is a string, not a boolean, because of the quotes.
- "Why does NETCONF use XML instead of JSON?" — the YANG models NETCONF is built on were
  designed with schemas and attributes in the XML style, which JSON and YAML don't have.

## Check yourself

```check
?? Is the JSON {'name': 'R1'} valid?
!! No: in JSON, strings and keys must be written in double quotes only.
?? How do you tell an array from an object in JSON?
!! An array is in square brackets and ordered; an object is in curly braces and made up of "key: value" pairs.
?? Does "enabled": false represent a string or a boolean value?
!! Boolean: without quotes it's true/false; "false" in quotes would be a string.
?? Why can't you use tabs in YAML?
!! Structure is defined by space indentation; tabs are forbidden by the specification and break parsing.
?? Which format does NETCONF use?
!! XML.
?? In the array "ports": ["Gi1/0/1", "Gi1/0/2"], you need the second element. What's its index?
!! 1 — array indexing starts at zero, so the "second element" is index 1, not 2.
?? Is {"enabled": "true"} valid JSON? What does the quoted value true mean?
!! Yes, it's syntactically valid; but "true" in quotes is a string, not a boolean — which is often exactly the point of the question.
?? Why is switch.uplinks.backup.status accessed via a dot and a key name, rather than a numeric index?
!! Because uplinks is an object with named fields (primary, backup), not an array; a bracketed index is only needed for array elements.
```
