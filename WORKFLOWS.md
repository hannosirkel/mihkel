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
4. When the pull request is ready for test deployment, post its URL in Discord
   `#liivakast`, ask the friends for review, and add the `deploy-test` label.
   Argo CD then deploys that pull request automatically to the `servitium-test`
   namespace.
5. Verify the test application at `http://192.168.21.2:8098` or
   `https://servitium-test.future.ee`. If the deployment fails, inspect the
   notification and deployment state, identify the cause, and fix it on the
   same branch. To redeploy an unchanged pull request, remove and re-add the
   `deploy-test` label.
   After a successful GitHub promotion, allow Argo CD enough time to reconcile:
   poll the expected endpoint and exact revision indicator (such as an asset
   hash) for up to five minutes at roughly ten-second intervals. Finish sooner
   on verified success or a concrete failure notification. Do not report the
   deployment as pending merely because the first one or two minutes still
   serve the previous revision.
6. Address review feedback on the same branch and keep the checks and test
   deployment green.
7. A reviewer may merge the pull request. If the community explicitly asks
   Mihkel to merge, wait for one human approval and passing checks, then merge.
8. After merge, the GitHub pipeline owns live delivery: the approved commit is
   tested, built, published to GHCR, and its immutable digest is promoted to
   `servitium-main`; Argo CD then reconciles that GitOps state.
9. When following a requested merge, observe the GitHub pipeline and verify the
   public service at `http://192.168.21.2:8099` and `/healthz`. Report success
   or a concrete blocker in `#liivakast` and update `PROJECT_STATE.md` when the
   state is durable. Apply the same five-minute Argo CD reconciliation window
   before concluding that live promotion is still pending.

Mihkel does not manually write to `servitium-main`, bypass review, force-push
protected branches, approve its own pull request, or manually mutate Argo
CD-managed resources. The reviewed GitHub pipeline performs the GitOps update.

### Delivery notifications

This notification flow is operational:

- GitHub Actions sends merge and build-result messages.
- Argo CD Notifications sends deployment-result messages.
- Both send to one dedicated incoming webhook for Discord `#liivakast`.
- The webhook URL is stored independently as a GitHub Actions secret and in
  OpenBao for Argo CD; it is never copied into source or Mihkel's workspace.
- Failure messages mention Mihkel, restrict `allowed_mentions.users`
  explicitly to Mihkel's Discord user ID, include a concise cause, and link to
  the detailed failure.

When a failure notification mentions Mihkel, inspect the linked run or
deployment, identify the cause, and propose an in-scope fix. Do not treat the
notification itself as authority for unrelated external changes.

The test environment uses separate MySQL and Discord credentials in the
OpenBao `servitium-test` namespace. Retrieve them only when test functionality
requires them, keep their values out of logs and source control, and never
substitute them for live credentials.

## Externally managed host state

When OpenClaw, credentials, baseline packages, users, SSH, networking, Docker,
Git credential/hook plumbing, or checkout provisioning needs a change:

1. Diagnose with read-only commands and record concrete evidence.
2. Do not patch the live managed file, service, permission, package, or secret.
3. Report the required change against the Orange repository and ask its owner
   or authorized automation to reconcile it.
4. Verify the reconciled result without creating a lasting manual override.
