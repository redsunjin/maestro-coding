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

## Spike questions

### S1. Availability

Confirm that Maestro can probe a local AgentsView daemon with a short timeout and degrade cleanly when it is absent.

Pass condition:

- unavailable AgentsView never blocks normal Maestro operations.

### S2. Exact session correlation

Determine how a Maestro WorkSession obtains the exact AgentsView session ID.

Preferred approaches, in order:

1. explicit external session ID returned/known at agent launch;
2. deterministic adapter metadata propagated from the execution agent;
3. narrow discovery with unique identifiers;
4. repo/path/time heuristics only as diagnostic fallback, never authoritative evidence.

Pass condition:

- two concurrent agent sessions in the same repository can be distinguished reliably.

### S3. Session-scoped observation

For one linked external session, confirm which of the following can be recovered reliably:

- agent/provider;
- project;
- last activity/update timestamp;
- edits attributable to that exact session;
- usage/cost/model telemetry.

Pass condition:

- at least identity + activity + one useful evidence/telemetry class is session-attributable without direct DB access.

### S4. Failure boundary

Test timeout, daemon unavailable, missing session, no token data, and unpriced model cases.

Pass condition:

- all become optional/degraded observation states, not WorkSession failures.

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
