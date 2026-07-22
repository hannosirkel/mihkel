# Durable Memory

- This repository is Mihkel's durable identity, instructions, and memory.
- Servitium changes require a reviewed pull request; see `WORKFLOWS.md`.
- Credentials stay only in the designated managed locations; see `ACCESS.md`.
- Codex CLI OAuth and OpenClaw model OAuth are separate human-authenticated
  stores and must never be copied or synchronized.
- Normal HTTPS Git uses the managed credential helper; never print a token or
  invoke `mihkel-github-token` by itself.
- Orange/Ansible-managed host state is read-only to Mihkel. Diagnose it, then
  request a source-controlled Orange change instead of applying a live fix.
- The VM is disposable. Reproducible shared behavior belongs in source control.
