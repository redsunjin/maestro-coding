# Agent Approval Protocol Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Maestro from hook-centered approval toward a registered-agent approval protocol with pull-first decisions and executor-separated merge behavior.

**Architecture:** Keep the existing `/api/request`, WebSocket lane UI, and merge executor operational while introducing an explicit `Agent -> ApprovalRequest -> ApprovalDecision -> Executor` contract. Implement the work as vertical goal slices so every step is testable and can stop without breaking current Maestro approval behavior.

**Tech Stack:** Node.js HTTP server in `maestro-server.js`, native `node:test` tests in `tests/*.test.mjs`, React/Vite UI for Work Console visibility, existing npm validation commands.

---

## Contract Decisions

- Extend `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`; do not create a separate protocol document yet.
- Agent registration model: `agentId + adapterType + repoRoot + token optional + capabilities`.
- Decision delivery: Pull-first.
- `git merge`: executor action after decision, not the decision itself.
- Existing `/api/request`: keep as legacy ingress.
- First MVP: one agent creates a request, Maestro stores a decision, the agent polls and acknowledges it.

## File Map

- Modify: `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`
  - Source of truth for adapter and protocol contract.
- Modify: `docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`
  - VU-001 roadmap index and confirmed decisions.
- Modify: `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md`
  - Goal-level harness and validation structure.
- Create/Update: `.agent/orchestration-contract.md`
  - Current goal contract for autonomous follow-up work.
- Create/Update: `.agent/orchestration-status.md`
  - Goal status, validation status, blockers.
- Future Modify: `maestro-server.js`
  - Agent registry, approval request store, decision store, executor boundary.
- Future Test: `tests/server-regression.test.mjs`
  - API and legacy regression coverage.
- Future UI Modify: `src/hooks/useWorkSessions.js`, `src/components/maestro/WorkConsolePanel.jsx`
  - Connected agent visibility after backend contract is stable.

---

## Goal 0: Commit Hook Automation Separately

**Purpose:** Separate the existing `install:hook` operational improvement from the protocol architecture work.

**Files:**
- Modify: `README.md`
- Modify: `USER_GUIDE.md`
- Modify: `package.json`
- Create: `scripts/install-maestro-hook.mjs`
- Create: `tests/install-hook.test.mjs`

- [ ] **Step 1: Review the current diff**

Run:

```bash
git diff -- README.md USER_GUIDE.md package.json
sed -n '1,240p' scripts/install-maestro-hook.mjs
sed -n '1,220p' tests/install-hook.test.mjs
```

Expected: only hook installer, installer tests, and user-facing install docs are in scope.

- [ ] **Step 2: Validate server tests**

Run:

```bash
npm run test:server
```

Expected: all server tests pass, including `tests/install-hook.test.mjs`.

- [ ] **Step 3: Validate full QA if runtime cost is acceptable**

Run:

```bash
npm run qa
```

Expected: QA gate passes. If it fails, fix only failures caused by the hook installer changes before committing.

- [ ] **Step 4: Commit only hook automation scope**

Run:

```bash
git add README.md USER_GUIDE.md package.json scripts/install-maestro-hook.mjs tests/install-hook.test.mjs
git commit -m "feat: add maestro hook installer"
```

Expected: hook automation changes are isolated from protocol roadmap changes.

---

## Goal 1: Contract and Harness Roadmap

**Purpose:** Establish the protocol contract and goal-level execution structure before changing server behavior.

**Files:**
- Modify: `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`
- Modify: `docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`
- Modify: `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md`
- Create: `.agent/orchestration-contract.md`
- Create: `.agent/orchestration-status.md`
- Create: `.agent/prompts/continue-to-goal.md`
- Create: `.agent/prompts/run-validation-loop.md`
- Create: `.agent/prompts/fix-failing-harness.md`
- Create: `.agent/prompts/tdd-hardening.md`
- Create: `.agent/prompts/final-review.md`

- [ ] **Step 1: Confirm contract decisions are documented**

Run:

```bash
rg -n "Pull-first|legacy ingress|executorAction|Agent 등록 모델|Goal 0|Goal 6" docs/MAESTRO_AGENT_ADAPTERS_PLAN.md docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md
```

