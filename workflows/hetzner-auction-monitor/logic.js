"use strict";

const DEFAULT_CONFIG = Object.freeze({
  POLL_INTERVAL_MINUTES: 5,
  MAX_MONTHLY_NET_EUR: 65.0,
  ESTONIAN_VAT_RATE: 0.24,
  INCLUDE_PRIMARY_IPV4: true,
  MIN_MEMORY_GB: 128,
  MIN_SSD_COUNT: 2,
  MIN_SSD_SIZE_GB: 400,
  ON_DEMAND_RESULT_LIMIT: 3,
  CPU_BASELINE_MODEL: "Intel Core i7-8700",
  CPU_BASELINE_MARK: 12807,
  DEDUP_RETENTION_DAYS: 30,
});

// PassMark Average CPU Mark snapshots. Unknown CPUs fail closed. This mapping is
// refreshed when a CPU newly appears in the Hetzner feed and its PassMark page
// has been reviewed. The baseline is pinned so daily score drift cannot change
// eligibility unexpectedly.
const CPU_MARKS = Object.freeze({
  "AMD EPYC 7401P": 24072,
  "AMD EPYC 7502P": 46801,
  "AMD Ryzen 5 2600": 13180,
  "AMD Ryzen 5 3600": 17658,
  "AMD Ryzen 7 1700X": 15518,
  "AMD Ryzen 7 3700X": 22573,
  "AMD Ryzen 7 7700": 34592,
  "AMD Ryzen 7 PRO 1700X": 15180,
  "AMD Ryzen 9 3900": 30603,
  "AMD Ryzen 9 5950X": 45789,
  "AMD Ryzen Threadripper 2950X": 33152,
  "Intel Core i5-12500": 19886,
  "Intel Core i5-13500": 31164,
  "Intel Core i7-6700": 8036,
  "Intel Core i7-7700": 8643,
  "Intel Core i7-8700": 12807,
  "Intel Core i9-12900K": 41155,
  "Intel Core i9-13900": 47745,
  "Intel Core i9-9900K": 18044,
  "Intel XEON E-2276G": 13735,
  "Intel Xeon E3-1270V3": 6558,
  "Intel Xeon E3-1271V3": 7012,
  "Intel Xeon E3-1275V6": 8344,
  "Intel Xeon E3-1275v5": 7958,
  "Intel Xeon E5-1650V3": 10344,
  "Intel Xeon Gold 5412U": 43431,
  "Intel Xeon W-2145": 18104,
  "Intel Xeon W-2295": 31505,
});

function cents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid money value: ${String(value)}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number((fraction + "00").slice(0, 2)));
}

function grossCents(netCents, vatRate) {
  const rateBasisPoints = Math.round(vatRate * 10000);
  return Math.round((netCents * (10000 + rateBasisPoints)) / 10000);
}

function money(valueCents) {
  return `€${(valueCents / 100).toFixed(2)}`;
}

function flattenProduct(product) {
  if (!product?.Hardware || !product?.Prices || !product?.Details) return product;
  const hardware = product.Hardware;
  const storage = hardware.Storage;
  const monthlyPrice = product.Prices.monthly?.EUR;
  const setupPrice = product.Prices.setup?.EUR;
  const ipv4Price = product.IPPrices?.monthly?.EUR;
  const validMoney = (value, allowZero) =>
    typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (
    typeof hardware.CPU?.Name !== "string" ||
    hardware.RAM?.SizeUnit !== "GB" ||
    !Number.isFinite(Number(hardware.RAM.Size)) ||
    hardware.RAM.Size <= 0 ||
    storage?.SizeUnit !== "GB" ||
    !Number.isInteger(Number(storage.Amount)) ||
    storage.Amount <= 0 ||
    !Array.isArray(storage.Disks) ||
    !storage.Details ||
    typeof storage.Details !== "object" ||
    !validMoney(monthlyPrice, false) ||
    !validMoney(setupPrice, true) ||
    !validMoney(ipv4Price, true)
  ) {
    throw new Error("Nested product schema is incompatible");
  }
  return {
    id: product.Id,
    cpu: hardware.CPU.Name,
    ram_size: hardware.RAM.Size,
    price: monthlyPrice,
    setup_price: setupPrice,
    hdd_count: storage.Amount,
    hdd_arr: storage.Disks,
    serverDiskData: storage.Details,
    datacenter: product.Details.Datacenter?.Name,
    bandwidth: product.Details.Bandwidth,
    ip_price: { Monthly: ipv4Price },
    next_reduce_timestamp: product.Timer?.ReduceNextTimestamp,
  };
}

