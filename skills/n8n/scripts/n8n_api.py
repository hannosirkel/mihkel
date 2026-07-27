#!/usr/bin/env python3
"""Narrow, credential-safe client for the n8n Community API."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import re
import ssl
import sys
import time
from typing import Any
import urllib.error
import urllib.parse
import urllib.request


BASE_URL_PRODUCTION = "https://orange.future.ee:8013/api/v1"
API_KEY_FILE_PRODUCTION = Path("/keys/n8n/api-key")
WEBHOOK_URLS_PRODUCTION = {
    "servers": "https://orange.future.ee:8013/webhook/mihkel-servers",
    "salmon": "https://orange.future.ee:8013/webhook/mihkel-salmon",
}
WEBHOOK_KEY_FILE_PRODUCTION = Path("/keys/n8n/webhook-key")
BASE_URL = BASE_URL_PRODUCTION
API_KEY_FILE = API_KEY_FILE_PRODUCTION
WEBHOOK_URLS = WEBHOOK_URLS_PRODUCTION
WEBHOOK_KEY_FILE = WEBHOOK_KEY_FILE_PRODUCTION
ENV_KEYS: tuple[str, ...] = ()
REQUEST_TIMEOUT_SECONDS = 15
MAX_SAFE_ATTEMPTS = 3
MAX_PAGES = 10
RETRYABLE_STATUS_CODES = {429, 502, 503, 504}
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
SENSITIVE_KEY_PARTS = (
    "password",
    "secret",
    "token",
    "apikey",
    "api_key",
    "privatekey",
    "private_key",
    "authorization",
)


class CliError(Exception):
    """An invocation failed local validation."""


class SafeArgumentParser(argparse.ArgumentParser):
    """Reject malformed commands without echoing possibly sensitive arguments."""

    def error(self, _message: str) -> None:
        raise CliError("invalid command arguments; use --help")


@dataclass
class ApiError(Exception):
    """A sanitized n8n or transport failure."""

    kind: str
    message: str
    status: int | None = None


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep the owner API key on the configured origin."""

    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> None:
        return None


def build_parser() -> argparse.ArgumentParser:
    parser = SafeArgumentParser(
        description="Operate the approved n8n Community API surface."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    workflow_list = subparsers.add_parser("workflow-list")
    add_list_options(workflow_list)
    workflow_list.add_argument("--active", choices=("true", "false"))
    workflow_list.add_argument("--name")
    workflow_list.add_argument("--tags")

    add_id_command(subparsers, "workflow-get")
    workflow_create = subparsers.add_parser("workflow-create")
    add_input_option(workflow_create)
    workflow_update = add_id_command(subparsers, "workflow-update")
    add_input_option(workflow_update)
    add_confirmation(workflow_update)
    add_confirmation(add_id_command(subparsers, "workflow-activate"))
    add_confirmation(add_id_command(subparsers, "workflow-deactivate"))
    add_confirmation(add_id_command(subparsers, "workflow-delete"))

    credential_list = subparsers.add_parser("credential-list")
    add_list_options(credential_list)
    add_id_command(subparsers, "credential-get")
    credential_create = subparsers.add_parser("credential-create")
    add_input_option(credential_create)
    credential_update = add_id_command(subparsers, "credential-update")
    add_input_option(credential_update)
    add_confirmation(credential_update)
    add_confirmation(add_id_command(subparsers, "credential-delete"))

    execution_list = subparsers.add_parser("execution-list")
    add_list_options(execution_list)
    execution_list.add_argument(
        "--status",
        choices=(
            "canceled",
            "crashed",
            "error",
            "new",
            "running",
            "success",
            "unknown",
            "waiting",
        ),
    )
    execution_list.add_argument("--workflow-id")
    add_id_command(subparsers, "execution-get")
    execution_retry = add_id_command(subparsers, "execution-retry")
    execution_retry.add_argument(
        "--latest-workflow",
        action="store_true",
        help="Retry with the current saved workflow definition.",
    )
    add_confirmation(add_id_command(subparsers, "execution-stop"))
    add_confirmation(add_id_command(subparsers, "execution-delete"))
    subparsers.add_parser("servers")
    subparsers.add_parser("salmon")
    return parser


def add_id_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
    name: str,
) -> argparse.ArgumentParser:
    command = subparsers.add_parser(name)
    command.add_argument("id")
    return command


def add_input_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--input",
        required=True,
        metavar="FILE|-",
        help="Read one JSON object from a named file or standard input.",
    )


def add_confirmation(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm the reviewed state-changing operation.",
    )


def add_list_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--limit", type=positive_limit, default=100)
    parser.add_argument("--cursor")


def positive_limit(raw_value: str) -> int:
    value = int(raw_value)
    if value < 1 or value > 250:
        raise argparse.ArgumentTypeError("limit must be between 1 and 250")
    return value


def require_identifier(value: str) -> str:
    if not IDENTIFIER_PATTERN.fullmatch(value):
        raise CliError("invalid identifier")
    return value


