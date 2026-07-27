# Estonian Salmon Price Monitor

Production n8n workflow for deterministic, read-only monitoring of raw,
unseasoned salmon fillet. It runs at `07:00 UTC` daily and exposes the
authenticated `mihkel-salmon` webhook used only by Mihkel's fixed
`n8n salmon` operation.

Production workflow ID: `C1cswl6I7htHr8UQ`.

Enabled sources:

- Selver, Tallinn e-store public Klevu structured search, through
  `http://192.168.21.1:3128`.
- Rimi, Tallinn e-store public search HTML.
- Maxima through Barbora, Tallinn shop `T032`, public embedded product JSON.
- Kaupmees, Tallinn/eKaupmees public `/products/search/` JSON.

Live validation on 2026-07-27 confirms successful schema validation for all
four sources. A structurally valid source with no qualifying raw salmon fillet
is treated as a successful empty result; missing collections and incompatible
responses remain explicit failures.

Coop is intentionally excluded because no suitable official e-channel is
available for the configured area. Prisma is not included.

Public consumer prices from Selver, Rimi, and Barbora are treated as
VAT-inclusive. Kaupmees must expose whether its price is net or gross; explicit
net prices are converted with `gross cents = round(net cents × 1.24)`.
The automatic threshold is strictly below €10.00/kg.

State is held in n8n workflow static data, which persists across restarts.
Scheduled runs re-arm an offer only after a successful source fetch confirms
that it is above threshold, unavailable, expired, or absent. Manual runs never
mutate alert, failure, or incident state. After three consecutive incomplete
runs, one Mildred warning is sent; one recovery message follows the next fully
successful run.

Repair incidents and the `Build Repair Handoff`-equivalent output in the
`Normalize State and Build Repair Handoff` node use schema version 1.
Automatic repair dispatch is disabled. A future dispatcher should read the
stored handoff only; production deployment remains approval-gated.

Validation and export:

```bash
node --test workflows/estonian-salmon-price-monitor/logic.test.js
node workflows/estonian-salmon-price-monitor/generate-workflow.js
python3 skills/n8n/scripts/n8n_api.py salmon
```

The canonical export is `workflow.json`. Regenerate before deployment and
export the deployed definition back here after changes. No retailer login,
basket, reservation, or ordering endpoint is used.
