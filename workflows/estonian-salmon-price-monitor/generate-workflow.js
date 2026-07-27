"use strict";
const fs = require("node:fs");
const path = require("node:path");
const dir = __dirname;
const logic = fs.readFileSync(path.join(dir, "logic.js"), "utf8")
  .replace(/^"use strict";\s*/, "")
  .replace(/\nmodule\.exports = \{[\s\S]*?\};\s*$/, "");

const config = {
  SCHEDULE_CRON: "0 7 * * *", SCHEDULE_TIMEZONE: "UTC",
  ALERT_BELOW_GROSS_EUR_PER_KG: 10, ESTONIAN_VAT_RATE: 0.24,
  ON_DEMAND_RESULT_LIMIT: 3, STATE_RETENTION_DAYS: 90, SOURCE_MAX_RETRIES: 3,
  SHOPPING_AREA: "Tallinn",
  ENABLED_RETAILERS: ["selver", "rimi", "barbora", "kaupmees"],
  RETAILERS: {
    selver: { url: "https://eucs3v2.ksearchnet.com/cs/v2/search", region: "Tallinn e-store", proxy: "http://192.168.21.1:3128" },
    rimi: { url: "https://www.rimi.ee/epood/ee/otsing?query=l%C3%B5hefilee", region: "Tallinn e-store" },
    barbora: { url: "https://barbora.ee/otsing?q=l%C3%B5hefilee", region: "Tallinn (T032)" },
    kaupmees: { url: "https://www.kaupmees.ee/products/search/?query=l%C3%B5hefilee", region: "Tallinn / eKaupmees" },
  },
  DELIVERY_SERVER: "998481392159686696", DELIVERY_CHANNEL: "1485193388012601416",
  REPAIR_MODE: "manual", AUTOMATIC_REPAIR_DISPATCH_ENABLED: false, REPAIR_PAYLOAD_SCHEMA_VERSION: 1,
};

const adapterCode = (fn) => `${logic}
const raw = $input.first().json;
function longestString(value, seen = new Set()) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  return Object.values(value).map(v => longestString(v, seen)).sort((a,b) => b.length-a.length)[0] || "";
}
const candidate = raw.body ?? raw.data ?? raw;
const body = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
return [{ json: ${fn}(body, $items("Central Configuration")[0].json) }];`;
const aggregateCode = `${logic}
const cfg = $items("Central Configuration")[0].json;
let mode = "scheduled";
try { if ($items("On-demand Context").length) mode = "on_demand"; } catch {}
const state = $getWorkflowStaticData("global");
const outcome = processRun($input.all().map(x => x.json), { config: cfg, mode, state, executionId: $execution.id });
if (mode === "on_demand") return [{ json: { route: "response", ok: outcome.failed.length < cfg.ENABLED_RETAILERS.length, message: formatOnDemand(outcome, cfg), partial: outcome.failed.length > 0, failedRetailers: outcome.failed.map(x => x.source.retailer) } }];
const rows = [];
if (outcome.results.length) rows.push({ json: { route: "discord", content: formatAlert(outcome, cfg), channelId: cfg.DELIVERY_CHANNEL } });
if (outcome.operationalMessage) rows.push({ json: { route: "discord", content: outcome.operationalMessage, channelId: cfg.DELIVERY_CHANNEL } });
return rows;`;

