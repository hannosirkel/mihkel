"use strict";

const fs = require("node:fs");
const path = require("node:path");

const directory = __dirname;
const logic = fs
  .readFileSync(path.join(directory, "logic.js"), "utf8")
  .replace(/^"use strict";\s*/, "")
  .replace(/\nmodule\.exports = \{[\s\S]*?\};\s*$/, "");

const config = {
  POLL_INTERVAL_MINUTES: 5,
  MAX_MONTHLY_GROSS_EUR: 60,
  ESTONIAN_VAT_RATE: 0.24,
  INCLUDE_PRIMARY_IPV4: true,
  MIN_MEMORY_GB: 64,
  MIN_SSD_COUNT: 2,
  MIN_SSD_SIZE_GB: 480,
  ON_DEMAND_RESULT_LIMIT: 3,
  CPU_BASELINE_MODEL: "Intel Core i7-7700",
  CPU_BASELINE_MARK: 8643,
  DEDUP_RETENTION_DAYS: 30,
  HETZNER_FEED_URL: "https://www.hetzner.com/_resources/app/data/app/live_data_sb_EUR.json",
  DISCORD_CHANNEL_ID: "1485193388012601416",
};

const code = `${logic}

const cfg = $items("Central Configuration")[0].json;
let mode = "scheduled";
try {
  if ($items("On-demand Context").length) mode = "on_demand";
} catch {}
const response = $input.first().json;
if (!response || !Array.isArray(response.server)) {
  throw new Error("Hetzner response schema is incompatible");
}
const state = $getWorkflowStaticData("global");
const outcome = processInventory(response.server, { config: cfg, mode, state });
if (mode === "on_demand") {
  return [{ json: { mode, response: formatOnDemand(outcome, cfg), diagnostics: outcome.diagnostics } }];
}
return outcome.results.map((item) => ({
  json: { mode, content: formatAlert(item, cfg), channelId: cfg.DISCORD_CHANNEL_ID, diagnostics: outcome.diagnostics },
}));`;

const workflow = {
  name: "Hetzner Auction Monitor",
  nodes: [
    {
      id: "schedule-trigger",
      name: "Every Five Minutes",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [-900, -180],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } },
    },
    {
      id: "schedule-context",
      name: "Scheduled Context",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [-680, -180],
      parameters: { assignments: { assignments: [{ id: "mode", name: "mode", value: "scheduled", type: "string" }] } },
    },
    {
      id: "webhook-trigger",
      name: "On-demand Trigger",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-900, 180],
      webhookId: "mihkel-servers",
      credentials: { httpHeaderAuth: { id: "mihkel-webhook-auth", name: "Mihkel Webhook Auth" } },
      parameters: {
        httpMethod: "POST",
        path: "mihkel-servers",
        authentication: "headerAuth",
        responseMode: "responseNode",
        options: {},
      },
    },
    {
      id: "ondemand-context",
      name: "On-demand Context",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [-680, 180],
      parameters: { assignments: { assignments: [{ id: "mode", name: "mode", value: "on_demand", type: "string" }] } },
    },
    {
      id: "central-configuration",
      name: "Central Configuration",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [-440, 0],
      parameters: {
        mode: "raw",
        jsonOutput: JSON.stringify(config),
        options: {},
      },
    },
    {
      id: "fetch-auction",
      name: "Fetch Hetzner Auction",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [-180, 0],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1500,
      parameters: {
        url: "={{ $json.HETZNER_FEED_URL }}",
        options: {
          allowUnauthorizedCerts: false,
          redirect: { redirect: { followRedirects: false } },
          response: { response: { responseFormat: "json" } },
          timeout: 20000,
        },
      },
    },
    {
      id: "normalize-filter",
      name: "Normalize Filter and Deduplicate",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [80, 0],
      parameters: { jsCode: code },
    },
    {
      id: "route-mode",
      name: "On-demand Result?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [340, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [{ id: "mode", leftValue: "={{ $json.mode }}", rightValue: "on_demand", operator: { type: "string", operation: "equals" } }],
          combinator: "and",
        },
        options: {},
      },
    },
    {
      id: "respond-webhook",
      name: "Return Servers",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [600, -100],
      parameters: {
        respondWith: "json",
        responseBody: "={{ { ok: true, message: $json.response, diagnostics: $json.diagnostics } }}",
        options: { responseCode: 200 },
      },
    },
    {
      id: "discord-send",
      name: "Send Through Mildred",
      type: "n8n-nodes-base.discord",
      typeVersion: 2,
      position: [600, 100],
      credentials: { discordBotApi: { id: "mildred-discord-bot", name: "Mildred Discord" } },
      parameters: {
        resource: "message",
        operation: "send",
        guildId: { __rl: true, mode: "id", value: "998481392159686696" },
        channelId: { __rl: true, mode: "id", value: "={{ $json.channelId }}" },
        content: "={{ $json.content }}",
        options: {},
      },
    },
  ],
  connections: {
    "Every Five Minutes": { main: [[{ node: "Scheduled Context", type: "main", index: 0 }]] },
    "Scheduled Context": { main: [[{ node: "Central Configuration", type: "main", index: 0 }]] },
    "On-demand Trigger": { main: [[{ node: "On-demand Context", type: "main", index: 0 }]] },
    "On-demand Context": { main: [[{ node: "Central Configuration", type: "main", index: 0 }]] },
    "Central Configuration": { main: [[{ node: "Fetch Hetzner Auction", type: "main", index: 0 }]] },
    "Fetch Hetzner Auction": { main: [[{ node: "Normalize Filter and Deduplicate", type: "main", index: 0 }]] },
    "Normalize Filter and Deduplicate": { main: [[{ node: "On-demand Result?", type: "main", index: 0 }]] },
    "On-demand Result?": {
      main: [
        [{ node: "Return Servers", type: "main", index: 0 }],
        [{ node: "Send Through Mildred", type: "main", index: 0 }],
      ],
    },
  },
  settings: { executionOrder: "v1", timezone: "Europe/Tallinn", saveManualExecutions: true },
};

fs.writeFileSync(path.join(directory, "workflow.json"), `${JSON.stringify(workflow, null, 2)}\n`);
