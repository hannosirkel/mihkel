"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isSalmonFillet, offering, processRun, grossFromNetCents, commandMatches, parseSelver, parseKaupmees } = require("./logic");

test("classification includes raw fillets and excludes near misses", () => {
  for (const name of ["Värske lõhefilee C-trim", "Külmutatud lõhefilee portsjonid", "Salmon fillet skin-on"]) assert.equal(isSalmonFillet({ product_name: name }), true, name);
  for (const name of ["Forellifilee", "Terve lõhe", "Külmsuitsu lõhefilee", "Soolatud lõhefilee", "Marineeritud lõhefilee", "Lõhefilee konserv", "Lõhe tumelihafilee"]) assert.equal(isSalmonFillet({ product_name: name }), false, name);
});
test("money conversion uses integer cents", () => assert.equal(grossFromNetCents(999, .24), 1239));
test("Selver structured search normalizes package and variable-weight prices", () => {
  const parsed = parseSelver({ queryResults: [{ records: [
    { id:"1", sku:"A", name:"Lõhefilee jahutatud C-trim, kg", category:"värske kala", inStock:"yes", salePrice:"9.99", basePrice:"10.99", is_qty_decimal:"1", url:"https://example.test/1" },
    { id:"2", sku:"B", name:"Lõhefilee portsjonid 250 g", category:"külmutatud kala", inStock:"yes", salePrice:"4.00", basePrice:"4.00", is_qty_decimal:"0", url:"https://example.test/2" },
  ] }] });
  assert.equal(parsed.health.status, "success");
  assert.deepEqual(parsed.offerings.map(x => x.gross_price_per_kg_cents), [999, 1600]);
});
test("Kaupmees explicit net price receives 24% VAT once", () => {
  const parsed = parseKaupmees({ foundProducts: { "7": {
    productId:7, code:"X", ean:"1", name:"Atlandi lõhefilee B-trim kg", categoryName:"Toidukaubad", mainGroupName:"Kalatooted", subGroupName:"Jahutatud",
    standardPrice:8, standardPriceMissing:false, countingCode:"kg", countingUnitQuantity:1, taxCodeId:6,
    inCustomerLocationAssortment:true, wholesalePackageQuantity:1, cooledProduct:true,
  } } });
  assert.equal(parsed.health.status, "success");
  assert.equal(parsed.offerings[0].gross_price_per_kg_cents, 992);
  assert.equal(parsed.offerings[0].source_price_includes_vat, false);
});
test("strict command matcher", () => {
  assert.equal(commandMatches(" n8n salmon "), true);
  assert.equal(commandMatches("N8N SALMON"), true);
  assert.equal(commandMatches("show n8n salmon please"), false);
});
function item(id, price, retailer = "rimi") {
  return offering({ retailer, store_or_region: "Tallinn", product_id: id, product_name: "Värske lõhefilee", product_url: "https://example.test", gross_price_per_kg_cents: price, in_stock: true });
}
function source(retailer, offers, status = "success") {
  return { source: { retailer, storeOrRegion: "Tallinn" }, health: { status, failureCategory: status === "success" ? null : "http_500", failureSummary: status === "success" ? null : "HTTP 500", responseStatus: status === "success" ? 200 : 500, responseContentType: "text/html", responseFingerprint: "x", productsReceived: offers.length, productsParsed: offers.length }, offerings: offers };
}
test("scheduled state deduplicates, rearms, and manual run does not mutate", () => {
  const state = {};
  assert.equal(processRun([source("rimi", [item("a", 999)])], { state }).results.length, 1);
  assert.equal(processRun([source("rimi", [item("a", 999)])], { state }).results.length, 0);
  processRun([source("rimi", [item("a", 1000)])], { state });
  assert.equal(processRun([source("rimi", [item("a", 999)])], { state }).results.length, 1);
  const before = JSON.stringify(state);
  const out = processRun([source("rimi", [item("b", 800), item("c", 1100), item("d", 900), item("e", 700)])], { state, mode: "on_demand" });
  assert.deepEqual(out.results.map((x) => x.product_id), ["e", "b", "d"]);
  assert.equal(JSON.stringify(state), before);
});
test("failed source does not rearm and three failures warn once then recover", () => {
  const state = {};
  processRun([source("rimi", [item("a", 999)])], { state });
  for (let i = 0; i < 2; i++) assert.equal(processRun([source("rimi", [], "failed")], { state }).operationalMessage, null);
  assert.match(processRun([source("rimi", [], "failed")], { state }).operationalMessage, /operational warning/);
  assert.equal(processRun([source("rimi", [], "failed")], { state }).operationalMessage, null);
  const recovery = processRun([source("rimi", [item("a", 999)])], { state });
  assert.equal(recovery.results.length, 0);
  assert.match(recovery.operationalMessage, /recovered/);
});
