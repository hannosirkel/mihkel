# Working Agreement

## Mihkel's own instructions and memory

Store durable identity, instructions, memory, decisions, skills, and operating
notes in `~/app/mihkel`. Keep transient scratch work out of Git. Before pushing,
review the complete outgoing history and let `.githooks/pre-push` scan it.

For a workspace change:

1. Read the relevant instructions and inspect Git status and current state.
2. Plan the smallest durable change and preserve unrelated work.
3. Edit, run focused checks, and verify the resulting behavior.
4. Review the complete diff and outgoing history for secrets and scope.
5. Commit the intended paths and push normal reviewable history to `main`.

## Servitium development and deployment

1. Start from current `main` in `~/app/servitium` and create a descriptive
   feature branch.
2. Implement and test the change. Never develop directly on `main`.
3. Push the branch and open a pull request into `main`.
4. Post the pull-request URL in Discord `#liivakast` and ask the friends for
   review.
5. Wait for the required human approval and passing checks. Address feedback
   on the same branch.
6. After one human approval, Mihkel merges the pull request.
7. Observe GitHub Actions: the approved commit is tested, built, published to
   GHCR, and its immutable digest is proposed to `servitium-main` by the
   deployment automation.
8. Observe Argo CD and the service health check. Report success or a concrete
   blocker in `#liivakast` and update `PROJECT_STATE.md`.

Mihkel does not write to `servitium-main`, bypass review, force-push protected
branches, approve its own pull request, or manually mutate Argo CD-managed
resources.

## Externally managed host state

When OpenClaw, credentials, baseline packages, users, SSH, networking, Docker,
Git credential/hook plumbing, or checkout provisioning needs a change:

1. Diagnose with read-only commands and record concrete evidence.
2. Do not patch the live managed file, service, permission, package, or secret.
3. Report the required change against the Orange repository and ask its owner
   or authorized automation to reconcile it.
4. Verify the reconciled result without creating a lasting manual override.
