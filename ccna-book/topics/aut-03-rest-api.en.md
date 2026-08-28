---
title: REST API
lead: HTTP methods and CRUD, status codes, headers and authentication, idempotency, and exactly what to read out of a sample request.
---

## What makes a REST API "REST"

REST is an architectural style built on top of HTTP. The traits that get asked about:

- **Client-server model** and **statelessness**: every request is self-contained, and the
  server doesn't remember the previous one. Hence a token or credentials in **every**
  request.
- **Resources are addressed by URI**: `/dna/intent/api/v1/network-device/42`.
- **Uniform interface**: the same HTTP methods work for any resource.
- Data is usually **JSON**, occasionally XML.
- Cacheability and a layered architecture.

## Methods and CRUD

| Method | CRUD | What it does | Idempotent |
|---|---|---|---|
| **GET** | Read | retrieve | yes |
| **POST** | Create | create a new object | **no** |
| **PUT** | Update/Replace | replace the entire object | yes |
| **PATCH** | Update | change part of the fields | **no** (per spec) |
| **DELETE** | Delete | delete | yes |

> [!key] Remember
> **Idempotency** means repeating the same request doesn't change the result. Five PUTs
> leave the object in the same state; five POSTs create five separate objects. This is the
> basis for the "which method is safe to retry" question.

## Status codes

| Code | Class | Meaning |
|---:|---|---|
| **200** | 2xx — success | OK, response has a body |
| **201** | | Created — the object was created |
| **204** | | No Content — success, no body |
| **301/302** | 3xx | redirect |
| **400** | 4xx — client error | Bad Request: the body or parameters are invalid |
| **401** | | Unauthorized: **not authenticated** |
| **403** | | Forbidden: authenticated, but **lacking permission** |
| **404** | | Not Found: the resource doesn't exist |
| **429** | | Too Many Requests: rate limit exceeded |
| **500** | 5xx — server error | Internal Server Error |

The **401 vs. 403** distinction is a favorite exam pair: "I don't know who you are" versus
"I know who you are, and you're not allowed."

## What a request looks like

```txt
POST /dna/intent/api/v1/network-device HTTP/1.1
Host: sandbox.cisco.com
Content-Type: application/json
Accept: application/json
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6...

{
  "ipAddress": ["10.10.20.85"],
  "snmpVersion": "v3",
  "userName": "netadmin"
}
```

The components you'll be asked to identify:

- **method** — what to do;
- **URI/endpoint** — what to do it to;
- **headers** — `Content-Type` (the format you're sending), `Accept` (the format you want
  back), the authentication header;
- **body (payload)** — the data, usually JSON; GET requests don't have one.

## Authentication

| Method | What it looks like | Note |
|---|---|---|
| **Basic** | `Authorization: Basic base64(user:pass)` | base64 isn't encryption — only HTTPS protects it |
| **Token / Bearer** | `X-Auth-Token: …` or `Authorization: Bearer …` | log in first, then send the token on every request |
| **API key** | a key in a header or parameter | simple, but easy to leak |
| **OAuth 2.0** | exchanged for an access token | for service-to-service integrations |

A typical flow with a Cisco controller: POST to `/api/system/v1/auth/token` with Basic
login → get a token back → every subsequent request carries that token.

## REST next to NETCONF and RESTCONF

| | REST | RESTCONF | NETCONF |
|---|---|---|---|
| Transport | HTTP(S) | HTTP(S) | **SSH** (port 830) |
| Format | JSON/XML | JSON/XML | XML |
| Data model | arbitrary | **YANG** | **YANG** |
| Operations | HTTP methods | HTTP methods | `<get-config>`, `<edit-config>`, `<commit>` |

RESTCONF is a "REST wrapper" around the same YANG models NETCONF uses; NETCONF is older and
supports transactions and configuration rollback.

## Walkthrough: a full CRUD cycle on one resource

A script creates a VLAN through the controller's API, checks the result, and then deletes it.

```txt
1. POST /api/v1/vlan   {"id": 50, "name": "GUEST"}
   → 201 Created, body contains the created object with its id

2. GET /api/v1/vlan/50
   → 200 OK, body: {"id": 50, "name": "GUEST", "status": "active"}

3. PATCH /api/v1/vlan/50   {"name": "GUEST-WIFI"}
   → 200 OK, only the name field changed, everything else stayed the same

4. DELETE /api/v1/vlan/50
   → 204 No Content, no body in the response — confirmation without data

5. GET /api/v1/vlan/50   (again, after deletion)
   → 404 Not Found — the resource no longer exists
```

