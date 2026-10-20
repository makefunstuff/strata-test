// Gridwatch data: deterministic, generated from a seed so the dashboard, the charts and
// the table always describe the same operating day. No fetch, no build step.

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const DEPOTS = [
  { id: "awl", name: "Atherden Road, Lewisham", code: "AWL", buses: 148, charger: 36, color: "#1f9c8a" },
  { id: "kgn", name: "Kilner Lane, Hackney", code: "KGN", buses: 112, charger: 24, color: "#4a7fd6" },
  { id: "wfp", name: "Well Hall, Greenwich", code: "WFP", buses: 96, charger: 22, color: "#c98a1e" },
  { id: "brp", name: "Brentford, Hounslow", code: "BRP", buses: 74, charger: 18, color: "#b1553f" },
  { id: "ngm", name: "New Cross Garage", code: "NGM", buses: 62, charger: 12, color: "#7c6bb0" },
  { id: "stk", name: "Stoke Newington", code: "STK", buses: 40, charger: 8, color: "#2f8f5f" },
];

/** 24 hourly load samples per depot, in kW, with an evening charge peak and a night trough */
export function loadSeries(seed = 5) {
  const rnd = mulberry32(seed);
  const shape = [0.34, 0.28, 0.24, 0.22, 0.23, 0.3, 0.52, 0.74, 0.66, 0.5, 0.42, 0.4,
                 0.42, 0.44, 0.46, 0.5, 0.62, 0.86, 1.0, 0.94, 0.78, 0.62, 0.48, 0.4];
  return DEPOTS.map((d, di) => ({
    depot: d,
    kw: shape.map((s, i) => {
      const jitter = 0.9 + rnd() * 0.2;
      const out = s * jitter * (d.charger * 46 + d.buses * 1.1);
      // Well Hall tripped a charger bank at 19:00 — the visible anomaly in the chart
      return Math.round(di === 2 && i >= 19 ? out * 0.62 : out);
    }),
  }));
}

/** per-depot metrics for the day */
export const metrics = {
  energyMwh: 412.6,
  costGbp: 61890,
  co2Tonnes: 11.2,
  gridImportPct: 71,
  solarPct: 17,
  batteryPct: 12,
  fleetOnline: 466,
  fleetTotal: 532,
  punctuality: 93.4,
  kWhPerKm: 1.31,
  targetKWhPerKm: 1.24,
  peakKw: 7820,
  peakAt: "19:10",
};

export const week = [
  { day: "Mon", kwh: 1.28, cost: 58120 },
  { day: "Tue", kwh: 1.3, cost: 59940 },
  { day: "Wed", kwh: 1.27, cost: 57880 },
  { day: "Thu", kwh: 1.34, cost: 63210 },
  { day: "Fri", kwh: 1.36, cost: 64700 },
  { day: "Sat", kwh: 1.22, cost: 52480 },
  { day: "Sun", kwh: 1.31, cost: 61890 },
];

export const rows = [
  { depot: DEPOTS[0], load: 1840, target: 1620, buses: 141, chargers: 34, soc: 86, state: "over", note: "evening peak over contract", trend: [12, 14, 13, 18, 22, 19, 18] },
  { depot: DEPOTS[1], load: 1120, target: 1180, buses: 108, chargers: 24, soc: 78, state: "ok", note: "on plan", trend: [14, 13, 12, 12, 13, 12, 11] },
  { depot: DEPOTS[2], load: 742, target: 1010, buses: 92, chargers: 17, soc: 61, state: "fault", note: "charger bank 3 offline since 18:40", trend: [16, 15, 15, 14, 9, 7, 7] },
  { depot: DEPOTS[3], load: 690, target: 700, buses: 71, chargers: 18, soc: 82, state: "ok", note: "on plan", trend: [11, 11, 12, 11, 12, 11, 11] },
  { depot: DEPOTS[4], load: 452, target: 520, buses: 58, chargers: 11, soc: 74, state: "low", note: "21 buses below 40 % at 20:00", trend: [13, 12, 11, 10, 9, 8, 8] },
  { depot: DEPOTS[5], load: 306, target: 300, buses: 38, chargers: 8, soc: 90, state: "ok", note: "on plan", trend: [9, 9, 9, 10, 9, 9, 10] },
];

export const alerts = [
  { t: "19:42", kind: "fault", text: "Well Hall: charger bank 3 offline, 12 buses uncharged" },
  { t: "19:10", kind: "peak", text: "Grid import peaked at 7.82 MW — 212 kW under contract ceiling" },
  { t: "18:05", kind: "warn", text: "New Cross: 21 buses below 40 % state of charge" },
  { t: "16:20", kind: "info", text: "Solar arrays closed the day at 70 MWh, 17 % of demand" },
];

export const fmt = {
  gbp: (v) => "£" + Math.round(v).toLocaleString("en-GB"),
  num: (v) => v.toLocaleString("en-GB"),
  pct: (v) => (v >= 0 ? "" : "") + v.toFixed(1) + " %",
};
