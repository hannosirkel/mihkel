# Hetzner Auction Monitor

`workflow.json` is the importable source for the active n8n workflow named
`Hetzner Auction Monitor`. Regenerate it after logic changes:

```bash
node workflows/hetzner-auction-monitor/generate-workflow.js
node --test workflows/hetzner-auction-monitor/logic.test.js
```

The workflow fetches Hetzner's public EUR Server Auction JSON feed every five
minutes and through the authenticated `mihkel-servers` webhook. It never calls
a Robot transaction, reservation, or ordering endpoint.

CPU capability uses PassMark's multithread Average CPU Mark. The pinned
i7-7700 baseline is 8,643. `CPU_MARKS` records reviewed PassMark snapshots for
CPU models seen in the Hetzner feed. A newly encountered model must be looked
up on `cpubenchmark.net`, reviewed for an unambiguous exact model match, and
added to the mapping; unknown models fail closed and are counted.

Scheduled alert identities and timestamps use n8n workflow static data and are
retained for 30 days. On-demand runs only read this state. The workflow uses
the managed `Mildred Discord` and `Mihkel Webhook Auth` credentials; no secret
is stored in source.
