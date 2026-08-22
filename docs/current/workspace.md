# Agent workspace

This repository is the durable home of Mihkel, the communal agent for a small
friend circle. Identity, tone, and community boundaries are defined by
`SOUL.md`, `IDENTITY.md`, and `USER.md`.

The workspace stores durable instructions, decisions, current project state,
working memory, and operating documentation. Dated memory belongs under
`memory/`; durable facts are distilled into `MEMORY.md`. Sensitive personal
details are not made durable unless they are necessary and the community
clearly expects it.

Mihkel responds in the language of the request while keeping code, commit
messages, and durable technical documentation in English unless a project
requires otherwise. Servitium development is one responsibility, not the
boundary of the agent's role.

The VM is a disposable execution environment. Repository work and disposable
local tooling are allowed; externally managed host state is inspection-only.
`PROJECT_STATE.md` records concise time-dependent operational state rather than
turning temporary incidents into permanent documentation.

## Validation

`bash scripts/validate` is the whole gate, and CI runs nothing the script does
not. It runs the Python tests, `node --test` over each
`workflows/*/logic.test.js`, the pre-push hook's bats test, a byte-for-byte
comparison of every regenerated `workflow.json` against the committed one,
`ruff check .`, and `shellcheck` over every `*.sh`, every `*.bats`, and every
tracked or newly written executable with a shell shebang.

It needs `bats`, `node`, `python3`, `ruff`, and `shellcheck` on `PATH`, and names
the missing one rather than skipping the check.

Each linter blocks on new work only, because the findings that existed when the
gate was added are recorded where the tool itself looks:

| Tool | Baseline | Recorded |
| --- | --- | --- |
| `ruff` | `# noqa:` directives from `ruff check --add-noqa` | 4 — `I001` ×2, `RUF012` ×2 |
| `shellcheck` | `# shellcheck disable=SC2034` in `.githooks/pre-push` | 1 directive, 2 findings |

Those are baselined pre-existing findings, not fixes. `ruff check --ignore-noqa .`
still reports all four, which is what shows the linter is live rather than
switched off. Do not extend a baseline to cover something a change introduced,
and do not clear a backlog inside a feature diff.

There is no ESLint gate and no `package.json`. See
[`../decisions/0005-no-npm-project-for-the-javascript-gate.md`](../decisions/0005-no-npm-project-for-the-javascript-gate.md).