def require_confirmation(arguments: argparse.Namespace) -> None:
    if not arguments.confirm:
        raise CliError("confirmation required; inspect the object, then add --confirm")


def read_json_object(source: str) -> dict[str, Any]:
    try:
        if source == "-":
            raw_value = sys.stdin.read()
        else:
            raw_value = Path(source).read_text(encoding="utf-8")
        value = json.loads(raw_value)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise CliError(f"unable to read JSON input: {error}") from None
    if not isinstance(value, dict):
        raise CliError("input must be one JSON object")
    return value


def read_api_key() -> str:
    try:
        api_key = API_KEY_FILE.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as error:
        raise ApiError("configuration", f"unable to read API key file: {error}") from None
    if not api_key:
        raise ApiError("configuration", "API key file is empty")
    return api_key


def read_webhook_key() -> str:
    try:
        webhook_key = WEBHOOK_KEY_FILE.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as error:
        raise ApiError(
            "configuration",
            f"unable to read webhook key file: {error}",
        ) from None
    if not webhook_key:
        raise ApiError("configuration", "webhook key file is empty")
    return webhook_key


def sanitize(value: Any, *, credential_context: bool = False) -> Any:
    if isinstance(value, list):
        return [
            sanitize(item, credential_context=credential_context)
            for item in value
        ]
    if not isinstance(value, dict):
        return value
    sanitized: dict[str, Any] = {}
    for key, item in value.items():
        normalized_key = key.lower().replace("-", "_")
        is_sensitive = any(
            part in normalized_key for part in SENSITIVE_KEY_PARTS
        )
        is_credential_data = (
            credential_context
            and normalized_key == "data"
            and isinstance(item, dict)
        )
        if is_sensitive or is_credential_data:
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = sanitize(
                item,
                credential_context=credential_context,
            )
    return sanitized


def stable_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def response_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        for key in ("message", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return fallback


class ApiClient:
    def __init__(self) -> None:
        self.api_key = read_api_key()
        self.context = ssl.create_default_context()
        self.opener = urllib.request.build_opener(
            NoRedirectHandler(),
            urllib.request.HTTPSHandler(context=self.context),
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> Any:
        url = BASE_URL.rstrip("/") + path
        filtered_query = {
            key: str(value).lower() if isinstance(value, bool) else value
            for key, value in (query or {}).items()
            if value is not None
        }
        if filtered_query:
            url += "?" + urllib.parse.urlencode(filtered_query)
        encoded_body = (
            stable_json(body).encode("utf-8") if body is not None else None
        )
        attempts = MAX_SAFE_ATTEMPTS if method == "GET" else 1
        for attempt in range(attempts):
            request = urllib.request.Request(
                url,
                data=encoded_body,
                method=method,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-N8N-API-KEY": self.api_key,
                },
            )
            try:
                with self.opener.open(
                    request,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                ) as response:
                    payload = parse_response(response.read())
                    return payload
            except urllib.error.HTTPError as error:
                payload = parse_response(error.read(), allow_empty=True)
                if error.code in RETRYABLE_STATUS_CODES and attempt + 1 < attempts:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                message = response_message(payload, f"HTTP {error.code}")
                raise ApiError("http", scrub(message, self.api_key), error.code) from None
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                if attempt + 1 < attempts:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                raise ApiError(
                    "transport",
                    scrub(str(error.reason if hasattr(error, "reason") else error), self.api_key),
                ) from None
        raise ApiError("transport", "request attempts exhausted")

    def list_all(self, path: str, query: dict[str, Any]) -> Any:
        combined: list[Any] = []
        cursor = query.get("cursor")
        for _page_number in range(MAX_PAGES):
            page_query = dict(query)
            page_query["cursor"] = cursor
            page = self.request("GET", path, query=page_query)
            if not isinstance(page, dict) or not isinstance(page.get("data"), list):
                return page
            combined.extend(page["data"])
            cursor = page.get("nextCursor")
            if not cursor:
                return {"data": combined, "nextCursor": None}
        raise ApiError(
            "pagination",
            f"pagination exceeded the {MAX_PAGES}-page safety bound",
        )


class WebhookClient:
    """Invoke an approved fixed production workflow webhook."""

    def __init__(self) -> None:
        self.webhook_key = read_webhook_key()
        self.context = ssl.create_default_context()
        self.opener = urllib.request.build_opener(
            NoRedirectHandler(),
            urllib.request.HTTPSHandler(context=self.context),
        )

    def invoke(self, operation: str) -> Any:
        try:
            webhook_url = WEBHOOK_URLS[operation]
        except KeyError:
            raise CliError("unsupported webhook operation") from None
        request = urllib.request.Request(
            webhook_url,
            data=b"{}",
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-N8N-Webhook-Key": self.webhook_key,
            },
        )
        try:
            with self.opener.open(
                request,
                timeout=REQUEST_TIMEOUT_SECONDS,
            ) as response:
                return redact_value(
                    parse_response(response.read()),
                    self.webhook_key,
                )
        except urllib.error.HTTPError as error:
            payload = parse_response(error.read(), allow_empty=True)
            message = response_message(payload, f"HTTP {error.code}")
            raise ApiError(
                "http",
                scrub(message, self.webhook_key),
                error.code,
            ) from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            message = str(error.reason if hasattr(error, "reason") else error)
            raise ApiError(
                "transport",
                scrub(message, self.webhook_key),
            ) from None


