# Hetzner Auction Monitor

The bot-only n8n instance runs one deterministic workflow named
`Hetzner Auction Monitor`. It polls Hetzner's public Server Auction EUR feed
every five minutes and sends newly eligible listings to Discord through the
managed Mildred credential. It has no server ordering capability.

When Mihkel receives an invoked request for `n8n servers`, Mihkel calls the
reviewed n8n helper's fixed authenticated `/webhook/mihkel-servers` operation
and returns its response in the current conversation. n8n does not poll
Discord, and `n8n servers` is not an OpenClaw wake pattern. The workflow fetches
fresh inventory and returns up to three hardware-matching servers ordered by
monthly cost, including results above the immediate-alert ceiling. The
on-demand path does not alter scheduled-alert state.

Settings live in the workflow's `Central Configuration` node. Hardware requires
at least 64 GB RAM, two physical SSD or NVMe drives of at least 480 GB each, and
a reviewed PassMark Average CPU Mark of at least 8,643, the pinned Intel Core
i7-7700 reference. Unknown CPU models and ambiguous storage fail closed.

Monthly pricing is computed in integer cents:

```text
monthly_net_total = server_monthly_net + separately_priced_primary_ipv4_net
estonia_gross = round(monthly_net_total * 1.24)
```

The rounded gross amount is compared with the inclusive €60.00 alert ceiling.
One-time setup charges are excluded from eligibility and displayed when
non-zero. Scheduled deduplication uses n8n workflow static data keyed by
auction product ID with 30-day pruning.
