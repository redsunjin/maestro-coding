# AgentsView Observation Spike

Status: active spike
Tracking: #65
Branch: `feat/agentsview-observation-spike`

## Goal

Validate whether AgentsView can act as an **optional observation provider** for Maestro without becoming a required runtime dependency or replacing Maestro's VU-001 work lifecycle.

Maestro remains the source of truth for:

```text
Work Request -> Plan -> Work Session -> Delivery -> Human Decision -> merge approval
```

AgentsView, if useful, only supplies read-only observation such as external session identity, activity, edits, and usage telemetry.

## Architectural boundary

```text
                +-- AgentsView
Maestro -- ObservationProvider
                +-- future provider / none
```

Do not put AgentsView-specific concepts directly into the Maestro core domain model during this spike.

Candidate reference shape:

```json
{
  "provider": "agentsview",
  "externalSessionId": "...",
  "agent": "codex",
  "project": "maestro-coding",
  "observedAt": "..."
}
```

If promoted after the spike, prefer a generic `observationRefs[]` boundary over a dedicated `agentsViewSessionId` field.

## Current findings

### F1. Per-session usage is available

AgentsView exposes a stable per-session usage endpoint:

```text
GET /api/v1/sessions/{id}/usage
```

Useful fields include session identity, agent/project, output-token totals, peak context tokens, cost when available, and model information.

This is suitable for optional telemetry, but usage/cost is not primary approval correctness evidence.

### F2. Recent Edits is project-filtered, not session-filtered

The documented endpoint is:

```text
GET /api/v1/recent-edits?limit=...&offset=...&project=...
```

The feed groups files by `(project, file path)`. Individual edit rows carry the session they came from, but the public endpoint does not document `session_id` as a query filter.

Implication:

- Project-level Recent Edits **must not** be treated as evidence that a particular Maestro WorkSession changed those files.
- An exact external session link must be established first.
- If filtering has to happen client-side, the response must preserve reliable session IDs on each edit.
- If exact attribution cannot be guaranteed, show the data only as `project observation`, not `work evidence`.

### F3. Maestro already has a WorkSession core

The spike should attach observation to the existing WorkSession lifecycle rather than create another session model or dashboard.

Maestro already persists arbitrary WorkSession `metadata` across restart. For the spike, the exact external reference can therefore be carried without a core schema change:

```json
{
  "metadata": {
    "observationRefs": [
      {
        "provider": "agentsview",
        "externalSessionId": "<canonical-or-native-session-id>",
        "agent": "codex",
        "observedAt": "2026-09-13T00:00:00Z"
      }
    ]
  }
}
```

This is a spike-only use of existing metadata, not yet a formal public contract.

### F4. AgentsView has a stable exact-session read surface

AgentsView documents `session get <id>` / `GET /api/v1/sessions/{id}` as a stable programmatic surface and states that session API changes are additive-only with stable field types.

For Codex, Copilot, Gemini and other UUID-style providers, bare UUIDs are accepted and resolved without the Codebuff/Freebuff ambiguity rules. `session list` also exposes project, agent, activity-window, branch and other filters.

Implication:

- The authoritative binding should be an **explicit external session ID** propagated by the launching/adapter layer.
- `session list?project=...&agent=...&active_since=...` may help an operator discover candidates, but candidate discovery must not silently become authoritative binding.
- Repo/path/time matching is diagnostic fallback only.

### F5. Exact-session Recent Edits can be filtered client-side, but paging remains a caveat

The AgentsView frontend model shows each Recent Edits row contains nested edits with `session_id`, `ordinal`, tool/category and timestamp. Therefore a project-level page can be reduced to edits whose `session_id` exactly matches the linked external session.

However, the endpoint is still paginated by grouped files and does not document a session filter. If a session's edits fall outside the fetched project page, absence from the filtered result is not evidence of no edits.

Therefore:

- positive exact-session matches are useful observation;
- zero matches are `unknown/no match in fetched window`, not `no edits`;
- a future upstream session filter or a session-scoped tool-call query may be preferable for production evidence.

## Probe script

This branch includes a read-only spike helper:

```bash
node scripts/spike-agentsview-observation.mjs \
  --session-id <agentsview-session-id> \
  --base-url http://127.0.0.1:8080
```

It probes:

1. `GET /api/v1/sessions/{id}`
2. `GET /api/v1/sessions/{id}/usage`
3. project-level `GET /api/v1/recent-edits`, then retains only nested edits whose `session_id` exactly equals the supplied session id.

Timeout/unavailable/partial data are reported as degraded observation and do not mutate Maestro state.

## Spike questions

### S1. Availability

Confirm that Maestro can probe a local AgentsView daemon with a short timeout and degrade cleanly when it is absent.

Pass condition:

- unavailable AgentsView never blocks normal Maestro operations.

Current state: **probe path implemented; live daemon verification still required.**

### S2. Exact session correlation

Determine how a Maestro WorkSession obtains the exact AgentsView session ID.

Preferred approaches, in order:

1. explicit external session ID returned/known at agent launch;
2. deterministic adapter metadata propagated from the execution agent;
3. narrow discovery with unique identifiers;
4. repo/path/time heuristics only as diagnostic fallback, never authoritative evidence.

Pass condition:

- two concurrent agent sessions in the same repository can be distinguished reliably.

Current conclusion:

- **Design PASS when the adapter supplies the exact external session id.**
- **Discovery-only correlation is not accepted as PASS.**
- Maestro can carry the binding in existing WorkSession metadata during the spike, so no core model change is needed to test it.

### S3. Session-scoped observation

For one linked external session, confirm which of the following can be recovered reliably:

- agent/provider;
- project;
- last activity/update timestamp;
- edits attributable to that exact session;
- usage/cost/model telemetry.

Pass condition:

- at least identity + activity + one useful evidence/telemetry class is session-attributable without direct DB access.

Current state:

- identity/project: public exact-session API available;
- usage: public exact-session API available;
- edits: positive attribution possible by nested `session_id`, but project-level pagination means missing matches are inconclusive;
- live local session verification still required.

### S4. Failure boundary

Test timeout, daemon unavailable, missing session, no token data, and unpriced model cases.

Pass condition:

- all become optional/degraded observation states, not WorkSession failures.

The probe implements this behavior without touching Maestro's server state; live cases remain to be executed.

## Go / Hold / No-Go

### GO

Promote to a formal `ObservationProvider` implementation only when all are true:

- exact WorkSession -> external session correlation is reliable;
- parallel sessions in one repo are distinguishable;
- useful session-scoped observation is available through a stable public interface;
- AgentsView outages do not affect Maestro's core lifecycle;
- no AgentsView-specific field is required in the core WorkSession model.

### HOLD

Hold integration if it works but requires brittle project/path/time inference, or if VU-001 Delivery Bridge work would be delayed by productizing the observation UI.

### NO-GO

Do not integrate if exact attribution requires direct SQLite/internal implementation coupling, or if the observation value is too small compared with maintenance cost.

## Non-goals for this branch

- no AgentsView source fork or vendoring;
- no direct AgentsView SQLite access;
- no Codex/Claude native-session parser in Maestro;
- no observability dashboard clone;
- no semantic search;
- no budget auto-stop or auto-approval;
- no upstream protocol proposal yet;
- no project-level Recent Edits presented as exact WorkSession evidence.

## Exit artifact

At the end of the spike, record one verdict:

```text
GO | HOLD | NO-GO
```

with:

1. exact session-correlation method;
2. observed API/data contract;
3. parallel-session test result;
4. degraded/unavailable behavior;
5. recommended next implementation scope, only if GO.
