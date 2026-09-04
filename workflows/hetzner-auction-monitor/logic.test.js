"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_CONFIG,
  grossCents,
  normalizeProduct,
  processInventory,
} = require("./logic");

function product(overrides = {}) {
  return {
    id: 1,
    cpu: "Intel Core i7-8700",
    ram_size: 128,
    price: 46.68,
    setup_price: 0,
    hdd_count: 2,
    hdd_arr: ["400 GB SSD", "400 GB SSD"],
    serverDiskData: { nvme: [], sata: [400, 400], hdd: [], general: [400] },
    datacenter: "FSN1-DC1",
    bandwidth: 1000,
    ip_price: { Monthly: 1.7 },
    ...overrides,
  };
}

function nestedProduct(overrides = {}) {
  return {
    Id: 99,
    Hardware: {
      CPU: { Name: "Intel Core i7-8700", CoreCount: 1 },
      RAM: { RealSize: 32768, Size: 128, SizeUnit: "GB", Amount: 4, ecc: false },
      Storage: {
        RealSize: 960,
        Size: 480,
        SizeUnit: "GB",
        Amount: 2,
        Disks: ["480 GB SSD", "480 GB SSD"],
        Details: { nvme: [], sata: [480, 480], hdd: [], general: [480] },
      },
    },
    Prices: {
      monthly: { EUR: 60, USD: 67 },
      hourly: { EUR: 0.0748, USD: 0.0833 },
      setup: { EUR: 0, USD: 0 },
      fixed: false,
    },
    IPPrices: {
      monthly: { EUR: 1.7, USD: 1.9 },
      hourly: { EUR: 0.0027, USD: 0.003 },
      Amount: 1,
    },
    Details: {
      Description: [],
      Information: [],
      Specials: ["IPv4", "iNIC"],
      Traffic: "unlimited",
      Bandwidth: 1000,
      OS: ["Rescue system"],
      Datacenter: { Name: "FSN1-DC1", Datacenter: "#FSN1-DC1" },
    },
    Timer: {
      ReduceNext: 120,
      ReduceNextHr: true,
      ReduceNextTimestamp: 1788473596,
    },
    ...overrides,
  };
}

test("CPU baseline and stronger CPUs pass while weaker CPUs fail", () => {
  assert.equal(normalizeProduct(product({ cpu: "Intel Core i7-6700" })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ cpu: "Intel Core i7-7700" })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ cpu: "Intel Core i7-8700" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "AMD Ryzen 5 2600" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "AMD Ryzen 5 3600" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "AMD Ryzen 9 5950X" })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ cpu: "Unknown Turbo CPU" })).hardwareMatch, false);
});

test("memory is at least 128 GB", () => {
  assert.equal(normalizeProduct(product({ ram_size: 64 })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ ram_size: 128 })).hardwareMatch, true);
});

test("storage requires two physical solid-state drives of at least 400 GB each", () => {
  assert.equal(normalizeProduct(product()).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [512, 512], sata: [], hdd: [], general: [512] }, hdd_arr: ["512 GB NVMe", "512 GB NVMe"] })).hardwareMatch, true);
  assert.equal(normalizeProduct(product({ hdd_count: 1, serverDiskData: { nvme: [], sata: [960], hdd: [], general: [960] }, hdd_arr: ["960 GB SSD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [], sata: [], hdd: [4000, 4000], general: [4000] }, hdd_arr: ["4 TB HDD", "4 TB HDD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [], sata: [960], hdd: [4000], general: [960] }, hdd_arr: ["960 GB SSD", "4 TB HDD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ serverDiskData: { nvme: [], sata: [240, 240], hdd: [], general: [240] }, hdd_arr: ["240 GB SSD", "240 GB SSD"] })).hardwareMatch, false);
  assert.equal(normalizeProduct(product({ hdd_count: 3, serverDiskData: { nvme: [], sata: [400, 400, 240], hdd: [], general: [400] }, hdd_arr: ["400 GB SSD", "400 GB SSD", "240 GB SSD"] })).hardwareMatch, true);
});

test("money uses integer cents, includes IPv4 and requires net price below 65", () => {
  assert.equal(grossCents(4839, 0.24), 6000);
  const below = normalizeProduct(product({ price: 46.67 }));
  const equal = normalizeProduct(product({ price: 46.69, ip_price: { Monthly: 1.7 } }));
  const above = normalizeProduct(product({ price: 46.7, ip_price: { Monthly: 1.7 } }));
  assert.equal(below.monthlyGrossCents < 6000, true);
  assert.equal(equal.monthlyGrossCents, 6000);
  assert.equal(above.monthlyGrossCents > 6000, true);
  assert.equal(grossCents(Math.round((59.5 / 1.19) * 100), 0.24), 6200);
  const state = {};
  assert.equal(processInventory([product({ id: 10, price: 63.29 })], { state }).results.length, 1);
  assert.equal(processInventory([product({ id: 11, price: 63.3 })], { state }).results.length, 0);
});

test("current nested Hetzner feed records preserve normalized server behavior", () => {
  assert.deepEqual(normalizeProduct(nestedProduct()), {
    id: "99",
    cpu: "Intel Core i7-8700",
    cpuMark: 12807,
    memoryGb: 128,
    storage: "480 GB SSD + 480 GB SSD",
    storageAmbiguous: false,
    hardwareMatch: true,
    monthlyNetCents: 6170,
    monthlyGrossCents: 7651,
    setupGrossCents: 0,
    ipv4Included: true,
    ipv4NetCents: 170,
    datacenter: "FSN1-DC1",
    bandwidthMbps: 1000,
    nextReduction: "2026-09-03T22:13:16.000Z",
    link: "https://www.hetzner.com/sb/",
  });
});

test("malformed nested pricing and units fail closed", () => {
  const invalidProducts = [
    (() => {
      const value = nestedProduct();
      delete value.Prices.monthly.EUR;
      return value;
    })(),
    nestedProduct({
      Prices: {
        monthly: { EUR: -1 },
        setup: { EUR: 0 },
      },
    }),
    (() => {
      const value = nestedProduct();
      delete value.IPPrices.monthly.EUR;
      return value;
    })(),
    (() => {
      const value = nestedProduct();
      value.Hardware.RAM.SizeUnit = "MB";
      return value;
    })(),
    (() => {
      const value = nestedProduct();
      value.Hardware.Storage.SizeUnit = "TB";
      return value;
    })(),
  ];
  for (const value of invalidProducts) {
    const outcome = processInventory([value], { mode: "on_demand" });
    assert.equal(outcome.diagnostics.malformed, 1);
    assert.deepEqual(outcome.results, []);
  }
});

test("generated workflow fetches the current nested Hetzner auction feed", () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, "workflow.json"), "utf8"));
  const configuration = workflow.nodes.find((node) => node.name === "Central Configuration");
  const values = JSON.parse(configuration.parameters.jsonOutput);
  assert.equal(
    values.HETZNER_FEED_URL,
    "https://www.hetzner.com/_resources/app/data/app/live_data_sb.json",
  );
});

test("scheduled state alerts once and alerts after an above-to-below transition", () => {
  const state = {};
  const above = product({ id: 42, price: 63.3 });
  const below = product({ id: 42, price: 63.29 });
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
    product({ id: 3, price: 64 }),
  ];
  const before = JSON.stringify(state);
  const outcome = processInventory(inventory, { mode: "on_demand", state });
  assert.deepEqual(outcome.results.map((item) => item.id), ["1", "2", "3"]);
  assert.equal(outcome.results.some((item) => item.monthlyNetCents >= 6500), true);
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
