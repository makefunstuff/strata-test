# Two pi agents at once on Strata parallel mode (TST-3)

What it tries: can one Strata box serve two agents at once? Strata's `"parallel": 2` (two batch slots, plus
`--batch-mtp --batch-groups 1`, which `docs/BATCHING.md` recommends for about two streams on a two-GPU layer split
whose experts do not all fit in VRAM) against the service's own one-request-at-a-time config. The plan was raw
streams (1, then 2 at once), then two headless pi agents on two agentic-glimmer tickets at once, against the same
tickets one after another. Model: `swift-1.5-flash-next-iq3_s` (Swift 1.5 Qwen3.8-Flash-Next IQ3_S, engine 0.1.45,
196K context, int8 KV streamed with `--kv-resident 32768`, resident experts), on 2x RTX 5060 Ti 16 GB and 60 GiB RAM.

## Verdict

**No: not worth turning on for daily use on this box as it is set up. Parallel 2 does not fit in its RAM.** On the
parallel-2 start, MemAvailable fell to **2.80 GiB** before the engine had finished settling. That is below the run's
3 GiB floor, so the watchdog stopped the run, and Strata went back on the original config. No raw-stream or
agent numbers exist for parallel 2: the run never got that far.

The cost of two slots, as the engine logged and the watchdog measured:

