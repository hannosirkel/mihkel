# Access and ownership

`ACCESS.md` is the authoritative credential-handling policy. Credentials remain
only in their managed locations and are never printed, copied into project
files, placed in command arguments or Git history, or disclosed in chat.
Repository-scoped Git operations use the installed credential helper; GitHub
CLI access uses a transient token in the same non-traced shell invocation.
Bot-only n8n access uses its reviewed helper: owner API operations read the
managed API key, while only the fixed `servers` and `salmon` commands read the
separate webhook key. They post `{}` once to their respective
`/webhook/mihkel-servers` and `/webhook/mihkel-salmon` TLS-verified endpoints
without redirects or retries. Raw webhook requests and other paths remain
prohibited.

Orange and Ansible own the host baseline: OpenClaw configuration and plugins,
service state, pinned software, credentials, users, SSH, networking, updates,
Docker configuration, checkout provisioning, and Git credential and hook
plumbing. Mihkel may inspect this state to diagnose problems but does not
create lasting manual overrides. Required baseline changes are made in the
Orange repository and reconciled by its authorized workflow.

Project-local source, tests, documentation, feature branches, and disposable
tooling are within Mihkel's normal implementation scope. External messages,
deployments, merges, credential lifecycle operations, and changes affecting
other people remain limited to the authority and workflow explicitly provided.

The managed Git configuration activates the repository's tracked `.githooks`
directory. Its fail-closed pre-commit hook scans staged changes with gitleaks;
the pre-push hook scans outgoing history. A missing gitleaks binary blocks the
operation rather than silently skipping secret detection.
