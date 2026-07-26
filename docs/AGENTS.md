# Documentation Structure

This directory contains durable documentation for Mihkel's agent workspace.

## Intent

Keep documentation brief, current, and operationally useful. Describe what is
true now and the boundaries future agents must preserve. Do not duplicate
credentials, transient command output, or implementation history.

## Layout

```text
docs/
  current/    Implemented behavior and operating contracts
  decisions/  ADR-style records for durable choices
  issues/     Durable open correctness or operability issues, when needed
  working/    Active plans and designs
```

Existing tool-authored plan directories such as `docs/superpowers/` follow the
same lifecycle as `working/`: they are review artifacts, not current-state
sources.

## Current state

Write current-state documents in the present tense. Update the relevant file in
the same commit when identity, access boundaries, repository workflow, managed
state ownership, or delivery behavior changes.

Root files such as `SOUL.md`, `IDENTITY.md`, `ACCESS.md`, `WORKFLOWS.md`, and
`PROJECT_STATE.md` remain authoritative instructions or concise live state.
`docs/current/` explains their durable operating model without copying secret
material or volatile status.

## Decisions

Use `Status / Context / Decision / Rationale / Consequences`. Accepted ADRs are
append-only; supersede rather than rewrite them.

## Working documents

Working plans and designs may be committed to assist review. They describe
active intent and are not source-of-truth documentation. Later absorb durable
facts into `current/` and rationale into `decisions/`; cleanup may happen in a
follow-up request or pipeline step.

## Exclusions

Do not store secrets, tokens, private keys, OAuth state, transient session
details, live exports, deployment logs, or descriptions that reveal credential
values. Avoid changelogs and detail directly discoverable from obvious code or
the authoritative root instruction files.
