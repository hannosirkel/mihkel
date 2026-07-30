---
name: n8n
description: Use when Mihkel needs to inspect or manage workflows or executions on the private bot-only n8n instance, or invoke the fixed servers or salmon workflow.
---

# n8n

## Overview

Use the narrow helper for every n8n operation. It targets
`https://orange.future.ee:8013/api/v1`, reads the owner API key only from
`/keys/n8n/api-key`, verifies TLS, and exposes no arbitrary-request command.
The `servers` and `salmon` commands separately post an empty JSON object to
their fixed `https://orange.future.ee:8013/webhook/mihkel-servers` and
`https://orange.future.ee:8013/webhook/mihkel-salmon` endpoints with the
managed `/keys/n8n/webhook-key`.

```bash
python3 skills/n8n/scripts/n8n_api.py --help
```

## Operating pattern

1. List or get the existing object.
2. Describe the smallest intended change.
3. Obtain explicit confirmation when the helper requires `--confirm`.
4. Supply one JSON object through a named file or standard input.
5. Report affected workflow or execution IDs and a sanitized result.

Preserve workflow IDs and unrelated fields. Never print, quote, summarize, or
persist the API key or credential data referenced by workflows. Never install
community nodes or packages.

## Commands

| Area | Commands |
|---|---|
| Workflows | `workflow-list`, `workflow-get`, `workflow-create`, `workflow-update`, `workflow-activate`, `workflow-deactivate`, `workflow-delete` |
| Executions | `execution-list`, `execution-get`, `execution-retry`, `execution-stop` |
| Automation | `servers`, `salmon` |

Use `COMMAND --help` for arguments. Lists follow n8n cursors within a bounded
page limit. Safe GET requests receive bounded retries; mutations do not.

```bash
python3 skills/n8n/scripts/n8n_api.py workflow-list --active true
python3 skills/n8n/scripts/n8n_api.py workflow-get WORKFLOW_ID
python3 skills/n8n/scripts/n8n_api.py workflow-create --input /path/to/workflow.json
python3 skills/n8n/scripts/n8n_api.py execution-list --status error
python3 skills/n8n/scripts/n8n_api.py servers
python3 skills/n8n/scripts/n8n_api.py salmon
```

`servers` and `salmon` have no URL, path, header, key-file, body, retry,
redirect, or insecure-TLS override. Each posts exactly `{}` once and returns
only the workflow's sanitized JSON response.

## Confirmation boundary

Inspect first, then obtain explicit user confirmation before:

- replacing a workflow definition;
- activating, deactivating, or deleting a workflow;
- retrying or stopping an execution.

Only then rerun with `--confirm`. Retrying can repeat external side effects.

## Scope

This is the bot-purpose owner's account-wide Community API key. VM root can
read it and call the API directly, so the helper is a supported interface and
accident guardrail rather than an authorization boundary. Workflow editing can
execute code and reference existing n8n credential IDs.

The explicit Orange `playbooks/n8n-credentials.yml` lifecycle owns credential
objects. The helper excludes credential CRUD, execution deletion, users,
source control, audit, arbitrary API paths, and package installation. No
Headlamp or Kubernetes credential or access is provided.

On failure, report the helper's sanitized error kind, HTTP status when present,
and next diagnostic step. Never work around an unsupported Community API
operation with an internal endpoint.