Expected: every confirmed decision appears in at least one source-of-truth document.

- [ ] **Step 2: Confirm harness files exist**

Run:

```bash
find .agent -maxdepth 3 -type f | sort
```

Expected: orchestration contract, status, log, and prompt files are present.

- [ ] **Step 3: Validate no runtime behavior changed**

Run:

```bash
npm run test:server
```

Expected: server tests pass because this goal only changes docs/harness files.

- [ ] **Step 4: Commit roadmap and harness scope**

Run:

```bash
git add docs/MAESTRO_AGENT_ADAPTERS_PLAN.md docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md docs/superpowers/plans/2026-06-14-agent-approval-protocol-roadmap.md .agent
git commit -m "docs: define agent approval protocol roadmap"
```

Expected: roadmap and harness are separated from implementation commits.

---

## Goal 2: Agent Registry MVP

**Purpose:** Add registered agent state and heartbeat tracking.

**Files:**
- Future Modify: `maestro-server.js`
- Future Test: `tests/server-regression.test.mjs`
- Future Docs: `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`

- [ ] **Step 1: Add failing tests for agent registration**

Add tests that exercise:

```text
POST /api/agents/register
POST /api/agents/:agentId/heartbeat
GET /api/agents
GET /api/agents/:agentId
```

Required assertions:

