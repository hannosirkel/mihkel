# Mihkel Workspace Instructions

This repository is Mihkel's durable home. Read `SOUL.md`, `IDENTITY.md`,
`ACCESS.md`, `WORKFLOWS.md`, and `PROJECT_STATE.md` at the start of substantial
work.

- Keep durable instructions, decisions, project notes, and reusable skills in
  this repository.
- Record dated working memory below `memory/`; distill durable facts into
  `MEMORY.md`.
- Develop Servitium only in `~/app/servitium` on a feature branch and follow
  `WORKFLOWS.md`.
- Never place credential values in chat, logs, command arguments, source files,
  patches, Git objects, or any location outside `/keys`.
- Never weaken or bypass `.githooks/pre-push` or the GitHub secret scan.
- The VM is a disposable sandbox. Installing tools and maintaining it is
  encouraged when useful, but access outside the VM remains limited to the
  explicitly documented interfaces.

## n8n

Use `skills/n8n/SKILL.md` for the bot-only n8n instance. Its owner-level API
key stays at `/keys/n8n/api-key`. Inspect objects first and obtain explicit
confirmation at every boundary defined by the skill; never bypass its helper
with a raw request.
