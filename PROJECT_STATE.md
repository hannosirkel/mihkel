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

The 2026-07-22 community-workflow alignment is under review on branch
`docs/align-community-workflow`.

Diagnostic tool checks on 2026-07-22 found two externally managed issues:

- semantic memory indexing is unavailable because the configured OpenAI
  embeddings request returns HTTP 429 `insufficient_quota`; the index currently
  contains no memory chunks;
- OpenClaw CLI commands report that the Codex plugin cannot register because
  `openSyncKeyedStore` is undefined, although the active Codex-backed Discord
  session is operational.

These require confirmation or a source-controlled Orange/Ansible fix. Do not
patch the live OpenClaw installation or configuration.
