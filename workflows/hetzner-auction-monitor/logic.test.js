"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_CONFIG,
  grossCents,
  normalizeProduct,
  processInventory,
} = require("./logic");

function product(overrides = {}) {
  return {
    id: 1,
    cpu: "Intel Core i7-7700",
    ram_size: 64,
    price: 46.68,
    setup_price: 0,
    hdd_count: 2,
    hdd_arr: ["480 GB SSD", "480 GB SSD"],
    serverDiskData: { nvme: [], sata: [480, 480], hdd: [], general: [480] },
    datacenter: "FSN1-DC1",
    bandwidth: 1000,
    ip_price: { Monthly: 1.7 },
    ...overrides,
  };
}

test("CPU baseline and stronger CPUs pass while weaker CPUs fail", () => {
  assert.equal(normalizeProduct(product({ cpu: "Intel Core i7-6700" })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ cpu: "Intel Core i7-7700" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "Intel Core i7-8700" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "AMD Ryzen 5 2600" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "AMD Ryzen 5 3600" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "AMD Ryzen 9 5950X" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "Unknown Turbo CPU" })).hardwareMatch, false);
});

test("memory is at least 64 GB", () => {
  assert.equal(normalizeProduct(product({ ram_size: 32 })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ ram_size: 64 })).hardwareMatch, true);
});

test("storage requires two physical solid-state drives of at least 480 GB each", () => {
  assert.equal(normalizeProduct(product()).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [512, 512], sata: [], hdd: [], general: [512] }, hdd_arr: ["512 GB NVMe", "512 GB NVMe"] })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ hdd_count: 1, serverDiskData: { nvme: [], sata: [960], hdd: [], general: [960] }, hdd_arr: ["960 GB SSD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [], sata: [], hdd: [4000, 4000], general: [4000] }, hdd_arr: ["4 TB HDD", "4 TB HDD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [], sata: [960], hdd: [4000], general: [960] }, hdd_arr: ["960 GB SSD", "4 TB HDD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [], sata: [240, 240], hdd: [], general: [240] }, hdd_arr: ["240 GB SSD", "240 GB SSD"] })).hardwareMatch, false);
});

test("money uses integer cents, includes IPv4 and qualifies exactly at 60", () => {
  assert.equal(grossCents(4839, 0.24), 6000);
  const below = normalizeProduct(product({ price: 46.67 }));
  const equal = normalizeProduct(product({ price: 46.69, ip_price: { Monthly: 1.7 } }));
  const above = normalizeProduct(product({ price: 46.7, ip_price: { Monthly: 1.7 } }));
  assert.equal(below.monthlyGrossCents < 6000, true);
  assert.equal(equal.monthlyGrossCents, 6000);
  assert.equal(above.monthlyGrossCents > 6000, true);
  assert.equal(grossCents(Math.round((59.5 / 1.19) * 100), 0.24), 6200);
});

test("scheduled state alerts once and alerts after an above-to-below transition", () => {
  const state = {};
  const above = product({ id: 42, price: 50 });
  const below = product({ id: 42, price: 46.69 });
  assert.equal(processInventory([above], { state }).results.length, 0);
  assert.equal(processInventory([below], { state }).results.length, 1);
  assert.equal(processInventory([below], { state }).results.length, 0);
});

test("on-demand sorts, limits, includes above-threshold results, and does not mutate alert state", () => {
  const state = { alerted: { existing: 123 } };
  const inventory = [
    product({ id: 4, price: 70 }),
    product({ id: 2, price: 50 }),
    product({ id: 1, price: 48 }),
    product({ id: 3, price: 60 }),
  ];
  const before = JSON.stringify(state);
  const outcome = processInventory(inventory, { mode: "on_demand", state });
  assert.deepEqual(outcome.results.map((item) => item.id), ["1", "2", "3"]);
  assert.equal(outcome.results.some((item) => item.monthlyGrossCents > 6000), true);
  assert.equal(JSON.stringify(state), before);
  assert.equal(processInventory(inventory.slice(0, 2), { mode: "on_demand" }).results.length, 2);
  assert.equal(processInventory([], { mode: "on_demand" }).results.length, 0);
});

test("malformed API data is not interpreted as an empty valid inventory", () => {
  assert.throws(() => processInventory({ server: [] }), /schema is incompatible/);
  assert.equal(processInventory([null, product()], { mode: "on_demand" }).diagnostics.malformed, 1);
});

test("command matcher accepts only the standalone command", () => {
  const matches = (text) => /^\s*n8n servers\s*$/i.test(text);
  assert.equal(matches("n8n servers"), true);
  assert.equal(matches(" N8N SERVERS "), true);
  assert.equal(matches("show n8n servers please"), false);
  assert.equal(matches("n8n servers now"), false);
});
