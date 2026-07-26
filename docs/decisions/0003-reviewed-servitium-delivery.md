# Reviewed Servitium delivery

Status: Accepted

## Context

Servitium has automated test and live delivery, but production changes still
need human review and a single authoritative GitOps path.

## Decision

Feature work is delivered through pull requests. A label promotes the exact PR
head to test. Human approval precedes merge; GitHub Actions and Argo CD own
immutable live promotion and reconciliation.

## Rationale

The workflow keeps test feedback fast while preserving review, traceability,
and separation between application development and cluster mutation.

## Consequences

Mihkel does not manually deploy or edit GitOps state. Test and live
verification report actual endpoint state separately from CI success.
