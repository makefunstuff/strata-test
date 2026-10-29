// Summarise results/*.jsonl into results/summary.md (the table) and results/ladder.svg (the chart).
//   node scripts/report.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, RUNGS, rungName } from "./lib.ts";

const ARMS = [
  { arm: "strata", name: "Strata (NVFP4-QAD)", color: "#d9480f" },
  { arm: "27b", name: "qwen3.8-27b (router)", color: "#1c7ed6" },
];
const rows = (arm: string) => {
  const f = join(HERE, "results", `${arm}.jsonl`);
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const median = (xs: number[]) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const range = (xs: number[]) => { const s = xs.filter((x) => typeof x === "number"); return s.length ? `${Math.min(...s)}–${Math.max(...s)}` : "–"; };

interface Cell { arm: string; rung: string; n: number; right: number; prompt: number | null; ttft: number | null;
  ttftRange: string; prefill: number | null; decode: number | null; decodeRange: string; total: number | null; out: number | null }
const cells: Cell[] = [];
for (const a of ARMS) for (const r of RUNGS.map(rungName)) {
  const rs = rows(a.arm).filter((x) => x.rung === r && !x.error);
  if (!rs.length) continue;
  cells.push({
    arm: a.arm, rung: r, n: rs.length, right: rs.filter((x) => x.right).length,
    prompt: median(rs.map((x) => x.prompt_tokens)), ttft: median(rs.map((x) => x.ttft_s)), ttftRange: range(rs.map((x) => x.ttft_s)),
    prefill: median(rs.map((x) => x.prefill_tps)), decode: median(rs.map((x) => x.decode_tps)), decodeRange: range(rs.map((x) => x.decode_tps)),
    total: median(rs.map((x) => x.total_s)), out: median(rs.map((x) => x.completion_tokens)),
  });
}
const cell = (arm: string, rung: string) => cells.find((c) => c.arm === arm && c.rung === rung);

let md = "| rung | arm | right | prompt tokens | TTFT s, median (range) | prefill tok/s | decode tok/s, median (range) | output tokens | total s |\n";
md += "|---|---|---|---|---|---|---|---|---|\n";
for (const r of RUNGS.map(rungName)) for (const a of ARMS) {
  const c = cell(a.arm, r);
  if (!c) { md += `| ${r} | ${a.name} | not run | | | | | | |\n`; continue; }
  md += `| ${r} | ${a.name} | ${c.right}/${c.n} | ${c.prompt} | ${c.ttft} (${c.ttftRange}) | **${c.prefill}** | **${c.decode}** (${c.decodeRange}) | ${c.out} | ${c.total} |\n`;
}
md += "\n| rung | TTFT speed-up (27B ÷ Strata) | total speed-up |\n|---|---|---|\n";
for (const r of RUNGS.map(rungName)) {
  const s = cell("strata", r), b = cell("27b", r);
  if (s?.ttft && b?.ttft) md += `| ${r} | ${(b.ttft / s.ttft).toFixed(2)}x | ${(b.total! / s.total!).toFixed(2)}x |\n`;
}
writeFileSync(join(HERE, "results/summary.md"), md);
console.log(md);

// Two small panels side by side: prefill tok/s and decode tok/s against prompt tokens, one line per arm.
const W = 340, H = 220, M = { l: 52, r: 12, t: 28, b: 38 };
const xs = RUNGS;
const xOf = (t: number) => M.l + (Math.log2(t) - Math.log2(xs[0])) / (Math.log2(xs.at(-1)!) - Math.log2(xs[0])) * (W - M.l - M.r);
function panel(title: string, field: "prefill" | "decode", dx: number) {
  const vals = cells.map((c) => c[field] ?? 0);
  const top = Math.ceil(Math.max(...vals, 1) * 1.15 / (field === "prefill" ? 500 : 20)) * (field === "prefill" ? 500 : 20);
  const yOf = (v: number) => H - M.b - v / top * (H - M.t - M.b);
  let g = `<g transform="translate(${dx},0)"><text x="${M.l}" y="16" font-size="13" font-weight="600" fill="currentColor">${title}</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = top * i / 4, y = yOf(v);
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.12"/>`;
    g += `<text x="${M.l - 6}" y="${y + 4}" font-size="10" text-anchor="end" fill="currentColor" fill-opacity="0.7">${Math.round(v)}</text>`;
  }
  for (const t of xs) g += `<text x="${xOf(t)}" y="${H - M.b + 16}" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${rungName(t)}</text>`;
  g += `<text x="${(M.l + W - M.r) / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity="0.7">prompt tokens</text>`;
  for (const a of ARMS) {
    const pts = xs.map((t) => [t, cell(a.arm, rungName(t))?.[field]] as const).filter(([, v]) => typeof v === "number");
    if (!pts.length) continue;
    g += `<polyline fill="none" stroke="${a.color}" stroke-width="2" points="${pts.map(([t, v]) => `${xOf(t)},${yOf(v!)}`).join(" ")}"/>`;
    for (const [t, v] of pts) g += `<circle cx="${xOf(t)}" cy="${yOf(v!)}" r="3" fill="${a.color}"/>`;
  }
  return g + "</g>";
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 2} ${H + 20}" width="${W * 2}" height="${H + 20}" font-family="system-ui, sans-serif" color="#444">`;
svg += panel("Prefill tok/s (higher is better)", "prefill", 0) + panel("Decode tok/s", "decode", W);
ARMS.forEach((a, i) => {
  svg += `<rect x="${M.l + i * 190}" y="${H + 6}" width="10" height="10" fill="${a.color}"/><text x="${M.l + 14 + i * 190}" y="${H + 15}" font-size="11" fill="currentColor">${a.name}</text>`;
});
writeFileSync(join(HERE, "results/ladder.svg"), svg + "</svg>\n");
