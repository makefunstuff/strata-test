# Whole-repo Q&A with citations (TST-1)

What it tries: put a whole real codebase (~100K tokens) into one prompt and ask questions whose answers sit on one
known line, at the start, middle and end of the prompt. The model must answer and cite `path:line`. Strata
(Qwen3.8-Flash-Next IQ2_XS, 131K context) runs against the router's dense `qwen3.8-27b` (131K context).

## Verdict

**Strata handles whole-repo Q&A at ~100K tokens as well as the 27B on answers (25/25 each) and is about 2.9x faster
to first token (42 s against 122 s). Its line citations are slightly less exact: 23/25 strictly right against the
27B's 25/25. Neither arm lost accuracy toward the middle or end of the prompt.**

- **Accuracy.** The 27B got every question right on both counts. Strata got every *answer* right, but on two the
  cited line was 1–3 lines away from the expected one: `history-sync-hang` cited the release heading
  `HISTORY.md:88` ("1.3.7 / 2022-04-28") instead of the bullet `:91` (a defensible citation, since it shows the
  version, but the pre-set rule wants the line with the fix), and `merge-numeric` cited `test/req.params.js:143`
  (the `.get('/buzz')` line) one line above the expected header. Graded leniently (heading accepted), Strata is
  24/25. Both misses are line precision, not retrieval: the right file and the right place were found every time.
- **No lost-in-the-middle.** By position: 27B 8/8, 8/8, 9/9; Strata 7/8 (start), 7/8 (middle), 9/9 (end). The
  hardest-looking end questions (the `test/types/*.ts` files at 88–99 % of the prompt) were right on both arms.
- **Speed.** Every question pays the full ~100.8K-token prefill (cold, nonce first). Strata prefills at
  **2,400 tok/s** (TTFT 41.8–42.1 s), the same rate the full-experts eval measured at 37K: no slowdown at 100K.
  The 27B prefills at **836 tok/s** (TTFT 120.3–121.9 s), a bit below its ~1K at 37K. Median total per
  question: Strata **43.8 s**, 27B **124.7 s**. Strata's mean (50.0 s) carries three long thinkers (2.3K–7.3K
  output tokens, up to 132 s on `hit-handle-header`); the 27B never thought past ~460 tokens.
- **Context.** Both have 131,072 tokens, so neither had to truncate anything. Strata's own count of the
  corpus (100,578) matches the 27B's `/tokenize` (100,571) to within 7 tokens.
- **Memory.** MemAvailable bottomed at 9.4 GiB with Strata up (floor 8 GiB); no VM or the embedding container
  was touched.
- **Use it for:** asking questions of a whole small-to-medium repo in one shot, where Strata's prefill makes a
  100K-token question cost ~45 s instead of ~2 min. If exact line numbers matter, check the cited line (or ask for
  the line's text alongside it). The suite is too easy to separate the arms on answers; a harder set (questions
  that need two files, or near-duplicate tests without the test name) is the next step.

## The setup

