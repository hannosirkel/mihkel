# 0004. Keep the ten root instruction documents

- **Date:** 2026-08-21
- **Status:** accepted

## Context and problem statement

The central [documentation
standard](https://github.com/hannosirkel/architecture/blob/main/standards/documentation.md)
says root documents stay few: `README.md`, `AGENTS.md`, `CLAUDE.md`. This
repository carries ten more at its root — `SOUL.md`, `IDENTITY.md`, `ACCESS.md`,
`WORKFLOWS.md`, `PROJECT_STATE.md`, `TOOLS.md`, `USER.md`, `MEMORY.md`,
`DECISIONS.md`, and `HEARTBEAT.md`. The repository contract requires every local
exception to a central standard to be linked to an explicit decision.

## Considered options

- Move the ten documents into `docs/current/` and leave pointers at the root.
- Merge them into `AGENTS.md`.
- Keep them at the root and record the exception.

## Decision

Keep the ten documents at the repository root, unchanged, and record this
exception.

## Rationale

These files are not documentation about a repository. They are the operating
identity of a running agent, loaded by OpenClaw at runtime by path. Moving or
merging them changes what that agent reads at start-up, so a layout change is a
behaviour change to a live system.

The standard's rule exists to stop a reader from hunting for the one
authoritative file. That cost is not paid here: `AGENTS.md` names each root
document and says when to read it, so the entry point stays single.

The trade-off accepted is a root listing that is longer than every other
repository in the universe, and a rule that now needs this record to be
understood. The alternative traded a real risk of breaking a running agent for a
cosmetic gain.

## Consequences

- The root document set is stable. A conformance review reads this record rather
  than reopening the question.
- Adding an eleventh root document needs a superseding decision, not a commit.
- `docs/current/` still holds the durable operating model. It links these files
  and does not copy their contents, so there is one authoritative home per fact.
