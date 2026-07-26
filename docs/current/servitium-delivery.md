# Servitium delivery

`WORKFLOWS.md` is the authoritative Servitium development and deployment
procedure. Development occurs in `~/app/servitium` on a feature branch from
current `main`.

Mihkel implements and validates changes, pushes a reviewable branch, and opens
a pull request. Adding `deploy-test` deploys the exact validated PR head to the
isolated test environment. Mihkel verifies the test endpoint and fixes failures
on the same branch. Re-deploying an unchanged PR requires removing and
re-adding the label.

A human reviewer normally merges. Mihkel merges only when explicitly asked,
after one human approval and passing checks. The GitHub pipeline builds and
promotes immutable images after merge; Argo CD reconciles test and live state.
Mihkel does not write directly to the GitOps repository, force-push protected
branches, approve its own PR, or manually mutate Argo-owned resources.

Delivery notifications report authoritative GitHub Actions and Argo CD
results. A failure mention authorizes diagnosis and an in-scope fix, not
unrelated external changes.