- **Repo:** [pillarjs/router](https://github.com/pillarjs/router) at `4064f28a6cfa7ccb311c5c59b4bcb0fea4a18398`
  (MIT; `target.json`). 44 tracked text files: the Express router's source (`index.js`, `lib/`), its TypeScript
  declarations, README, changelog, CI workflows and a large mocha suite. `package-lock.json` and images are left out
  (there are none at this commit; the rule is there for reuse).
  koajs/koa (the first pick) packed to 149K tokens with line numbers, too big, so it was dropped.
- **Packing** (`scripts/pack.ts`): files in `git ls-files` order (C locale). Each file sits between
  `===== FILE <path> (<n> lines) =====` and `===== END <path> =====`, every line carries `<n>| `, and an anchor
  line `----- <path>:<line> -----` stands before every 25th line. A full `path:line` on every line would have
  doubled the prompt (koa: 229K vs 106K raw). The result: 290,285 characters, **100,571 tokens** by the 27B's
  `/tokenize`, **100,578** tokens by Strata's own count (`usage.prompt_tokens` difference, since Strata has no `/tokenize`).
  With the system prompt and question, each request is about 100.8K prompt tokens.
- **Questions** (`questions.json`, 25): each names the accepted path(s), a canonical line, the strings that line
  must contain, and regexes the answer must match. Their place in the prompt (start/middle/end = first/second/last
  third by character offset of the canonical line) is computed from the pack: **8 start** (CI workflow, changelog,
  README, `index.js`, `lib/layer.js`, `lib/route.js`, `package.json`), **8 middle** (`test/auto-options.js` through
  `test/router.js` line 320), **9 end** (`test/router.js` from line 1352, `test/support/utils.js`,
  `test/tracing.js`, `test/types/*.ts`, `tsconfig.json`). Many test files repeat near-identical tests (the
  `6000`-handler stack tests appear four times, `x-saw-1` headers in several files), so the question names the test
  and the citation has to be in the right file.
- **Grading** (`scripts/lib.ts`, mechanical): the reply must carry `ANSWER: …` and `CITATION: <path>:<line>`.
  *Citation right* = the path is accepted and the cited line of the pinned checkout contains an expected string.
  *Answer right* = every answer regex matches the ANSWER text. **Right = both.** `scripts/check.ts` proves the
  canonical citation grades right and a wrong line does not.
- **Requests** (`scripts/run.ts`): `/v1/chat/completions`, streamed, `chat_template_kwargs.enable_thinking: true`
  with no effort field on **both arms** (the setting pi sends for `:medium`), server-default sampling,
  `max_tokens` 16384. **Cold:** a fresh `[request <uuid>]` opens every user message, so neither server's prefix
  cache can serve the repo (llama.cpp reports `cache_n: 0`); every question pays the full ~100K prefill. A tiny
  warm-up request goes first so model load is not timed. TTFT = request sent to the first streamed delta
  (thinking or answer); total = request sent to end of stream.
- **Truncation:** the runner drops whole files from the end until prompt + `max_tokens` fits the arm's context.
  Both arms have 131,072 tokens, so **neither arm had anything cut** (`truncated_files: []` in
  `results/*.meta.json`).
- No agent is involved (one question, one reply), so no pi; the API is called directly from node.

## Results

Run 2026-10-19, 10:48–12:04, one round per arm, 25 questions each. Prompt ~100.8K tokens per request on both.

| arm | start | middle | end | **right** | citation right | answer right |
|---|---|---|---|---|---|---|
| `qwen3.8-27b` (router) | 8/8 | 8/8 | 9/9 | **25/25** | 25/25 | 25/25 |
| Strata IQ2_XS | 7/8 | 7/8 | 9/9 | **23/25** | 23/25 | 25/25 |

| arm | TTFT median (min–max) | total median | total mean | total max | prefill tok/s | output tokens median |
|---|---|---|---|---|---|---|
| `qwen3.8-27b` | 121.7 s (120.3–121.9) | 124.7 s | 124.8 s | 129.8 s | 836 | 184 |
| Strata IQ2_XS | 42.0 s (41.8–42.1) | 43.8 s | 50.0 s | 132.3 s | 2,400 | 178 |

TTFT and total by position barely move (TTFT is all prefill, and the prompt is the same size): 27B 121.5 / 121.7 /
121.7 s TTFT and 123.2 / 124.8 / 125.6 s total at start / middle / end; Strata 41.9 / 42.0 / 42.1 s and
43.3 / 44.6 / 43.8 s.

Some citations differ from the canonical line but still pass, because the cited line carries the fact:
`lib/route.js:112` (the dispatch's `method = 'get'`, both arms), `test/router.js:1417` (`shouldHitHandle(2)`, both),
`test/support/utils.js:23` (`res.setHeader(name, 'hit')`, both), `test/tracing.js:23` (Strata).

Full tables, every question per arm and every miss: [`results/summary.md`](results/summary.md). Raw rows:
`results/<arm>.jsonl` (reply, citation, timings, usage, llama.cpp's `timings`), thinking text in
`results/<arm>/<id>.reasoning.txt`, run settings in `results/<arm>.meta.json`.

## How to run

Node 25 (runs the `.ts` files directly), git, jq, and `local-ai-mode`. By day only (the GPUs belong to other work
from 00:00 to 08:00). Endpoints and the key come from the environment, never from the repo:

```bash
export STRATA_BASE_URL=http://<strata-host>:18097/v1    # Strata's OpenAI API, /v1 included
export STRATA_API_KEY=<key>                              # Strata's bearer key (from the host setup)
export ROUTER_BASE_URL=http://<router-host>:18080/v1    # llama.cpp router; its /tokenize sits beside /v1
```

```bash
scripts/fetch.sh                 # clone the pinned commit into work/repo (gitignored)
node scripts/check.ts            # validate questions.json against the checkout, show positions
scripts/run-arms.sh              # 27B on the router, then Strata, then back to the router (always)
scripts/run-arms.sh strata       # one arm only
node scripts/report.ts           # rewrite results/summary.md from results/*.jsonl (regrades every row)
```

`run.ts` appends a row per question and skips ids it already has, so a stopped run (the night stop, a mode switch)
resumes where it left off; `--force` asks everything again, `--only id,id` a subset, `--label` names a new run,
`--warm` drops the nonce to measure prefix-cache reuse. As a regression suite: rerun with a new `--label` after a
Strata or model change and compare in `summary.md`. To retarget, change `target.json` and rewrite `questions.json`
(`check.ts` tells you which lines no longer match).
