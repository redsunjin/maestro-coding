# Orchestration Contract

## Goal

VU-001 Agent Registry and Approval Decision Protocol roadmap

## Source of Truth

- `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`
- `docs/superpowers/plans/2026-06-14-agent-approval-protocol-roadmap.md`
- `docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`
- `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md`

## Mode

orchestrate-only

## Method

sdd

## Existing Harness

Use the project's existing validation and harness commands. Do not replace or restructure them.

Detected commands:

- `npm run test`
- `npm run build`
- `npm run test:e2e`

Preferred goal-specific validation:

- Docs/harness only: `npm run test:server`
- Backend protocol APIs: `npm run test:server`, `npm run build`
- Executor behavior: `npm run test:server`, `npm run smoke:integration`, `npm run build`
- Work Console UI: `npm run test:ui`, `npm run build`, `npm run qa`

## Goal Order

1. Goal 0: Commit hook automation separately.
2. Goal 1: Contract and harness roadmap.
3. Goal 2: Agent Registry MVP.
4. Goal 3: ApprovalRequest Store and legacy ingress.
5. Goal 4: ApprovalDecision Pull API.
6. Goal 5: Executor boundary.
7. Goal 6: Work Console agent trust surface.

## Do Not Touch

- Do not rewrite existing harness structure.
- Do not replace existing CI, test, lint, build, or smoke scripts.
- Do not rewrite `AGENTS.md` or `docs/definition-of-done.md` for this operation.
- Do not introduce broad architecture changes unless the goal explicitly requires them.
- Do not remove or break existing `/api/request`.
- Do not rename existing `AGENT_TASK_READY`, `MERGE_SUCCESS`, `MERGE_FAILED`, `MERGE_SKIPPED`, `AGENT_RESTARTED`, or `UNDO_*` events during early goals.
- Do not treat `git merge` as the decision itself; it is an executor action after an `approve` decision.

## Operating Loop

1. Read current project state, recent worklog/status, and relevant docs.
2. Identify the next smallest useful slice toward the goal.
3. Add or update tests/specs only when needed for the slice.
4. Implement the slice.
5. Validate with the existing harness commands above.
6. If validation fails, diagnose and fix before moving on.
7. Continue until the goal is reached or a real blocker appears.

## TDD

Use TDD for behavior changes and bug fixes.

## Confirmation Boundary

Ask before destructive deletes/resets, data migrations, credential changes, paid APIs, external dependency installs, git push/merge/tag/release, deployment, or genuinely ambiguous requirements.

## Final Report

Report changed files, validation commands, failures fixed, skipped checks, remaining risks, and the next useful step.
