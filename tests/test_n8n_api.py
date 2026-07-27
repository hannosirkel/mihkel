"""Contract tests for the reviewed n8n Community API helper."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import ssl
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import unittest
import urllib.error
from unittest import mock


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = REPOSITORY_ROOT / "skills/n8n/scripts/n8n_api.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("n8n_api", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load n8n helper")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeN8nHandler(BaseHTTPRequestHandler):
    requests: list[dict[str, object]] = []
    responses: list[tuple[int, object]] = []

    def _handle(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length else b""
        body = json.loads(raw_body) if raw_body else None
        self.__class__.requests.append(
            {
                "method": self.command,
                "path": self.path,
                "headers": dict(self.headers),
                "body": body,
            }
        )
        status, payload = self.__class__.responses.pop(0)
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    do_GET = _handle
    do_POST = _handle
    do_PUT = _handle
    do_PATCH = _handle
    do_DELETE = _handle

    def log_message(self, _format: str, *_args: object) -> None:
        return


class N8nApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeN8nHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def setUp(self) -> None:
        self.module = load_helper()
        self.temp_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_directory.cleanup)
        self.key_path = Path(self.temp_directory.name) / "api-key"
        self.api_key = "sentinel-api-value"
        self.key_path.write_text(self.api_key + "\n", encoding="utf-8")
        self.module.API_KEY_FILE = self.key_path
        self.module.BASE_URL = (
            f"http://127.0.0.1:{self.server.server_address[1]}/api/v1"
        )
        self.webhook_key_path = Path(self.temp_directory.name) / "webhook-key"
        self.webhook_key = "sentinel-webhook-value"
        self.webhook_key_path.write_text(
            self.webhook_key + "\n", encoding="utf-8"
        )
        self.module.WEBHOOK_KEY_FILE = self.webhook_key_path
        self.module.WEBHOOK_URLS = {
            "servers": (
                f"http://127.0.0.1:{self.server.server_address[1]}"
                "/webhook/mihkel-servers"
            ),
            "salmon": (
                f"http://127.0.0.1:{self.server.server_address[1]}"
                "/webhook/mihkel-salmon"
            ),
        }
        FakeN8nHandler.requests = []
        FakeN8nHandler.responses = []

    def run_cli(
        self, *arguments: str, stdin: str = ""
    ) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(sys, "stdin", io.StringIO(stdin)),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            result = self.module.main(list(arguments))
        return result, stdout.getvalue(), stderr.getvalue()

    def test_fixed_security_configuration_and_no_secret_inputs(self) -> None:
        self.assertEqual(
            self.module.BASE_URL_PRODUCTION,
            "https://orange.future.ee:8013/api/v1",
        )
        self.assertEqual(
            self.module.API_KEY_FILE_PRODUCTION,
            Path("/keys/n8n/api-key"),
        )
        self.assertEqual(
            self.module.WEBHOOK_URLS_PRODUCTION,
            {
                "servers": (
                    "https://orange.future.ee:8013/webhook/mihkel-servers"
                ),
                "salmon": (
                    "https://orange.future.ee:8013/webhook/mihkel-salmon"
                ),
            },
        )
        self.assertEqual(
            self.module.WEBHOOK_KEY_FILE_PRODUCTION,
            Path("/keys/n8n/webhook-key"),
        )
        self.assertNotIn("N8N_BASE_URL", self.module.__dict__.get("ENV_KEYS", ()))
        parser_help = self.module.build_parser().format_help()
        self.assertNotIn("--api-key", parser_help)
        self.assertNotIn("--base-url", parser_help)
        self.assertNotIn("--insecure", parser_help)
        self.assertNotIn("--path", parser_help)
        self.assertNotIn("--webhook-url", parser_help)
        self.assertNotIn("--webhook-key", parser_help)
        self.assertNotIn("--header", parser_help)
        self.assertNotIn("--retry", parser_help)

    def test_tls_uses_verified_default_context(self) -> None:
        self.module.BASE_URL = self.module.BASE_URL_PRODUCTION
        client = self.module.ApiClient()
        self.assertTrue(client.context.check_hostname)
        self.assertEqual(client.context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(
            any(
                isinstance(handler, self.module.NoRedirectHandler)
                for handler in client.opener.handlers
            )
        )
        webhook_client = self.module.WebhookClient()
        self.assertTrue(webhook_client.context.check_hostname)
        self.assertEqual(webhook_client.context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(
            any(
                isinstance(handler, self.module.NoRedirectHandler)
                for handler in webhook_client.opener.handlers
            )
        )

    def test_fixed_webhooks_post_exact_request_without_owner_key(self) -> None:
        self.module.API_KEY_FILE = Path(self.temp_directory.name) / "missing-api-key"
        operations = (
            (
                "servers",
                "/webhook/mihkel-servers",
                {"servers": [{"name": "Example", "online": True}]},
            ),
            (
                "salmon",
                "/webhook/mihkel-salmon",
                {"products": [{"name": "Example salmon"}]},
            ),
        )
        for operation, path, payload in operations:
            with self.subTest(operation=operation):
                FakeN8nHandler.requests = []
                FakeN8nHandler.responses = [(200, payload)]
                result, stdout, stderr = self.run_cli(operation)

                self.assertEqual((result, stderr), (0, ""))
                self.assertEqual(json.loads(stdout), payload)
                self.assertEqual(len(FakeN8nHandler.requests), 1)
                request = FakeN8nHandler.requests[0]
                self.assertEqual(request["method"], "POST")
                self.assertEqual(request["path"], path)
                self.assertEqual(request["body"], {})
                normalized_headers = {
                    key.lower(): value
                    for key, value in request["headers"].items()
                }
                self.assertEqual(
                    normalized_headers["x-n8n-webhook-key"],
                    self.webhook_key,
                )
                self.assertNotIn(self.webhook_key, stdout + stderr)

    def test_fixed_webhooks_do_not_retry_http_or_transport_failures(self) -> None:
        for operation in ("servers", "salmon"):
            with self.subTest(operation=operation, failure="http"):
                FakeN8nHandler.requests = []
                FakeN8nHandler.responses = [
                    (503, {"message": "temporary sentinel-webhook-value"}),
                    (200, {"must": "not run"}),
                ]
                result, stdout, stderr = self.run_cli(operation)
                self.assertEqual(result, 1)
                self.assertEqual(stdout, "")
                self.assertEqual(len(FakeN8nHandler.requests), 1)
                self.assertNotIn(self.webhook_key, stderr)

            with self.subTest(operation=operation, failure="transport"):
                opener = mock.Mock()
                opener.open.side_effect = urllib.error.URLError("unavailable")
                with mock.patch.object(
                    self.module.urllib.request,
                    "build_opener",
                    return_value=opener,
                ):
                    result, stdout, _stderr = self.run_cli(operation)
                self.assertEqual(result, 1)
                self.assertEqual(stdout, "")
                opener.open.assert_called_once()

    def test_fixed_webhooks_reject_redirects_and_invalid_json(self) -> None:
        invalid_response = mock.MagicMock()
        invalid_response.__enter__.return_value.read.return_value = b"not json"
        empty_response = mock.MagicMock()
        empty_response.__enter__.return_value.read.return_value = b""
        for operation in ("servers", "salmon"):
            redirect = urllib.error.HTTPError(
                self.module.WEBHOOK_URLS[operation],
                302,
                "redirect",
                {"Location": "https://example.invalid/"},
                io.BytesIO(b"{}"),
            )
            for side_effect in (redirect, invalid_response, empty_response):
                with self.subTest(
                    operation=operation,
                    side_effect=type(side_effect).__name__,
                ):
                    opener = mock.Mock()
                    if isinstance(side_effect, Exception):
                        opener.open.side_effect = side_effect
                    else:
                        opener.open.return_value = side_effect
                    with mock.patch.object(
                        self.module.urllib.request,
                        "build_opener",
                        return_value=opener,
                    ):
                        result, stdout, stderr = self.run_cli(operation)
                    self.assertEqual(result, 1)
                    self.assertEqual(stdout, "")
                    self.assertNotIn(self.webhook_key, stderr)
                    opener.open.assert_called_once()

    def test_fixed_webhooks_reject_empty_key_without_network_access(self) -> None:
        self.webhook_key_path.write_text("", encoding="utf-8")
        for operation in ("servers", "salmon"):
            with self.subTest(operation=operation):
                with mock.patch.object(
                    self.module.urllib.request,
                    "build_opener",
                ) as build_opener:
                    result, stdout, stderr = self.run_cli(operation)
                self.assertEqual(result, 1)
                self.assertEqual(stdout, "")
                self.assertIn("webhook key file is empty", stderr)
                build_opener.assert_not_called()

    def test_header_pagination_and_stable_json(self) -> None:
        FakeN8nHandler.responses = [
            (200, {"data": [{"id": "b"}], "nextCursor": "page-two"}),
            (200, {"data": [{"id": "a"}], "nextCursor": None}),
        ]
        result, stdout, stderr = self.run_cli("workflow-list", "--limit", "1")
        self.assertEqual(result, 0)
        self.assertEqual(stderr, "")
        self.assertEqual(
            json.loads(stdout),
            {"data": [{"id": "b"}, {"id": "a"}], "nextCursor": None},
        )
        self.assertEqual(len(FakeN8nHandler.requests), 2)
        self.assertIn("limit=1", FakeN8nHandler.requests[0]["path"])
        self.assertIn("cursor=page-two", FakeN8nHandler.requests[1]["path"])
        for request in FakeN8nHandler.requests:
            normalized_headers = {
                key.lower(): value for key, value in request["headers"].items()
            }
            self.assertEqual(
                normalized_headers["x-n8n-api-key"],
                self.api_key,
            )
        self.assertNotIn(self.api_key, stdout + stderr)

    def test_documented_workflow_commands_and_confirmation(self) -> None:
        payload = {"name": "Bot", "nodes": [], "connections": {}, "settings": {}}
        input_path = Path(self.temp_directory.name) / "workflow.json"
        input_path.write_text(json.dumps(payload), encoding="utf-8")
        commands = [
            (("workflow-get", "wf_1"), "GET", "/workflows/wf_1", None),
            (
                ("workflow-create", "--input", str(input_path)),
                "POST",
                "/workflows",
                payload,
            ),
            (
                ("workflow-update", "wf_1", "--input", "-", "--confirm"),
                "PUT",
                "/workflows/wf_1",
                payload,
            ),
            (
                ("workflow-activate", "wf_1", "--confirm"),
                "POST",
                "/workflows/wf_1/activate",
                None,
            ),
            (
                ("workflow-deactivate", "wf_1", "--confirm"),
                "POST",
                "/workflows/wf_1/deactivate",
                None,
            ),
            (
                ("workflow-delete", "wf_1", "--confirm"),
                "DELETE",
                "/workflows/wf_1",
                None,
            ),
        ]
        for arguments, method, path, expected_body in commands:
            with self.subTest(arguments=arguments):
                FakeN8nHandler.requests = []
                FakeN8nHandler.responses = [(200, {"id": "wf_1"})]
                result, stdout, stderr = self.run_cli(
                    *arguments,
                    stdin=json.dumps(payload) if "-" in arguments else "",
                )
                self.assertEqual((result, stderr), (0, ""))
                self.assertEqual(json.loads(stdout), {"id": "wf_1"})
                request = FakeN8nHandler.requests[0]
                self.assertEqual(request["method"], method)
                self.assertEqual(request["path"], f"/api/v1{path}")
                self.assertEqual(request["body"], expected_body)
        for command in (
            ("workflow-update", "wf_1", "--input", str(input_path)),
            ("workflow-activate", "wf_1"),
            ("workflow-deactivate", "wf_1"),
            ("workflow-delete", "wf_1"),
        ):
            with self.subTest(missing_confirmation=command):
                FakeN8nHandler.requests = []
                result, _stdout, stderr = self.run_cli(*command)
                self.assertEqual(result, 2)
                self.assertIn("confirmation required", stderr)
                self.assertEqual(FakeN8nHandler.requests, [])

    def test_documented_credential_commands_redact_secret_data(self) -> None:
        payload = {
            "name": "Example",
            "type": "httpHeaderAuth",
            "data": {"name": "Authorization", "value": "sentinel-credential-value"},
        }
        FakeN8nHandler.responses = [
            (200, {"data": [{"id": "cred_1", "name": "Example"}]}),
            (200, {"id": "cred_1", "name": "Example"}),
            (200, {"id": "cred_1", **payload}),
            (200, {"id": "cred_1", **payload}),
            (200, {"id": "cred_1", **payload}),
        ]
        invocations = [
            ("credential-list",),
            ("credential-get", "cred_1"),
            ("credential-create", "--input", "-"),
            ("credential-update", "cred_1", "--input", "-", "--confirm"),
            ("credential-delete", "cred_1", "--confirm"),
        ]
        expected = [
            ("GET", "/api/v1/credentials"),
            ("GET", "/api/v1/credentials/cred_1"),
            ("POST", "/api/v1/credentials"),
            ("PATCH", "/api/v1/credentials/cred_1"),
            ("DELETE", "/api/v1/credentials/cred_1"),
        ]
        combined_output = ""
        for invocation in invocations:
            result, stdout, stderr = self.run_cli(
                *invocation,
                stdin=json.dumps(payload) if "--input" in invocation else "",
            )
            self.assertEqual((result, stderr), (0, ""))
            combined_output += stdout
        self.assertEqual(
            [
                (
                    request["method"],
                    request["path"].split("?", 1)[0],
                )
                for request in FakeN8nHandler.requests
            ],
            expected,
        )
        self.assertNotIn("sentinel-credential-value", combined_output)
        self.assertIn("[REDACTED]", combined_output)
        for command in (
            ("credential-update", "cred_1", "--input", "-"),
            ("credential-delete", "cred_1"),
        ):
            result, _stdout, stderr = self.run_cli(
                *command,
                stdin=json.dumps(payload),
            )
            self.assertEqual(result, 2)
            self.assertIn("confirmation required", stderr)

    def test_documented_execution_commands(self) -> None:
        commands = [
            (("execution-list", "--status", "error"), "GET", "/executions"),
            (("execution-get", "exec_1"), "GET", "/executions/exec_1"),
            (("execution-retry", "exec_1"), "POST", "/executions/exec_1/retry"),
            (
                ("execution-stop", "exec_1", "--confirm"),
                "POST",
                "/executions/exec_1/stop",
            ),
            (
                ("execution-delete", "exec_1", "--confirm"),
                "DELETE",
                "/executions/exec_1",
            ),
        ]
        for arguments, method, path in commands:
            with self.subTest(arguments=arguments):
                FakeN8nHandler.requests = []
                FakeN8nHandler.responses = [(200, {"id": "exec_1"})]
                result, _stdout, stderr = self.run_cli(*arguments)
                self.assertEqual((result, stderr), (0, ""))
                request = FakeN8nHandler.requests[0]
                self.assertEqual(request["method"], method)
                self.assertTrue(request["path"].startswith(f"/api/v1{path}"))
                if method == "GET":
                    self.assertIn("redactExecutionData=true", request["path"])
        for command in (
            ("execution-stop", "exec_1"),
            ("execution-delete", "exec_1"),
        ):
            result, _stdout, stderr = self.run_cli(*command)
            self.assertEqual(result, 2)
            self.assertIn("confirmation required", stderr)

    def test_json_errors_are_sanitized_and_nonzero(self) -> None:
        FakeN8nHandler.responses = [
            (
                400,
                {
                    "message": "invalid credential",
                    "data": {"apiKey": "sentinel-server-value"},
                },
            )
        ]
        result, stdout, stderr = self.run_cli("workflow-get", "wf_1")
        self.assertEqual(result, 1)
        self.assertEqual(stdout, "")
        error = json.loads(stderr)
        self.assertEqual(error["error"]["kind"], "http")
        self.assertEqual(error["error"]["status"], 400)
        self.assertEqual(error["error"]["message"], "invalid credential")
        self.assertNotIn("sentinel-server-value", stderr)

    def test_safe_get_retries_are_bounded_but_mutations_are_not_retried(self) -> None:
        FakeN8nHandler.responses = [
            (503, {"message": "temporary"}),
            (503, {"message": "temporary"}),
            (200, {"id": "wf_1"}),
        ]
        with mock.patch.object(self.module.time, "sleep"):
            result, _stdout, stderr = self.run_cli("workflow-get", "wf_1")
        self.assertEqual((result, stderr), (0, ""))
        self.assertEqual(len(FakeN8nHandler.requests), 3)

        FakeN8nHandler.requests = []
        FakeN8nHandler.responses = [(503, {"message": "do not retry"})]
        result, _stdout, _stderr = self.run_cli(
            "workflow-create",
            "--input",
            "-",
            stdin='{"name":"Bot","nodes":[],"connections":{},"settings":{}}',
        )
        self.assertEqual(result, 1)
        self.assertEqual(len(FakeN8nHandler.requests), 1)

    def test_arbitrary_and_privileged_interfaces_are_absent(self) -> None:
        parser = self.module.build_parser()
        commands = set(parser._subparsers._group_actions[0].choices)
        forbidden = {
            "raw",
            "request",
            "users",
            "source-control",
            "audit",
            "packages",
            "community-packages",
            "install-package",
        }
        self.assertTrue(commands.isdisjoint(forbidden))
        self.assertIn("servers", commands)
        self.assertIn("salmon", commands)
        result, stdout, stderr = self.run_cli(
            "raw",
            "GET",
            "/users",
            "POSSIBLY_SENSITIVE_ARGUMENT",
        )
        self.assertEqual(result, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, "invalid command arguments; use --help\n")
        self.assertNotIn("POSSIBLY_SENSITIVE_ARGUMENT", stderr)

    def test_input_must_be_json_object_and_ids_cannot_escape_paths(self) -> None:
        for input_value in ("[]", '"string"', "null"):
            with self.subTest(input_value=input_value):
                result, _stdout, stderr = self.run_cli(
                    "workflow-create", "--input", "-", stdin=input_value
                )
                self.assertEqual(result, 2)
                self.assertIn("JSON object", stderr)
        result, _stdout, stderr = self.run_cli("workflow-get", "../users")
        self.assertEqual(result, 2)
        self.assertIn("invalid identifier", stderr)
        self.assertEqual(FakeN8nHandler.requests, [])


if __name__ == "__main__":
    unittest.main()
