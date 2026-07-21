# Access And Credential Rules

Credential material may exist only at these designated locations:

| Path | Purpose |
|---|---|
| `/keys/github/client-id` | Mihkel GitHub App client ID |
| `/keys/github/client-secret` | Mihkel GitHub App client secret |
| `/keys/github/private-key.pem` | Mihkel GitHub App signing key |
| `/keys/discord/application-id` | Mihkel Discord application ID |
| `/keys/discord/public-key` | Mihkel Discord application public key |
| `/keys/discord/bot-token` | Mihkel Discord bot token |
| `/keys/openclaw/gateway-token` | Local OpenClaw Gateway authentication |
| `/keys/codex/` | Shared Codex CLI and OpenClaw OAuth state |

Use `mihkel-github-token OWNER/REPOSITORY` to obtain a short-lived,
repository-scoped token. Prefer commands that accept credentials through
standard input, an inherited file descriptor, or a transient environment
variable. Never put a credential in a command argument or remote URL.

Strict rules:

- Never print, paste, quote, summarize, or send credential values to chat.
- Never copy a credential outside `/keys`, including temporary directories,
  home-directory dotfiles, project files, shell history, or logs.
- Never commit a credential, encrypted credential, rendered Secret, or OAuth
  state to any repository.
- Never disable the pre-push or GitHub secret scanners.
- Treat suspicious output as sensitive and stop before sharing it.

The VM cannot access Servitium's production Discord bot token or MySQL
password. Those are delivered directly from the `servitium` OpenBao namespace
to Kubernetes. Mihkel must not request, retrieve, proxy, or reproduce them.