const nodes = [
  { id:"schedule", name:"Daily 07:00 UTC", type:"n8n-nodes-base.scheduleTrigger", typeVersion:1.2, position:[-1000,-200], parameters:{ rule:{ interval:[{ field:"cronExpression", expression:"0 7 * * *" }] } } },
  { id:"scheduled-context", name:"Scheduled Context", type:"n8n-nodes-base.set", typeVersion:3.4, position:[-800,-200], parameters:{ assignments:{ assignments:[{id:"mode",name:"mode",value:"scheduled",type:"string"}] } } },
  { id:"webhook", name:"On-demand Trigger", type:"n8n-nodes-base.webhook", typeVersion:2, position:[-1000,200], webhookId:"mihkel-salmon", credentials:{httpHeaderAuth:{id:"mihkel-webhook-auth",name:"Mihkel Webhook Auth"}}, parameters:{httpMethod:"POST",path:"mihkel-salmon",authentication:"headerAuth",responseMode:"responseNode",options:{}} },
  { id:"ondemand-context", name:"On-demand Context", type:"n8n-nodes-base.set", typeVersion:3.4, position:[-800,200], parameters:{ assignments:{ assignments:[{id:"mode",name:"mode",value:"on_demand",type:"string"}] } } },
  { id:"config", name:"Central Configuration", type:"n8n-nodes-base.set", typeVersion:3.4, position:[-600,0], parameters:{mode:"raw",jsonOutput:JSON.stringify(config),options:{}} },
];
const retailers = [
  ["Selver","selver","parseSelver",-350,-300],
  ["Rimi","rimi","parseRimi",-350,-100],
  ["Barbora","barbora","parseBarbora",-350,100],
  ["Kaupmees","kaupmees","parseKaupmees",-350,300],
];
for (const [label,key,fn,x,y] of retailers) {
  const opts = { allowUnauthorizedCerts:false, response:{response:{fullResponse:true,responseFormat:"text"}}, timeout:25000 };
  if (key === "selver") opts.response.response = { responseFormat:"json" };
  const parameters = {url:`={{ $json.RETAILERS.${key}.url }}`,options:opts};
  if (key === "rimi") {
    parameters.sendHeaders = true;
    parameters.headerParameters = { parameters: [
      { name: "accept", value: "text/html,application/xhtml+xml" },
      { name: "user-agent", value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    ] };
  }
  if (key === "selver") {
    parameters.method = "POST";
    parameters.sendHeaders = true;
    parameters.headerParameters = { parameters: [{ name: "content-type", value: "application/json" }] };
    parameters.sendBody = true;
    parameters.contentType = "json";
    parameters.specifyBody = "json";
    parameters.jsonBody = '={{ { context: { apiKeys: ["klevu-" + "14410928010151845"] }, recordQueries: [{ id: "search", typeOfRequest: "SEARCH", settings: { query: { term: "lõhefilee" }, typeOfRecords: ["KLEVU_PRODUCT"], limit: 24 } }] } }}';
  }
  nodes.push({id:`fetch-${key}`,name:`Fetch ${label}`,type:"n8n-nodes-base.httpRequest",typeVersion:4.2,position:[x,y],retryOnFail:true,maxTries:3,waitBetweenTries:1500,onError:"continueRegularOutput",parameters});
  nodes.push({id:`parse-${key}`,name:`Parse ${label}`,type:"n8n-nodes-base.code",typeVersion:2,position:[x+220,y],parameters:{jsCode:adapterCode(fn)}});
}
nodes.push(
  {id:"merge",name:"Merge Retailer Results",type:"n8n-nodes-base.merge",typeVersion:3.2,position:[150,0],parameters:{mode:"append",numberInputs:4}},
  {id:"aggregate",name:"Normalize State and Build Repair Handoff",type:"n8n-nodes-base.code",typeVersion:2,position:[380,0],parameters:{jsCode:aggregateCode}},
  {id:"route",name:"On-demand Response?",type:"n8n-nodes-base.if",typeVersion:2.2,position:[610,0],parameters:{conditions:{options:{caseSensitive:true,leftValue:"",typeValidation:"strict",version:2},conditions:[{id:"route",leftValue:"={{ $json.route }}",rightValue:"response",operator:{type:"string",operation:"equals"}}],combinator:"and"},options:{}}},
  {id:"respond",name:"Return Salmon Results",type:"n8n-nodes-base.respondToWebhook",typeVersion:1.4,position:[850,-100],parameters:{respondWith:"json",responseBody:"={{ { ok: $json.ok, message: $json.message, partial: $json.partial, failedRetailers: $json.failedRetailers } }}",options:{responseCode:200}}},
  {id:"discord",name:"Send Through Mildred",type:"n8n-nodes-base.discord",typeVersion:2,position:[850,100],credentials:{discordBotApi:{id:"mildred-discord-bot",name:"Mildred Discord"}},parameters:{resource:"message",operation:"send",guildId:{__rl:true,mode:"id",value:config.DELIVERY_SERVER},channelId:{__rl:true,mode:"id",value:"={{ $json.channelId }}"},content:"={{ $json.content }}",options:{}}}
);
const connections = {
  "Daily 07:00 UTC":{main:[[{node:"Scheduled Context",type:"main",index:0}]]},
  "Scheduled Context":{main:[[{node:"Central Configuration",type:"main",index:0}]]},
  "On-demand Trigger":{main:[[{node:"On-demand Context",type:"main",index:0}]]},
  "On-demand Context":{main:[[{node:"Central Configuration",type:"main",index:0}]]},
  "Central Configuration":{main:[retailers.map(([label])=>({node:`Fetch ${label}`,type:"main",index:0}))]},
  "Merge Retailer Results":{main:[[{node:"Normalize State and Build Repair Handoff",type:"main",index:0}]]},
  "Normalize State and Build Repair Handoff":{main:[[{node:"On-demand Response?",type:"main",index:0}]]},
  "On-demand Response?":{main:[[{node:"Return Salmon Results",type:"main",index:0}],[{node:"Send Through Mildred",type:"main",index:0}]]},
};
retailers.forEach(([label,key],i)=>{
  connections[`Fetch ${label}`]={main:[[{node:`Parse ${label}`,type:"main",index:0}]]};
  connections[`Parse ${label}`]={main:[[{node:"Merge Retailer Results",type:"main",index:i}]]};
});
const workflow = {name:"Estonian Salmon Price Monitor",nodes,connections,settings:{executionOrder:"v1",timezone:"UTC",saveManualExecutions:true}};
fs.writeFileSync(path.join(dir,"workflow.json"),`${JSON.stringify(workflow,null,2)}\n`);