| | original (1 at a time) | `"parallel": 2` + `--batch-mtp` |
|---|---|---|
| Pinned RAM for KV | 1.74 GiB (one 196K session) | + 2 slot sessions with their own 196K KV (~1.74 GiB each, docs: "each slot's whole KV cache takes pinned RAM") |
| MemAvailable, same point of the start (experts pinned, engine settling) | ~9.0–9.3 GiB | ~5.3–5.9 GiB, i.e. **~3.5 GiB less**, with ~2.7 GiB more pushed to swap |
| MemAvailable when ready / at the end | 6.0–6.4 GiB at ready, 5.2 GiB after the baseline run | **2.80 GiB and falling ~0.8 GiB/s** when the watchdog fired |
| VRAM per slot | — | 0.65 GiB on CUDA0 + 0.24 GiB on CUDA1, + 50 MiB per slot drafter on CUDA1 |
| Expert cache in VRAM (both cards) | 10,033 slots (10.36 + 9.37 GiB) | 9,041 slots (9.04 + 8.77 GiB): **−10%** |
| VRAM free with everything loaded | 257 / 131 MiB | 243 / 107 MiB (both LOW in the engine's own words) |

So the price of two slots is ~3.5 GiB of RAM (the box has ~6 GiB of headroom on a fresh start and ~5 GiB after
a while), 1.8 GiB of VRAM, and a tenth of the expert cache, which every single request pays for too. The host's
own watchdog (`strata-memwatch`, floor 2 GiB) would have fired a few seconds later and started the router in
Strata's place. Nothing else on the box had room to give: the engine alone holds ~40 GiB.

What the gain would have been is not measured here. `docs/BATCHING.md`'s own number for this shape (two stages on
two GPUs, experts not all in VRAM, `--batch-mtp`, serial windows) is about +15% aggregate tok/s for two streams
(89 vs 77 tok/s on 2x RTX 3080). What the baseline shows is the cost of *not* having it. A second request waits
for the first to finish (8.5–9.3 s at 512 tokens). Two agents in a row still keep the model busy at 67–70 tok/s
over the wall. So for two agents parallel 2 would mostly buy latency (no queueing behind the other agent's turn),
with a small aggregate gain at best, paid for with 3.5 GiB of RAM the box does not have.

**What would make it fit** (not tried, the task said to stop and report): a smaller `--max-context` (98K would
roughly halve each slot's pinned KV), or ~4 GiB more free RAM on the host. Either is the owner's call, and it should
be re-measured before it is used.

## Results

### Baseline: original config, fresh engine (66 s to the first answer)

Raw streams (`results/raw-streams.jsonl`; 512 new tokens, thinking on as pi sends it, unique prompt tag per stream):

| streams | round | aggregate tok/s | per stream: TTFT / decode tok/s |
|---|---|---|---|
| 1 | 1–3 | 67.1, 63.5, 65.2 | 0.74–0.76 s / 74.4, 69.9, 72.1 |
| 2 (the second one queues) | 1 | 62.9 | 0.75 s / 70.2 · **8.80 s** / 68.3 |
| 2 | 2 | 68.9 | 0.74 s / 72.5 · **8.51 s** / 80.3 |
| 2 | 3 | 62.9 | 0.76 s / 65.4 · **9.35 s** / 73.7 |

"Aggregate" is all streams' tokens over the time from sending to the last token. With one slot it stays at one
stream's rate. The second stream gets its first token only after the first stream's whole answer.

Tickets one after another (`results/tickets.jsonl`, sandboxed headless pi, two pairs, two rounds):

| round | pair | passed | pair wall | output tokens | tok/s over the wall | per ticket: wall, decode tok/s, TTFT median / max |
|---|---|---|---|---|---|---|
| 1 | cli-json + logstats | 2/2 | 210.0 s | 14,707 | 70.0 | 79.6 s, 79.4, 0.88/2.43 s · 130.0 s, 81.0, 0.85/2.17 s |
| 1 | config-rename + presets-ini | 2/2 | 191.9 s | 12,902 | 67.2 | 120.9 s, 77.4, 0.83/3.07 s · 70.7 s, 77.0, 0.94/2.22 s |
| 2 | cli-json + logstats | 2/2 | 174.2 s | 12,038 | 69.1 | 52.8 s, 78.0, 0.92/2.17 s · 121.1 s, 80.1, 0.84/2.16 s |
| 2 | config-rename + presets-ini | 1/2 | 194.7 s | 13,547 | 69.6 | 98.9 s, 77.1, 0.75/2.17 s · 95.5 s, 78.9, 0.73/2.20 s (presets-ini FAIL: 1 of 7 hidden tests) |

7/8 passed. The mean pair wall was 193 s. Decode inside pi was 77–81 tok/s, and the median TTFT per turn was under 1 s.

### Parallel 2

The Ansible run put `"parallel": 2` and `--batch-mtp --batch-groups 1` into the live `strata.json`
(`results/strata-parallel2.json`; diff against `results/strata-original.json`: those two changes only) and restarted
Strata. The engine carved both slots and their drafters (`results/engine-parallel2.log`). It came up with the
expert cache and VRAM figures above. The watchdog (`results/memwatch-parallel2.log`, one line per second) fired at
12:15:00, when MemAvailable fell from 5.27 to 2.80 GiB in three seconds. The engine's RSS was then still 2.7 GiB
below where the original engine settles. Raw streams and paired agents on parallel 2 were not run.

### Restore

The watchdog stopped Strata at once, so the host's own watchdog never fired and the router never started. Then
`run.sh`'s exit trap killed the watchdog in the middle of its restore. That left `strata.json` on parallel 2 with
Strata stopped for about a minute. I restored it by hand with the same command (`strata-config.sh original
--stopped`). Since then, the trap waits for the watchdog when it has fired. The fix has not been run against a
second real breach. The original config was then written back through Ansible. It is byte-identical to the copy
saved before the run (`cmp`). Strata came up on it in 70 s, answers, and reports `concurrency.serving: 1`.
`strata-memwatch` is back too, and the router is inactive. The homelab template patch was taken out again, so the
homelab checkout is as it was.

## How it runs

```
export STRATA_BASE_URL=...   # Strata's OpenAI base URL, ending in /v1 (the host setup: local-ai-mode's STRATA_URL)
export STRATA_API_KEY=...    # the client key the host setup deploys for pi and local-ai-mode
export HOMELAB_DIR=...       # the homelab checkout (Ansible, and evals/agentic-glimmer-2026-10-14/tasks)
git -C "$HOMELAB_DIR" apply "$PWD/parallel-agents/ansible/strata-config-overrides.patch"
parallel-agents/scripts/run.sh baseline     # ~15 min
parallel-agents/scripts/run.sh parallel2    # stops itself if MemAvailable < 3 GiB
parallel-agents/scripts/run.sh restore      # if parallel2 ran to the end
git -C "$HOMELAB_DIR" checkout -- roles/local_ai/templates/strata-config.json.j2
```

- **Config, only through Ansible.** `ansible/strata-config-overrides.patch` gives the role's `strata-config.json.j2`
  an optional `local_ai_strata_overrides` variable (`parallel`, `extra_args`), laid over the live `strata.json` only
  and never over the per-model configs. Without it the template renders the original byte for byte: a `--check
  --diff` run of `playbooks/configure-strata.yml` changed nothing. With `-e @ansible/parallel2.yml` it changed only
  the live `strata.json`. `scripts/strata-config.sh parallel2|original` runs that playbook. The role's handler
  restarts Strata, and the script then waits for a one-token answer.
- **Watchdog.** `scripts/memwatch.sh` logs MemAvailable, swap, memory PSI, engine RSS and VRAM every second. Below
  3 GiB it writes `logs/ABORT`, kills the pi containers and stops `strata.service` at once. That frees the RAM before
  the host's 2 GiB watchdog could start the router. It then writes the original config back through Ansible and
  starts Strata on it.
- **Raw streams.** `scripts/raw-streams.ts` sends N streaming requests at the same moment and times each from its
  own SSE deltas. It polls `/metrics` (`live.queued`, `live.slots`) meanwhile.
- **Agents.** `scripts/pi-tickets.ts seq|par` runs `pi -p --no-session --mode json --offline` in throwaway
  read-only containers, as `homelab/evals/strata-2026-10-19-full-experts` does. There are no capabilities and no
  host home. `PI_CODING_AGENT_DIR` is a temp dir holding only a `models.json` (the daily Strata entry's compat and
  thinking fields), and `~/.pi/agent` is never touched. The only network is `scripts/sandbox.sh`'s `--network none`
  proxy to Strata. The hidden tests run in a second container with no network. pi's per-turn TTFT and decode come
  from its JSON events.
- The baseline restarts Strata first (`systemctl restart`, allowed by the host's polkit rule), so both arms start
  from a fresh engine.

Files: `results/` (`raw-streams.jsonl`, `tickets.jsonl`, `load.jsonl`, `diffs/`, both configs, both watchdog
logs, the engine's start-up lines for both configs). `sessions/<label>/<ticket>.jsonl` holds pi's event streams
without the per-token deltas. `logs/` (Ansible output, the saved original config) is gitignored.

Box state during the run: no other client used Strata. No VM was running (no qemu process). The EmbeddingGemma
container on 8080 and the other containers were left alone. TST-2 (context ladder) had no process running and was
not touched.