function storageFor(product) {
  const nestedStorage = product.Hardware?.Storage;
  const diskData = product.serverDiskData || nestedStorage?.Details;
  if (!diskData || typeof diskData !== "object") {
    return { valid: false, ambiguous: true, solidState: [], display: "Unknown" };
  }
  const nvme = Array.isArray(diskData.nvme) ? diskData.nvme : [];
  const sata = Array.isArray(diskData.sata) ? diskData.sata : [];
  const hdd = Array.isArray(diskData.hdd) ? diskData.hdd : [];
  const solidState = [
    ...nvme.map((size) => ({ type: "NVMe", size: Number(size) })),
    ...sata.map((size) => ({ type: "SSD", size: Number(size) })),
  ];
  const malformed = [...solidState.map((disk) => disk.size), ...hdd.map(Number)].some(
    (size) => !Number.isFinite(size) || size <= 0,
  );
  const described = Array.isArray(product.hdd_arr)
    ? product.hdd_arr.join(" + ")
    : Array.isArray(nestedStorage?.Disks)
      ? nestedStorage.Disks.join(" + ")
      : "";
  const diskCount = product.hdd_count ?? nestedStorage?.Amount ?? solidState.length + hdd.length;
  const ambiguous =
    malformed ||
    solidState.length + hdd.length !== Number(diskCount) ||
    (described && /(?:HDD|SAS)/i.test(described) && hdd.length === 0);
  return {
    valid: !ambiguous,
    ambiguous,
    solidState,
    display: described || solidState.map((disk) => `${disk.size} GB ${disk.type}`).join(" + "),
  };
}

function normalizeProduct(product, config = DEFAULT_CONFIG, cpuMarks = CPU_MARKS) {
  if (!product || typeof product !== "object") throw new Error("Product is not an object");
  product = flattenProduct(product);
  const id = String(product.id ?? product.key ?? "");
  const cpu = String(product.cpu ?? "").trim();
  const cpuMark = cpuMarks[cpu];
  const memoryGb = Number(product.ram_size ?? product.Hardware?.RAM?.Size);
  if (!id || !cpu || !Number.isFinite(memoryGb)) throw new Error("Missing required product fields");

  const storage = storageFor(product);
  const baseNetCents = cents(product.price ?? product.Prices?.monthly?.EUR);
  const ipv4MonthlyPrice = product.ip_price?.Monthly ?? product.IPPrices?.monthly?.EUR;
  const ipv4NetCents =
    config.INCLUDE_PRIMARY_IPV4 && ipv4MonthlyPrice
      ? cents(ipv4MonthlyPrice)
      : 0;
  const monthlyNetCents = baseNetCents + ipv4NetCents;
  const monthlyGrossCents = grossCents(monthlyNetCents, config.ESTONIAN_VAT_RATE);
  const setupNetCents = cents(product.setup_price ?? product.Prices?.setup?.EUR ?? 0);
  const qualifyingStorage =
    storage.valid &&
    storage.solidState.filter((disk) => disk.size >= config.MIN_SSD_SIZE_GB).length >=
      config.MIN_SSD_COUNT;
  const hardwareMatch =
    Number.isFinite(cpuMark) &&
    cpuMark >= config.CPU_BASELINE_MARK &&
    memoryGb >= config.MIN_MEMORY_GB &&
    qualifyingStorage;

  return {
    id,
    cpu,
    cpuMark: Number.isFinite(cpuMark) ? cpuMark : null,
    memoryGb,
    storage: storage.display,
    storageAmbiguous: storage.ambiguous,
    hardwareMatch,
    monthlyNetCents,
    monthlyGrossCents,
    setupGrossCents: grossCents(setupNetCents, config.ESTONIAN_VAT_RATE),
    ipv4Included: config.INCLUDE_PRIMARY_IPV4,
    ipv4NetCents,
    datacenter: String(product.datacenter ?? product.Details?.Datacenter?.Name ?? "Unknown"),
    bandwidthMbps: Number.isFinite(Number(product.bandwidth ?? product.Details?.Bandwidth))
      ? Number(product.bandwidth ?? product.Details?.Bandwidth)
      : null,
    nextReduction:
      (product.next_reduce_timestamp ?? product.Timer?.ReduceNextTimestamp) &&
      Number(product.next_reduce_timestamp ?? product.Timer?.ReduceNextTimestamp) > 0
        ? new Date(
            Number(product.next_reduce_timestamp ?? product.Timer?.ReduceNextTimestamp) * 1000,
          ).toISOString()
        : null,
    link: "https://www.hetzner.com/sb/",
  };
}

