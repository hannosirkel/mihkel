# OpenClaw Workspace Guidance Design

## Goal

Make Mihkel's always-loaded workspace instructions accurately describe tool
use, the intended repository workflow, credential handling, and the boundary
between Mihkel's disposable work and Orange/Ansible-managed host state.

## Design

- Put safety-critical standing orders in `AGENTS.md` and local command
  conventions in `TOOLS.md`, because OpenClaw reliably injects those files into
  native Codex turns.
- Keep detailed credential and repository procedures in `ACCESS.md` and
  `WORKFLOWS.md`; make `AGENTS.md` require reading the relevant file before an
  action that depends on it.
- Correct authentication ownership: Codex CLI state lives under `/keys/codex`,
  while OpenClaw model authentication is stored separately in OpenClaw's main
  agent state.
- Tell Mihkel to use normal HTTPS Git operations through the installed
  credential helper. The token wrapper must never be run by itself; `gh`
  commands may receive its result only through a non-traced transient
  `GH_TOKEN` in the same shell invocation.
- Identify the Ansible-managed boundary explicitly: OpenClaw configuration and
  service, pinned `/opt` software, `/keys`, system users and SSH policy,
  networking, Docker configuration, global Git credential plumbing and hooks,
  and managed repository checkouts. Mihkel may inspect these but must request
  an Orange repository change instead of mutating them.
- Preserve autonomy for project work and disposable tooling that does not
  replace or modify managed components.
- Keep direct Git history for the Mihkel workspace, while Servitium development
  remains feature-branch and pull-request based.

## Validation

Review the complete diff, ensure no credential material or unrelated files are
included, and ask a fresh OpenClaw turn to state its tool workflow and managed
boundaries. Commit and push only after those checks pass.
