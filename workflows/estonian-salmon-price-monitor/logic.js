"use strict";

const DEFAULT_CONFIG = Object.freeze({
  SCHEDULE_CRON: "0 7 * * *",
  SCHEDULE_TIMEZONE: "UTC",
  ALERT_BELOW_GROSS_EUR_PER_KG: 10,
  ESTONIAN_VAT_RATE: 0.24,
  ON_DEMAND_RESULT_LIMIT: 3,
  STATE_RETENTION_DAYS: 90,
  SOURCE_MAX_RETRIES: 3,
  SHOPPING_AREA: "Tallinn",
  ENABLED_RETAILERS: ["selver", "rimi", "barbora", "kaupmees"],
  SELVER_PROXY_URL: "http://192.168.21.1:3128",
  REPAIR_MODE: "manual",
  AUTOMATIC_REPAIR_DISPATCH_ENABLED: false,
  REPAIR_PAYLOAD_SCHEMA_VERSION: 1,
});

function text(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cents(value) {
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) throw new Error(`Invalid price: ${value}`);
  return Math.round(Number(normalized) * 100);
}

function pricePerKgCents(value) {
  return cents(value);
}

function grossFromNetCents(net, vat = 0.24) {
  return Math.round(net * (1 + vat));
}

function fingerprint(input) {
  let hash = 2166136261;
  for (const c of String(input)) {
    hash ^= c.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isSalmonFillet(record) {
  const value = `${record.product_name || ""} ${record.category || ""} ${record.description || ""} ${record.ingredients || ""}`.toLocaleLowerCase("et");
  if (!/(lõhe\s*filee|lohe\s*filee|salmon\s+fillet)/i.test(value)) return false;
  if (/(forell|trout|terve\s+lõhe|whole\s+salmon|rookimata|gutted|steak|suits|smok|soola|salted|cured|gravlax|marin|maitsest|season|troopiline|teriyaki|barbecue|bbq|grill|šaš|shash|küpset|cooked|konserv|canned|patee|mousse|suflee|spread|hakk|mince|burger|supp|soup|pea|head|luu|bone|kõhu|belly|scrap|trimmi|tumelihafilee|kastmes|sauce)/i.test(value)) return false;
  if (record.category && /(lemmikloom|kass|koer|konserv|valmistoit)/i.test(record.category)) return false;
  return true;
}

function conditionFor(value) {
  const s = String(value).toLocaleLowerCase("et");
  if (/külmut|frozen/.test(s)) return "frozen";
  if (/jahut|chilled/.test(s)) return "chilled";
  return "fresh";
}

function offering(fields) {
  const gross = Number(fields.gross_price_per_kg_cents);
  if (!fields.product_id || !fields.product_name || !Number.isInteger(gross) || gross <= 0) {
    throw new Error("Missing normalized offering fields");
  }
  const priceType = fields.price_type || "regular";
  return {
    retailer: fields.retailer,
    store_or_region: fields.store_or_region,
    product_id: String(fields.product_id),
    ean: fields.ean || null,
    product_name: text(fields.product_name),
    product_url: fields.product_url,
    condition: fields.condition || conditionFor(`${fields.product_name} ${fields.category || ""}`),
    trim_or_cut: fields.trim_or_cut || null,
    package_weight_kg: fields.package_weight_kg ?? null,
    package_gross_price_cents: fields.package_gross_price_cents ?? null,
    gross_price_per_kg_cents: gross,
    source_price_per_kg_cents: fields.source_price_per_kg_cents ?? gross,
    source_price_includes_vat: fields.source_price_includes_vat !== false,
    price_type: priceType,
    loyalty_card_required: Boolean(fields.loyalty_card_required),
    minimum_quantity: fields.minimum_quantity ?? 1,
    minimum_purchase_total_cents: fields.minimum_purchase_total_cents ?? null,
    in_stock: fields.in_stock !== false,
    promotion_valid_from: fields.promotion_valid_from || null,
    promotion_valid_until: fields.promotion_valid_until || null,
    fetched_at: fields.fetched_at || new Date().toISOString(),
    source_offer_identity: `${fields.retailer}|${fields.store_or_region}|${fields.product_id}|${priceType}`,
  };
}

function health(retailer, html, offerings, errors, extra = {}) {
  return {
    status: errors.length ? (offerings.length ? "partial" : "failed") : "success",
    responseStatus: extra.status ?? 200,
    responseContentType: extra.contentType || "text/html",
    responseFingerprint: fingerprint(html),
    productsReceived: extra.productsReceived ?? offerings.length,
    productsParsed: offerings.length,
    parseErrors: errors.length,
    failureCategory: errors.length ? (extra.failureCategory || "probable_schema_change") : null,
    failureSummary: errors.length ? errors[0] : null,
  };
}

function envelope(retailer, region, html, offerings, errors, extra = {}) {
  return {
    source: { retailer, storeOrRegion: region, fetchedAt: new Date().toISOString() },
    health: health(retailer, html, offerings, errors, extra),
    offerings,
  };
}

function parseBarbora(html, config = DEFAULT_CONFIG) {
  const match = String(html).match(/window\.b_productList\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return envelope("barbora", "Tallinn (T032)", html, [], ["Expected window.b_productList was not found"]);
  let products;
  try { products = JSON.parse(match[1]); } catch { return envelope("barbora", "Tallinn (T032)", html, [], ["Product JSON is invalid"]); }
  const results = [], errors = [];
  for (const p of products) {
    try {
      if (!isSalmonFillet({ product_name: p.title, category: p.category_name_full_path })) continue;
      if (p.status !== "active") continue;
      const unit = p.units?.[0] || {};
      const perKg = p.comparative_unit === "kg" ? p.comparative_unit_price : null;
      if (!perKg) throw new Error(`Missing unit price for ${p.id}`);
      results.push(offering({
        retailer: "barbora", store_or_region: `Tallinn (${p.shopcode || "T032"})`,
        product_id: p.id, product_name: p.title, category: p.category_name_full_path,
        product_url: `https://barbora.ee/toode/${p.Url}`, gross_price_per_kg_cents: cents(perKg),
        package_gross_price_cents: unit.unit === "tk" ? cents(unit.price) : null,
        package_weight_kg: unit.unit === "kg" ? Number(unit.defaultValue || unit.min) : null,
        price_type: p.promotion?.type === "LOYALTY_PRICE" ? "loyalty" : p.promotion ? "promotional" : "regular",
        loyalty_card_required: p.promotion?.loyaltyCardRequired, minimum_quantity: p.promotion?.minQuantity || 1,
        promotion_valid_until: p.ShowInOffersTo, in_stock: true,
      }));
    } catch (error) { errors.push(error.message); }
  }
  return envelope("barbora", "Tallinn (T032)", html, results, errors, { productsReceived: products.length });
}

function parseRimi(html) {
  const cards = String(html).match(/<li class="product-grid__item">[\s\S]*?<\/li>/g);
  if (!cards) {
    const title = text(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || "no HTML title";
    return envelope("rimi", "Tallinn e-store", html, [], [`Expected product grid was not found (${title})`]);
  }
  const results = [], errors = [];
  for (const card of cards) {
    try {
      const id = card.match(/data-product-code="([^"]+)"/)?.[1];
      const name = text(card.match(/class="card__name">([\s\S]*?)<\/p>/)?.[1]);
      if (!isSalmonFillet({ product_name: name, category: card })) continue;
      if (!/js-add-to-cart/.test(card)) continue;
      const unit = card.match(/Hind ühiku kohta:\s*([\d,.]+)\s*€\/kg/i)?.[1];
      if (!unit) throw new Error(`Missing €/kg for ${id}`);
      const href = card.match(/class="card__url[^"]*" href="([^"]+)"/)?.[1];
      const packagePrice = card.match(/data-gtm-eec-product='[^']*"price":([\d.]+)/)?.[1];
      results.push(offering({
        retailer: "rimi", store_or_region: "Tallinn e-store", product_id: id, product_name: name,
        product_url: `https://www.rimi.ee${href}`, gross_price_per_kg_cents: cents(unit),
        package_gross_price_cents: packagePrice ? cents(packagePrice) : null,
        package_weight_kg: Number(name.match(/(\d+(?:[,.]\d+)?)\s*kg\b/i)?.[1]?.replace(",", ".")) || null,
        price_type: /old-price-tag/.test(card) ? "promotional" : "regular", in_stock: true,
      }));
    } catch (error) { errors.push(error.message); }
  }
  return envelope("rimi", "Tallinn e-store", html, results, errors, { productsReceived: cards.length });
}

function parseKaupmees(html, config = DEFAULT_CONFIG) {
  let payload;
  try { payload = typeof html === "string" ? JSON.parse(html) : html; } catch { return envelope("kaupmees", "Tallinn / eKaupmees", String(html), [], ["Search response JSON is invalid"]); }
  if (!payload?.foundProducts || typeof payload.foundProducts !== "object") {
    return envelope("kaupmees", "Tallinn / eKaupmees", JSON.stringify(payload), [], ["Expected foundProducts object was not found"]);
  }
  const products = Object.values(payload.foundProducts);
  const results = [], errors = [];
  for (const p of products) {
    try {
      if (!isSalmonFillet({ product_name: p.name, category: `${p.categoryName || ""} ${p.mainGroupName || ""} ${p.subGroupName || ""}`, description: p.description })) continue;
      if (!p.inCustomerLocationAssortment || p.standardPriceMissing) continue;
      if (p.taxCodeId !== 6) throw new Error(`Unexpected VAT code for ${p.productId}`);
      const packageNetCents = cents(p.standardPrice);
      const weightKg = p.countingCode === "kg" ? Number(p.countingUnitQuantity) : null;
      if (!weightKg || weightKg <= 0) throw new Error(`Missing net weight for ${p.productId}`);
      const sourceNetPerKgCents = Math.round(packageNetCents / weightKg);
      results.push(offering({
        retailer: "kaupmees", store_or_region: "Tallinn / eKaupmees", product_id: p.productId,
        ean: p.ean, product_name: p.name, category: `${p.categoryName || ""} ${p.mainGroupName || ""} ${p.subGroupName || ""}`,
        description: p.description, product_url: `https://www.kaupmees.ee/products/${p.productId}`,
        gross_price_per_kg_cents: grossFromNetCents(sourceNetPerKgCents, config.ESTONIAN_VAT_RATE),
        source_price_per_kg_cents: sourceNetPerKgCents, source_price_includes_vat: false,
        package_weight_kg: weightKg, package_gross_price_cents: grossFromNetCents(packageNetCents, config.ESTONIAN_VAT_RATE),
        minimum_quantity: p.wholesalePackageQuantity > 1 ? p.wholesalePackageQuantity : 1,
        price_type: p.isDiscounted ? "promotional" : "regular", in_stock: true,
        condition: p.frozenProduct ? "frozen" : p.cooledProduct ? "chilled" : "fresh",
      }));
    } catch (error) { errors.push(error.message); }
  }
  return envelope("kaupmees", "Tallinn / eKaupmees", JSON.stringify(payload), results, errors, { productsReceived: products.length, contentType: "application/json" });
}

function parseSelver(html) {
  let payload;
  try { payload = typeof html === "string" ? JSON.parse(html) : html; } catch { return envelope("selver", "Tallinn e-store", String(html), [], ["Klevu response JSON is invalid"]); }
  const products = payload?.queryResults?.[0]?.records;
  if (!Array.isArray(products)) {
    const shape = Object.keys(payload || {}).slice(0, 5).join(",") || "empty object";
    return envelope("selver", "Tallinn e-store", JSON.stringify(payload), [], [`Expected queryResults[0].records was not found (keys: ${shape})`]);
  }
  const results = [], errors = [];
  for (const p of products) {
    try {
      if (!isSalmonFillet({ product_name: p.name, category: p.category })) continue;
      if (String(p.inStock) !== "yes") continue;
      const packageCents = cents(p.salePrice || p.price);
      const grams = p.name.match(/(\d+(?:[,.]\d+)?)\s*g\b/i)?.[1];
      const weightKg = grams ? Number(grams.replace(",", ".")) / 1000 : (/kg\b/i.test(p.name) && p.is_qty_decimal === "1" ? 1 : null);
      if (!weightKg) throw new Error(`Missing reliable weight for ${p.id}`);
      results.push(offering({
        retailer: "selver", store_or_region: "Tallinn e-store", product_id: p.id || p.sku,
        product_name: p.name, product_url: p.url?.startsWith("http") ? p.url : `https://www.selver.ee/${p.url}`,
        category: p.category, gross_price_per_kg_cents: Math.round(packageCents / weightKg),
        package_gross_price_cents: weightKg === 1 && p.is_qty_decimal === "1" ? null : packageCents,
        package_weight_kg: weightKg, price_type: Number(p.salePrice) < Number(p.basePrice) ? "promotional" : "regular", in_stock: true,
      }));
    } catch (error) { errors.push(error.message); }
  }
  return envelope("selver", "Tallinn e-store", JSON.stringify(payload), results, errors, { productsReceived: products.length, contentType: "application/json" });
}

function incidentFor(failed, state, config, executionId = null, now = new Date().toISOString()) {
  const names = failed.map((s) => s.source.retailer).sort();
  const signature = fingerprint(failed.map((s) => `${s.source.retailer}:${s.health.failureCategory}:${s.health.failureSummary}`).sort().join("|"));
  const existing = state.incident?.fingerprint === signature ? state.incident : null;
  const incidentId = existing?.incidentId || `SALMON-${names.join("-").toUpperCase()}-${now.slice(0, 10).replaceAll("-", "")}-${signature.slice(-4).toUpperCase()}`;
  const executionIds = [...(existing?.executionIds || []), ...(executionId ? [String(executionId)] : [])].slice(-20);
  const incident = {
    schemaVersion: config.REPAIR_PAYLOAD_SCHEMA_VERSION, incidentId, fingerprint: signature,
    workflow: { name: "Estonian Salmon Price Monitor", id: state.workflowId || "pending", sourceRevision: state.sourceRevision || "repository-export", repositoryPath: "workflows/estonian-salmon-price-monitor" },
    repairMode: "manual", dispatchStatus: "not_dispatched", dispatchAttemptCount: 0, status: "open",
    affectedSources: names, failureCategory: failed[0].health.failureCategory,
    summary: failed.map((s) => `${s.source.retailer}: ${s.health.failureSummary}`).join("; "),
    failedNode: "Retailer adapter", executionIds, firstFailureAt: existing?.firstFailureAt || now,
    latestFailureAt: now, lastFullySuccessfulAt: state.lastFullySuccessfulAt || null,
    consecutiveFailedRuns: state.consecutiveFailedRuns, responseMetadata: failed.map((s) => ({
      retailer: s.source.retailer, status: s.health.responseStatus, contentType: s.health.responseContentType,
      fingerprint: s.health.responseFingerprint, productsReceived: s.health.productsReceived, productsParsed: s.health.productsParsed,
    })),
    repairResult: null, repairBranch: null, repairCommit: null, repairValidation: null, deploymentApproval: null,
  };
  incident.repairHandoff = {
    schemaVersion: 1, incidentId, workflowId: incident.workflow.id, workflowName: incident.workflow.name,
    sourceRevision: incident.workflow.sourceRevision, repositoryPath: incident.workflow.repositoryPath,
    affectedRetailer: names, failureCategory: incident.failureCategory, summary: incident.summary,
    executionIds, responseFingerprint: signature,
    allowedRepositoryScope: ["workflows/estonian-salmon-price-monitor/workflow.json", "workflows/estonian-salmon-price-monitor/fixtures/**", "workflows/estonian-salmon-price-monitor/*.test.js"],
    requestedAction: "investigate_prepare_and_test_repair", productionDeploymentAllowed: false,
  };
  return incident;
}

function processRun(sources, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const mode = options.mode === "on_demand" ? "on_demand" : "scheduled";
  const state = options.state || {};
  const valid = sources.filter((s) => s.health.status !== "failed");
  const failed = sources.filter((s) => s.health.status !== "success");
  const matches = valid.flatMap((s) => s.offerings).filter((o) => o.in_stock && isSalmonFillet({ product_name: o.product_name })).sort((a, b) => a.gross_price_per_kg_cents - b.gross_price_per_kg_cents);
  if (mode === "on_demand") return { mode, results: matches.slice(0, config.ON_DEMAND_RESULT_LIMIT), failed, fullySuccessful: failed.length === 0, state };

  state.offers ||= {};
  state.consecutiveFailedRuns ||= 0;
  const successfulRetailers = new Set(sources.filter((s) => s.health.status === "success").map((s) => s.source.retailer));
  const current = new Map(matches.map((o) => [o.source_offer_identity, o]));
  const alerts = [];
  for (const item of matches) {
    const qualifying = item.gross_price_per_kg_cents < config.ALERT_BELOW_GROSS_EUR_PER_KG * 100;
    const prior = state.offers[item.source_offer_identity];
    if (qualifying && !prior?.qualifying) alerts.push(item);
    state.offers[item.source_offer_identity] = { qualifying, lastSeenAt: Date.now(), retailer: item.retailer };
  }
  for (const [identity, prior] of Object.entries(state.offers)) {
    if (!current.has(identity) && successfulRetailers.has(prior.retailer)) prior.qualifying = false;
    if (Date.now() - Number(prior.lastSeenAt || 0) > config.STATE_RETENTION_DAYS * 86400000) delete state.offers[identity];
  }
  let operationalMessage = null;
  if (failed.length) {
    state.consecutiveFailedRuns += 1;
    state.incident = incidentFor(failed, state, config, options.executionId);
    if (state.consecutiveFailedRuns >= 3 && !state.warningSent) {
      state.warningSent = true;
      operationalMessage = formatWarning(state.incident);
    }
  } else {
    if (state.warningSent) operationalMessage = `**Salmon monitor recovered**\nAll configured retailer sources completed successfully. Incident ${state.incident?.incidentId || ""} is closed.`;
    if (state.incident) state.incident.status = "closed";
    state.consecutiveFailedRuns = 0;
    state.warningSent = false;
    state.lastFullySuccessfulAt = new Date().toISOString();
  }
  return { mode, results: alerts, failed, fullySuccessful: failed.length === 0, operationalMessage, state };
}

function euro(c) { return `€${(c / 100).toFixed(2)}`; }
function formatOffering(o, rank, config = DEFAULT_CONFIG) {
  const lines = [
    `${rank}. **${o.retailer}** — ${o.product_name}`,
    `${euro(o.gross_price_per_kg_cents)}/kg incl. VAT · ${o.gross_price_per_kg_cents < config.ALERT_BELOW_GROSS_EUR_PER_KG * 100 ? "below €10 alert threshold" : "at/above €10 threshold"}`,
    `${o.store_or_region} · ${o.condition} · ${o.price_type}${o.loyalty_card_required ? " (loyalty card required)" : ""}`,
  ];
  if (o.package_gross_price_cents) lines.push(`Package: ${euro(o.package_gross_price_cents)}${o.package_weight_kg ? ` / ${o.package_weight_kg} kg` : ""}`);
  if (o.minimum_quantity > 1) lines.push(`Minimum quantity: ${o.minimum_quantity}`);
  if (o.promotion_valid_until) lines.push(`Promotion ends: ${o.promotion_valid_until}`);
  lines.push(o.product_url);
  return lines.join("\n");
}
function formatOnDemand(outcome, config = DEFAULT_CONFIG) {
  if (!outcome.results.length && !outcome.failed.length) return "No matching salmon-fillet offerings are currently available.";
  if (!outcome.results.length) return `Salmon price check failed: ${outcome.failed.map((s) => `${s.source.retailer}: ${s.health.failureSummary}`).join("; ")}`;
  const header = outcome.failed.length
    ? `Cheapest available matches from successful sources (partial; ${outcome.failed.map((s) => `${s.source.retailer}: ${s.health.failureSummary}`).join("; ")}):`
    : "Three cheapest current salmon-fillet offerings:";
  return [header, ...outcome.results.map((o, i) => formatOffering(o, i + 1, config))].join("\n\n");
}
function formatAlert(outcome, config = DEFAULT_CONFIG) {
  return ["**Salmon fillet below €10/kg**", ...outcome.results.map((o, i) => formatOffering(o, i + 1, config))].join("\n\n");
}
function formatWarning(incident) {
  return `**Salmon monitor operational warning**\nIncident: ${incident.incidentId}\nWorkflow: ${incident.workflow.name} (${incident.workflow.id})\nAffected: ${incident.affectedSources.join(", ")}\nCategory: ${incident.failureCategory}\n${incident.summary}\nFailures: ${incident.consecutiveFailedRuns}; executions: ${incident.executionIds.join(", ") || "unavailable"}\nFirst: ${incident.firstFailureAt}; latest: ${incident.latestFailureAt}; last successful: ${incident.lastFullySuccessfulAt || "unknown"}\nRepository: ${incident.workflow.repositoryPath}\n\n@Mihkel investigate and fix n8n salmon incident ${incident.incidentId}. Prepare and test the repair, commit it to the existing repository, but do not deploy it without my approval.`;
}
function commandMatches(value) { return /^\s*n8n\s+salmon\s*$/i.test(String(value)); }

module.exports = {
  DEFAULT_CONFIG, cents, grossFromNetCents, fingerprint, isSalmonFillet, offering,
  parseBarbora, parseRimi, parseKaupmees, parseSelver, processRun,
  formatOnDemand, formatAlert, formatWarning, commandMatches,
};