def parse_response(raw_value: bytes, *, allow_empty: bool = False) -> Any:
    if not raw_value:
        if allow_empty:
            return {}
        raise ApiError("response", "n8n returned an empty response")
    try:
        return json.loads(raw_value.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        raise ApiError("response", "n8n returned invalid JSON") from None


def scrub(value: str, api_key: str) -> str:
    return value.replace(api_key, "[REDACTED]") if api_key else value


def redact_value(value: Any, secret: str) -> Any:
    if isinstance(value, str):
        return scrub(value, secret)
    if isinstance(value, list):
        return [redact_value(item, secret) for item in value]
    if isinstance(value, dict):
        return {
            key: redact_value(item, secret)
            for key, item in value.items()
        }
    return value


def dispatch(arguments: argparse.Namespace, client: ApiClient) -> tuple[Any, bool]:
    command = arguments.command
    credential_context = command.startswith("credential-")

    if command == "workflow-list":
        query = {
            "limit": arguments.limit,
            "cursor": arguments.cursor,
            "active": arguments.active,
            "name": arguments.name,
            "tags": arguments.tags,
        }
        return client.list_all("/workflows", query), False
    if command == "workflow-get":
        identifier = require_identifier(arguments.id)
        return client.request("GET", f"/workflows/{identifier}"), False
    if command == "workflow-create":
        return client.request(
            "POST", "/workflows", body=read_json_object(arguments.input)
        ), False
    if command == "workflow-update":
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        return client.request(
            "PUT",
            f"/workflows/{identifier}",
            body=read_json_object(arguments.input),
        ), False
    if command in ("workflow-activate", "workflow-deactivate"):
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        action = command.removeprefix("workflow-")
        return client.request(
            "POST", f"/workflows/{identifier}/{action}"
        ), False
    if command == "workflow-delete":
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        return client.request("DELETE", f"/workflows/{identifier}"), False

    if command == "credential-list":
        return client.list_all(
            "/credentials",
            {"limit": arguments.limit, "cursor": arguments.cursor},
        ), credential_context
    if command == "credential-get":
        identifier = require_identifier(arguments.id)
        return client.request("GET", f"/credentials/{identifier}"), credential_context
    if command == "credential-create":
        return client.request(
            "POST", "/credentials", body=read_json_object(arguments.input)
        ), credential_context
    if command == "credential-update":
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        return client.request(
            "PATCH",
            f"/credentials/{identifier}",
            body=read_json_object(arguments.input),
        ), credential_context
    if command == "credential-delete":
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        return client.request("DELETE", f"/credentials/{identifier}"), credential_context

    if command == "execution-list":
        return client.list_all(
            "/executions",
            {
                "limit": arguments.limit,
                "cursor": arguments.cursor,
                "status": arguments.status,
                "workflowId": arguments.workflow_id,
                "redactExecutionData": True,
            },
        ), False
    if command == "execution-get":
        identifier = require_identifier(arguments.id)
        return client.request(
            "GET",
            f"/executions/{identifier}",
            query={"redactExecutionData": True},
        ), False
    if command == "execution-retry":
        identifier = require_identifier(arguments.id)
        body = {"loadWorkflow": True} if arguments.latest_workflow else None
        return client.request(
            "POST", f"/executions/{identifier}/retry", body=body
        ), False
    if command == "execution-stop":
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        return client.request("POST", f"/executions/{identifier}/stop"), False
    if command == "execution-delete":
        require_confirmation(arguments)
        identifier = require_identifier(arguments.id)
        return client.request("DELETE", f"/executions/{identifier}"), False
    raise CliError("unsupported command")


def render_error(error: ApiError) -> str:
    details: dict[str, Any] = {
        "kind": error.kind,
        "message": error.message,
    }
    if error.status is not None:
        details["status"] = error.status
    return stable_json({"error": details})


def main(arguments: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        parsed_arguments = parser.parse_args(arguments)
        if parsed_arguments.command in WEBHOOK_URLS:
            result = WebhookClient().invoke(parsed_arguments.command)
            credential_context = False
        else:
            result, credential_context = dispatch(
                parsed_arguments,
                ApiClient(),
            )
        print(stable_json(sanitize(result, credential_context=credential_context)))
        return 0
    except CliError as error:
        print(str(error), file=sys.stderr)
        return 2
    except ApiError as error:
        print(render_error(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