function processInventory(products, options = {}) {
  if (!Array.isArray(products)) throw new Error("Hetzner response schema is incompatible: server is not an array");
  const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const mode = options.mode === "on_demand" ? "on_demand" : "scheduled";
  const state = options.state || {};
  const now = Number(options.now ?? Date.now());
  const diagnostics = { malformed: 0, unknownCpu: 0, ambiguousStorage: 0 };
  const normalized = [];

  for (const product of products) {
    try {
      const item = normalizeProduct(product, config, options.cpuMarks || CPU_MARKS);
      if (item.cpuMark === null) diagnostics.unknownCpu += 1;
      if (item.storageAmbiguous) diagnostics.ambiguousStorage += 1;
      normalized.push(item);
    } catch {
      diagnostics.malformed += 1;
    }
  }

  const hardwareMatches = normalized.filter((item) => item.hardwareMatch);
  if (mode === "on_demand") {
    return {
      mode,
      results: hardwareMatches
        .sort((a, b) => a.monthlyGrossCents - b.monthlyGrossCents || a.id.localeCompare(b.id))
        .slice(0, config.ON_DEMAND_RESULT_LIMIT),
      diagnostics,
      state,
    };
  }

  state.alerted = state.alerted && typeof state.alerted === "object" ? state.alerted : {};
  const cutoff = now - config.DEDUP_RETENTION_DAYS * 86400000;
  for (const [id, alertedAt] of Object.entries(state.alerted)) {
    if (!Number.isFinite(Number(alertedAt)) || Number(alertedAt) < cutoff) delete state.alerted[id];
  }
  const alerts = hardwareMatches
    .filter((item) => item.monthlyNetCents < Math.round(config.MAX_MONTHLY_NET_EUR * 100))
    .filter((item) => !state.alerted[item.id]);
  for (const item of alerts) state.alerted[item.id] = now;
  return { mode, results: alerts, diagnostics, state };
}

function formatServer(item, rank, config = DEFAULT_CONFIG) {
  const lines = [
    `${rank}. ${money(item.monthlyGrossCents)}/month incl. 24% Estonian VAT`,
    `Net: ${money(item.monthlyNetCents)} · IPv4: ${item.ipv4Included ? `included (${money(item.ipv4NetCents)} net)` : "not included"}`,
    `Threshold: ${item.monthlyNetCents < config.MAX_MONTHLY_NET_EUR * 100 ? "below €65.00 net" : "at or above €65.00 net"}`,
    `CPU: ${item.cpu} · PassMark ${item.cpuMark}`,
    `RAM: ${item.memoryGb} GB · Storage: ${item.storage}`,
    `Location: ${item.datacenter}${item.bandwidthMbps ? ` · Network: ${item.bandwidthMbps} Mbit/s` : ""}`,
    `Auction ID: ${item.id}`,
  ];
  if (item.setupGrossCents > 0) lines.push(`Setup: ${money(item.setupGrossCents)} incl. VAT`);
  if (item.nextReduction) lines.push(`Next reduction: ${item.nextReduction}`);
  lines.push(item.link);
  return lines.join("\n");
}

function formatOnDemand(outcome, config = DEFAULT_CONFIG) {
  if (!outcome.results.length) return "No matching Hetzner auction servers are currently available.";
  return [
    `Cheapest matching Hetzner auction servers (${outcome.results.length}):`,
    ...outcome.results.map((item, index) => formatServer(item, index + 1, config)),
  ].join("\n\n");
}

function formatAlert(item, config = DEFAULT_CONFIG) {
  return `**Hetzner auction match**\n${formatServer(item, 1, config).replace(/^1\\. /, "")}`;
}

module.exports = {
  CPU_MARKS,
  DEFAULT_CONFIG,
  cents,
  formatAlert,
  formatOnDemand,
  grossCents,
  normalizeProduct,
  processInventory,
  storageFor,
};
