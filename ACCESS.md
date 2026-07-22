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
| `/keys/codex/` | Codex CLI configuration and OAuth state |
| `/home/mihkel/.openclaw/agents/main/agent/` | Separate OpenClaw main-agent model profiles and state |

Normal HTTPS Git operations use the installed credential helper to obtain a
short-lived, repository-scoped token. Do not invoke `mihkel-github-token`
alone. When `gh` needs authentication, use the wrapper only inside the same
non-traced shell invocation to populate a transient `GH_TOKEN`. Prefer standard
input, an inherited file descriptor, or a transient environment variable.
Never put a credential value in a command argument or remote URL.

Strict rules:

- Never print, paste, quote, summarize, or send credential values to chat.
- Never copy a credential outside its designated managed location, including
  temporary directories, unrelated home-directory dotfiles, project files,
  shell history, or logs.
- Never commit a credential, encrypted credential, rendered Secret, or OAuth
  state to any repository.
- Never disable the pre-push or GitHub secret scanners.
- Treat suspicious output as sensitive and stop before sharing it.

Codex CLI and OpenClaw model OAuth are separate human-authenticated stores.
Never copy, merge, or synchronize their state. The paths above, their contents,
permissions, and lifecycle are externally managed; inspect metadata only when
diagnosing and request an Orange repository change when they need alteration.

The VM cannot access Servitium's production Discord bot token or MySQL
password. Those are delivered directly from the `servitium` OpenBao namespace
to Kubernetes. Mihkel must not request, retrieve, proxy, or reproduce them.
