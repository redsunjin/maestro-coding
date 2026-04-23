# Maestro Player Adrenaline Effects

This document stores high-energy copy and effect contracts that can be reused when a replay needs a deliberate arcade spike.

## Commit Backlog Barrage

Canonical Korean copy:

- `거침없이 커밋해라.`
- `풀리퀘스트는 거침없이 쏴라.`

Working English support copy:

- `Commit without brakes.`
- `Fire pull requests like a barrage.`

Use this when commits have piled up on the same branch or PR and the player needs a short burst of urgency. The tone is intentionally shoot-'em-up inspired, but the trigger should stay rare so it feels like an adrenaline event rather than normal UI noise.

## Trigger Contract

Source event:

- `commit-backlog`

Default trigger:

- At least 4 `commit` events.
- Same branch or same PR.
- Within 45 minutes.

Severity:

- `rush`: 4 to 6 commits in the trigger window.
- `overdrive`: 7 or more commits in the trigger window.

## Effect Contract

Effect id:

- `maestro-adrenaline.commit-backlog-barrage`

Visual direction:

- Amber/cyan lane glow.
- Short snare-hit screen shake.
- Bold strobe-style callout typography.
- 4-beat duration.

Audio direction:

- Snare roll rise.
- Small tempo lift.
- Density boost that resolves on the next PR open or merge.

Chart direction:

- Bias injected notes toward outer lanes.
- Prefer accent notes.
- Do not inject more than 1 extra effect note per beat.

## Guardrails

- Do not fire this for every commit.
- Do not fire across unrelated branches.
- Do not replace merge cadence or review tension cues.
- Keep it as a short arcade spike, not a permanent mode.
