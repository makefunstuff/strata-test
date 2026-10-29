# Context ladder: Strata vs the 27B (ST-1)

What it tries: send the same kind of question with real source code as padding at 8K, 32K, 64K and 120K prompt
tokens, three runs per rung, and time each request from the SSE stream: time to first token (prefill tok/s) and
decode tok/s. One arm is Strata, the other the router's dense `qwen3.8-27b`. Each answer is graded, so a fast wrong
answer would not count.

## Verdict

**Strata pays off from about 32K tokens of prompt, and the gap grows with length: its prefill rises to ~1,840
tok/s and stays flat from 64K to 120K, while the 27B's falls from ~1,160 to ~800. Time to first token is 1.15x
faster at 8K, 1.6x at 32K, 1.9x at 64K and 2.3x at 120K (67 s against 154 s). The 27B decodes faster, though
(~90–110 tok/s up to 32K, ~67 at 120K, against Strata's flat ~50), so at 8K the two tie on total time (Strata
5% slower) and every long answer eats into Strata's lead: it stays ahead as long as the reply is under ~1.2K
tokens at 32K, ~4K at 64K and ~16K at 120K.** Every one of the 24 answers was right on both arms, so neither one
traded accuracy for speed at any length. Use Strata for long-prompt, short-answer work (whole-repo questions,
reading big logs or documents); keep the 27B for short prompts and long generations.

**Note on the Strata arm:** the brief names Strata IQ2_XS, but `strata.service` on this box now serves the
`qwen3.8-flash-next-fp4-local` NVFP4-QAD pack (Strata 0.2.7, MTP speculation, `--kv int8`), and no IQ2_XS pack
is left under `/models/strata-packs/`. That is what was measured. Its decode (~50 tok/s) is well below the
IQ2_XS reference (~90 tok/s), and its prefill at 64K (1.84K) below IQ2_XS's ~2.4K at 37K; the 27B lines up with
its references (~1K prefill, ~89 decode).

## Results

Run 2026-10-29, 16:36–16:57 EET: the 27B arm first (router), then Strata in one ~7-minute window, then back to the
router. Medians of three runs; each run is one of three questions (`questions.json`).

| rung | arm | right | prompt tokens | TTFT s, median (range) | prefill tok/s | decode tok/s, median (range) | output tokens | total s |
|---|---|---|---|---|---|---|---|---|
| 8K | Strata (NVFP4-QAD) | 3/3 | 8210 | 6.142 (6.124–6.621) | **1337** | **48.8** (45.5–51.7) | 89 | 8.361 |
| 8K | qwen3.8-27b (router) | 3/3 | 8171 | 7.046 (7.026–7.051) | **1159** | **104.9** (92.7–123) | 85 | 7.933 |
| 32K | Strata (NVFP4-QAD) | 3/3 | 32792 | 18.557 (18.48–18.57) | **1767** | **54.1** (50.3–54.9) | 106 | 20.391 |
| 32K | qwen3.8-27b (router) | 3/3 | 32754 | 30.352 (30.214–30.362) | **1079** | **110.4** (89.8–122.9) | 87 | 31.311 |
| 64K | Strata (NVFP4-QAD) | 3/3 | 65559 | 35.599 (35.495–35.691) | **1842** | **49.5** (46.5–54.7) | 59 | 36.671 |
| 64K | qwen3.8-27b (router) | 3/3 | 65522 | 68.287 (68.067–68.385) | **960** | **82.9** (67.5–91.9) | 87 | 69.341 |
| 120K | Strata (NVFP4-QAD) | 3/3 | 122899 | 66.766 (66.745–67.799) | **1841** | **49.1** (43.4–53.2) | 65 | 68.241 |
| 120K | qwen3.8-27b (router) | 3/3 | 122865 | 153.68 (153.229–153.743) | **799** | **66.9** (66.8–68.3) | 168 | 156.263 |

| rung | TTFT speed-up (27B ÷ Strata) | total speed-up |
|---|---|---|
| 8K | 1.15x | 0.95x |
| 32K | 1.64x | 1.54x |
| 64K | 1.92x | 1.89x |
| 120K | 2.30x | 2.29x |