- register creates or updates an agent by `agentId`
- `adapterType`, `repoRoot`, and `capabilities` are preserved
- heartbeat updates `lastHeartbeatAt`
- bearer-token mode is enforced consistently with existing APIs

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
npm run test:server
```

Expected: tests fail because `/api/agents/*` does not exist yet.

- [ ] **Step 3: Implement the smallest registry**

Implementation constraints:

- Use in-memory `Map<agentId, AgentRegistration>` first.
- Reuse `sanitizeHistoryText` style normalization.
- Do not add external dependencies.
- Do not alter existing `/api/request` behavior.

- [ ] **Step 4: Run validation**

Run:

```bash
npm run test:server
npm run build
```

Expected: agent registry tests pass and frontend build remains green.

- [ ] **Step 5: Commit**

Run:

```bash
git add maestro-server.js tests/server-regression.test.mjs docs/MAESTRO_AGENT_ADAPTERS_PLAN.md
git commit -m "feat: add agent registry api"
```

---

## Goal 3: ApprovalRequest Store and Legacy Ingress

**Purpose:** Add first-class approval requests while keeping `/api/request` compatible.

**Files:**
- Future Modify: `maestro-server.js`
- Future Test: `tests/server-regression.test.mjs`
- Future Docs: `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`

- [ ] **Step 1: Add failing tests for `POST /api/approval-requests`**

Required assertions:

- creates an approval request with `requestId`, `agentId`, `branchName`, `diffSummary`, `status=pending_decision`
- broadcasts the existing `AGENT_TASK_READY` event
- appends history consistently with current request creation behavior

- [ ] **Step 2: Add legacy ingress regression test**

Required assertion:

- existing `POST /api/request` still returns `success: true`, still emits `AGENT_TASK_READY`, and maps to the same internal request metadata.

- [ ] **Step 3: Implement request store**

Implementation constraints:

- Use in-memory `Map<requestId, ApprovalRequest>` first.
- Keep existing `requestStateById` until executor separation is complete.
- Do not rename existing WebSocket events in this goal.

- [ ] **Step 4: Run validation**

Run:

```bash
npm run test:server
npm run build
```

Expected: new and legacy request paths pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add maestro-server.js tests/server-regression.test.mjs docs/MAESTRO_AGENT_ADAPTERS_PLAN.md
git commit -m "feat: add approval request store"
```

---

## Goal 4: ApprovalDecision Pull API

**Purpose:** Store decisions and let agents poll and acknowledge them.

**Files:**
- Future Modify: `maestro-server.js`
- Future Test: `tests/server-regression.test.mjs`
- Future Docs: `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`

- [ ] **Step 1: Add failing tests for pending decision polling**

Required assertions:

- `GET /api/approval-requests/:requestId/decision` returns a pending response or `204` when no decision exists.
- unknown request returns `404`.

- [ ] **Step 2: Add failing tests for decision availability and ack**

Required assertions:

- after manual approve/reject creates a decision, polling returns `decisionId`, `decision`, `executorAction`, and `createdAt`
- `POST /api/approval-decisions/:decisionId/ack` records `acknowledgedAt`
- repeated ack is idempotent

- [ ] **Step 3: Implement decision store**

Implementation constraints:

- Use `Map<requestId, ApprovalDecision>` and `Map<decisionId, ApprovalDecision>`.
- Add `delivery.status` values `available` and `acknowledged`.
- Do not require push delivery for MVP.

- [ ] **Step 4: Run validation**

Run:

```bash
npm run test:server
npm run build
```

Expected: decision polling and ack tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add maestro-server.js tests/server-regression.test.mjs docs/MAESTRO_AGENT_ADAPTERS_PLAN.md
git commit -m "feat: add approval decision polling"
```

---

## Goal 5: Executor Boundary

**Purpose:** Make merge execution an executor result triggered by a decision, not the decision itself.

**Files:**
- Future Modify: `maestro-server.js`
- Future Test: `tests/server-regression.test.mjs`
- Future Docs: `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`

- [ ] **Step 1: Add failing tests for executor action**

Required assertions:

- manual approve creates `ApprovalDecision.decision=approve`
- branch merge only runs when `executorAction=merge`
- merge failure leaves the decision record available for polling
- reject creates `ApprovalDecision.decision=reject` with `executorAction=none`

- [ ] **Step 2: Extract executor helper inside server**

Implementation constraints:

- Keep using existing `gitOps.mergeAgentBranch()`.
- Introduce a focused helper such as `runDecisionExecutor(decision, approvalRequest)`.
- Preserve existing `MERGE_SUCCESS`, `MERGE_FAILED`, `MERGE_SKIPPED`, and history behavior.

- [ ] **Step 3: Run validation**

Run:

```bash
npm run test:server
npm run build
npm run smoke:integration
```

Expected: existing integration smoke still sees the old approval events.

- [ ] **Step 4: Commit**

Run:

```bash
git add maestro-server.js tests/server-regression.test.mjs docs/MAESTRO_AGENT_ADAPTERS_PLAN.md
git commit -m "feat: separate approval decision executor"
```

---

## Goal 6: Work Console Agent Trust Surface

**Purpose:** Show connected agents and decision delivery status without building a marketplace UI.

**Files:**
- Future Modify: `src/hooks/useWorkSessions.js` or create `src/hooks/useAgentRegistry.js`
- Future Modify: `src/components/maestro/WorkConsolePanel.jsx`
- Future Test: `src/App.work-session-core.ui.test.jsx` or a focused new UI test
- Future Docs: `USER_GUIDE.md`

- [ ] **Step 1: Add failing UI test for connected agent summary**

Required assertions:

- Work Console renders agent display name or `agentId`
- last heartbeat appears
- last request status appears
- last decision delivery status appears

- [ ] **Step 2: Add minimal frontend fetch hook**

Implementation constraints:

- Fetch `GET /api/agents`.
- Reuse existing token handling patterns if authentication is enabled.
- Keep UI read-only.

- [ ] **Step 3: Add compact Work Console display**

Implementation constraints:

- Display only operational trust signals.
- Do not add adapter marketplace, plugin installation, or broad configuration UI.

- [ ] **Step 4: Run validation**

Run:

```bash
npm run test:ui
npm run build
npm run qa
```

Expected: UI regression and full QA pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src tests USER_GUIDE.md
git commit -m "feat: show connected agent status"
```

---

## Validation Policy

- Documentation-only goals: run `npm run test:server` at minimum.
- Backend API goals: run `npm run test:server` and `npm run build`.
- Executor changes: also run `npm run smoke:integration`.
- UI changes: run `npm run test:ui`, `npm run build`, and `npm run qa`.

## Stop Conditions

- Existing `/api/request` behavior regresses.
- Existing `APPROVE / REJECT / UNDO` WebSocket action behavior regresses.
- Merge execution can occur without an explicit `approve` decision.
- Agent decision polling can lose a decision before ack.
- New UI implies marketplace/plugin support before the protocol MVP exists.
