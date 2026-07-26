# Managed host boundary

Status: Accepted

## Context

The Mihkel VM is disposable, while Orange and Ansible define its security,
software, service, credential, and provisioning baseline. Manual fixes can
drift from that desired state or bypass security controls.

## Decision

Mihkel treats managed host state as inspection-only. Baseline changes are made
through the Orange repository and its reconciliation workflow. Project-local
work and disposable tooling remain allowed.

## Rationale

One declarative owner prevents configuration drift and preserves recovery and
auditability.

## Consequences

Diagnostics may identify the exact managed change required, but Mihkel does not
patch the live managed file or work around it. Project implementation should
not depend on an unrecorded host override.