![Prefill and decode tok/s against prompt length](results/ladder.svg)

- **Where the 27B stops:** it doesn't, within this ladder. Its preset has `ctx-size = 131072`, so 120K
  (122,880) plus the 4,096 `max_tokens` fits; the next power-of-two rung (128K + output) would not. Strata's
  `--max-context` is 262,144.
- **Break-even reply length** (where the 27B's faster decode wins back Strata's prefill lead):
  TTFT saved ÷ (1/Strata decode − 1/27B decode): 32K 11.8 s ÷ 0.0094 s ≈ 1.25K tokens, 64K 32.7 s ÷ 0.0081 s ≈
  4.0K, 120K 86.9 s ÷ 0.0054 s ≈ 16.0K (medians from the table). At 8K Strata is behind from the first ~100 output tokens on.
- **Decode numbers are from short replies** (51–243 tokens, thinking included), so they carry more noise than
  the prefill numbers; the 27B's also swing with its DFlash2 + n-gram speculation (67–123 tok/s), which drafts
  well on code-like text.
- **Client and server agree:** the router's own `timings` match the client's prefill rate to within 1.4% on every 27B request,
  so none waited behind another task's request in the router's single slot (`/slots` was checked before each
  request too). Strata reports the same kind of `timings`, within 0.7%.
- **Cold every time:** a fresh `[request <uuid>]` opens every user message, so no prefix cache helps
  (llama.cpp `cache_n` is 0 or 51 on the 27B rows: at most the system prompt came from cache).
- **Memory:** MemAvailable bottomed at 18.2 GiB with Strata up (floor 8 GiB). The VMs and the embedding
  container were not touched.

## The setup

- **Padding** (`target.json`, `scripts/fetch.sh`): real files from two MIT repos, [pillarjs/router](https://github.com/pillarjs/router)
  (TST-1's corpus, same commit) and [koajs/koa](https://github.com/koajs/koa) (router alone is ~100K tokens, too
  few for 120K), each file between `===== FILE <repo>/<path> =====` and `===== END … =====`, in `git ls-files`
  order, router first. Lock files and images are left out.
- **Questions** (`questions.json`): three of TST-1's questions on small router files (`lib/layer.js`,
  `lib/route.js`, `package.json`), with the path made explicit since two repos are in the prompt. Graded by regex
  on the `ANSWER:` line.
- **Prompts** (`scripts/build.ts`): for each rung and question, filler lines up to the rung (the last filler
  file cut at a line), the question's file put in at the file boundary nearest the middle (48–61% of the prompt),
  sized by the 27B's `/tokenize` to land ~60 tokens under the rung. Built once and sent unchanged to both arms;
  each arm's tokenizer counts them within 50 tokens of each other.
- **Requests** (`scripts/run.ts`): `/v1/chat/completions`, streamed, `chat_template_kwargs.enable_thinking:
  true` on **both arms**, server-default sampling, `max_tokens` 4096. A tiny warm-up request first. TTFT =
  request sent to the first streamed delta (thinking or answer); prefill tok/s = prompt tokens ÷ TTFT; decode
  tok/s = (completion tokens − 1) ÷ (last delta − first delta). No agent is involved, so no pi.

## How to run

```sh
scripts/fetch.sh                                   # clone the padding repos into work/
export ROUTER_BASE_URL=http://<host>:18080/v1
local-ai-mode status && local-ai-mode router
node scripts/build.ts                              # work/prompts/<rung>/<question>.json
node scripts/run.ts --arm 27b                      # results/27b.jsonl
local-ai-mode strata
export STRATA_BASE_URL=http://<host>:18097/v1 STRATA_API_KEY=<key>
node scripts/run.ts --arm strata                   # results/strata.jsonl
local-ai-mode router                               # always end on the router
node scripts/report.ts                             # results/summary.md and results/ladder.svg
```

`run.ts` resumes: rows already in `results/<arm>.jsonl` are skipped (`--force` reruns them, `--rungs 8K,32K`
picks rungs). Never switch modes from inside an agent that Strata or the router is serving.
