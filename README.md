# Mihkel

The durable home of Mihkel, a communal agent that operates through Discord. This
repository holds what the agent is and how it works, not the host it runs on.

## Ownership

This repository is public and must stay safe to publish.

**It owns** the agent's identity and prompts (`SOUL.md`, `IDENTITY.md`,
`USER.md`), its operating instructions (`AGENTS.md`, `ACCESS.md`, `TOOLS.md`,
`WORKFLOWS.md`), its state and decision records (`PROJECT_STATE.md`,
`DECISIONS.md`, `HEARTBEAT.md`), its reusable skills in [`skills/`](./skills/),
the n8n workflow generators in [`workflows/`](./workflows/) and their tests, and
its own durable memory (`MEMORY.md` and dated files under [`memory/`](./memory/)).

**It does not own** the Discord or provider credentials, the host baseline —
OpenClaw configuration, pinned software and services, `/keys`, users, SSH,
networking, Docker, and checkout provisioning below `~/app`, which
`hannosirkel/orange` manages — or private conversation exports. No credential
value is ever committed here. `ACCESS.md` names the managed locations.

## Layout

| Path | Holds |
| --- | --- |
| root `*.md` | the agent's runtime instructions and live state |
| [`docs/current/`](./docs/current/) | implemented behavior and operating contracts |
| [`docs/decisions/`](./docs/decisions/) | numbered decision records |
| [`memory/`](./memory/) | dated working memory |
| [`skills/`](./skills/) | reusable executable skills |
| [`workflows/`](./workflows/) | n8n workflow generators and their generated `workflow.json` |
| [`tests/`](./tests/) | repository tests |

The root document set is an approved exception to the central documentation
layout. See
[`docs/decisions/0004-keep-the-root-instruction-documents.md`](./docs/decisions/0004-keep-the-root-instruction-documents.md).

## Development

```bash
bash scripts/validate
```

`scripts/validate` runs the Python tests, each workflow's Node logic test, the
`bats` pre-push hook test, and a regeneration check that proves every committed
`workflow.json` matches its generator. It needs `python3`, `node`, and `bats`.

## Governance

Cross-repository standards and initiatives live in
[`hannosirkel/architecture`](https://github.com/hannosirkel/architecture).
[`AGENTS.md`](./AGENTS.md) is the authoritative instruction file for agents
working here.
