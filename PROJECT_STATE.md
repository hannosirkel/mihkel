# Project State

## Servitium

The service and automated delivery pipeline are operational. On 2026-07-22,
Servitium PR #1 deployed the generated fantasy artwork to the home page. The
public endpoint at `http://192.168.21.2:8099` returned HTTP 200 and `/healthz`
returned `{"status":"ok"}` after the deployment.

There are no known active Servitium pull requests. Future application work
starts with a feature branch and pull request; delivery after merge is owned by
the GitHub pipeline and GitOps reconciliation.

## Mihkel workspace

The 2026-07-22 community-workflow alignment is under review in PR #1 and is on
hold for further pipeline clarification.

Semantic memory search and indexing are operational again. A 2026-07-22 search
used the configured `baai/bge-m3` model and returned the expected workspace
memory entries.

The OpenClaw Codex plugin has a known registration bug involving
`openSyncKeyedStore`. The embedded plugin remains the preferred execution path
and normal Codex functionality is operational. Available alternatives are the
standalone Codex CLI, an OpenClaw beta update, or waiting for a fixed release;
no live managed-state change is currently requested.

Delivery notifications are planned but not yet implemented. See
`WORKFLOWS.md` for the agreed design.