Walking through the codes step by step shows why they're distinguished at all: `201`
(rather than plain `200`) at step 1 explicitly says the object was **newly created**, not
just processed; `204` at step 4 is success with no content, because there's nothing left to
return after a deletion; `404` at step 5 isn't a scripting error — it's the correct
confirmation that the resource really is gone. If step 1 were repeated with the same data, the
result would be a **second** object with a new id — that's what POST's non-idempotency
looks like in practice, not just an abstract definition.

## Troubleshooting: the API suddenly starts returning 401 mid-script

**Symptom.** A script logs in successfully, gets a token, and makes several requests in a
row — then at some point (sometimes an hour later), every subsequent request with the same
token starts getting `401 Unauthorized`, even though the script's logic hasn't changed.

**What to check.** Not the token itself, but its **lifetime**:

```txt
Login response:
{"token": "eyJhbGci...", "expiresIn": 3600}
```

**What was found.** The token was issued with a limited lifetime (`expiresIn: 3600` — one
hour), and once it expires the server correctly returns `401`, as if there had been no token
at all — from the response code's perspective, an expired token is indistinguishable from a
missing one. This isn't an API bug — it's expected behavior: long-running scripts need to
either re-authenticate ahead of time on a timer, or catch `401` specifically and request a
new token before retrying, instead of treating every `401` as a fatal configuration error.

> [!key] Remember
> A `401` in the middle of a long-running script session almost never means "the credentials
> were wrong from the start" — much more often it means "the token expired," and the fix is
> to log in again, not to hunt for a bug in the original request.

## Troubleshooting: a PUT accidentally wiped half an object's settings

**Symptom.** A script updates just one parameter on a device using `PUT`, and afterward all
of the object's other previously set fields reset to their defaults.

**What to check.** The request body that actually went to the server:

```txt
PUT /api/v1/vlan/50
{"name": "GUEST-WIFI"}
```

**What was found.** `PUT` by definition **replaces the entire resource** with whatever was
sent in the body — that's its "replace" semantics, as opposed to PATCH's "modify part of
it." By sending only the `name` field, the script effectively told the server: "here is the
complete new description of this object, and it only has a name" — any field not present in
the request body is treated as unset and gets reset or removed, depending on the API's
implementation. This is the same idempotency principle covered earlier, just seen from the
other side: `PUT` is predictable and idempotent precisely because it doesn't try to guess
intent — it unconditionally replaces. The right method for a partial update is `PATCH`, not
`PUT` with an incomplete body.

## What gets asked

- "Which HTTP method creates a resource?" — POST.
- "Which method is idempotent?" — GET, PUT, DELETE (not POST).
- "What does 401 mean versus 403?" — not authenticated versus lacking permission.
- "Which characteristic describes REST?" — stateless, resources addressed by URI, HTTP
  methods.
- "Which header specifies the format of the body?" — `Content-Type`.
- "Which protocol uses SSH port 830 and YANG?" — NETCONF.
- Given a fragment of a request, name the method, endpoint, authentication type, and data
  format.
- "What does a `204` response to a DELETE request mean?" — success, but no body in the
  response — there's nothing left to return after a deletion.
- "A long-running script starts receiving 401 responses after working correctly for an
  hour. What is the most likely cause?" — the token expired; a fresh login is needed, not a
  hunt for a bug in the original request.
- "A script sends `PUT` with only one field to update a single setting, and the rest of the
  object's fields reset to defaults. Why?" — PUT replaces the entire resource with the
  supplied body; a partial update requires PATCH, not PUT with incomplete data.

## Check yourself

```check
?? Which HTTP method corresponds to a full Update operation?
!! PUT (a partial update is PATCH).
?? The server returned 403. Is the problem the token?
!! No: authentication succeeded, but permissions are lacking. A missing or invalid token would return 401.
?? What does stateless mean with respect to REST?
!! The server doesn't store context between requests — every request carries everything it needs, including authentication.
?? Why are the Content-Type and Accept headers needed?
!! The first states the format of the body being sent, the second states the desired format of the response.
?? How does RESTCONF differ from NETCONF?
!! It runs over HTTP(S) with HTTP methods and JSON/XML, while NETCONF runs over SSH with XML and its own set of operations.
?? A POST with the same body is sent twice in a row. What happens?
!! Two separate created objects with different ids — POST isn't idempotent, so each call creates a new record.
?? A script ran for an hour, then every request with the same token started getting 401. What's the likely cause?
!! The token expired (expiresIn) — a fresh login for a new token is needed; it's not a problem with the original credentials.
?? A PUT was sent with a body containing only one changed field. What happens to the object's other fields?
!! They get reset — PUT replaces the entire resource with the supplied body; changing a single field without losing the rest requires PATCH.
```
