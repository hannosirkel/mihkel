# Project State

## Servitium

The service and automated delivery pipeline are operational. On 2026-07-22,
Servitium PR #1 deployed the generated fantasy artwork to the home page. The
public endpoint at `http://192.168.21.2:8099` returned HTTP 200 and `/healthz`
returned `{"status":"ok"}` after the deployment.

Servitium test deployments are operational. A ready pull request is deployed
to the `servitium-test` namespace by adding the `deploy-test` label. The test
application is available at `http://192.168.21.2:8098` and
`https://servitium-test.future.ee`. Live delivery after merge remains owned by
the GitHub pipeline and GitOps reconciliation.

## Mihkel workspace

The 2026-07-22 community-workflow alignment in PR #1 incorporates the clarified
test-deployment and notification procedures.

Semantic memory search and indexing are operational again. A 2026-07-22 search
used the configured `baai/bge-m3` model and returned the expected workspace
memory entries.

The OpenClaw Codex plugin has a known registration bug involving
`openSyncKeyedStore`. The embedded plugin remains the preferred execution path
and normal Codex functionality is operational. Available alternatives are the
standalone Codex CLI, an OpenClaw beta update, or waiting for a fixed release;
no live managed-state change is currently requested.

Delivery notifications are operational. See `WORKFLOWS.md` for the test and
live deployment procedures.
