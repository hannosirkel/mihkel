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

The Community API key has the bot-purpose owner's account-wide API authority.
VM root can call the API directly, and workflow editing can execute code and
reference existing credential IDs. The helper is a supported interface and
accident guardrail, not a hard authorization boundary. It supports workflow
CRUD and activation plus execution list, get, retry, and stop; retry and stop
require explicit confirmation. Orange's explicit lifecycle exclusively owns
credential objects, and execution deletion is outside Mihkel's supported
surface.

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

The VM receives no Servitium live or test application credential. Root inside
the disposable VM can use all credentials deliberately installed there, so
Orange's network and virtualization policy plus external provider scope form
the enforceable boundary.

The managed Git configuration activates the repository's tracked `.githooks`
directory. Its fail-closed pre-commit hook scans staged changes with gitleaks;
the pre-push hook scans outgoing history. A missing gitleaks binary blocks the
operation rather than silently skipping secret detection.
