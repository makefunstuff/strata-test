# strata-test

This is a mini-projects testing repo for [Strata](https://github.com/Niko1221/Strata): small, self-contained
experiments that run Qwen3.8-Flash-Next on a home GPU box through Strata, to find out what it is good for.

Each mini project lives in its own folder with a short README: what it tries, how to run it, and what came out.

## What's in here

Four shelves of browser work, all plain static files (no build step, no npm, no server),
all published to GitHub Pages, the layout on Pages mirroring this repo:

| shelf | what | live |
|---|---|---|
| [`games/`](games/) | five three.js arcade games on one shared kit (CRT bezel, particles, bloom, WebAudio) | [/games/](https://makefunstuff.github.io/strata-test/games/) |
| [`experiments/`](experiments/) | five three.js graphics/motion experiments: GPU water, Rapier voxel demolition, tearing cloth, GPU flocking, volumetric fire | [/experiments/](https://makefunstuff.github.io/strata-test/experiments/) |
| [`design/`](design/) | eleven design briefs — landing page, dashboard, nine-screen mobile app, TUI, design system, identity, estuary dataviz, grant form, motion system, a flood portal redesign, and one page in nine visual styles — each screenshotted, audited and self-critiqued | [/design/](https://makefunstuff.github.io/strata-test/design/) |

The site root is [`index.html`](index.html), the hub that links all four. Each folder carries its own
headless-Chromium checker (`games/tools/verify.mjs`, `experiments/tools/check.mjs`,
`design/tools/shoot.mjs`, `eyecandy/tools/check.mjs`); the numbers they
last reported are in the shelf READMEs. [`design/README.md`](design/README.md) is the
| [`eyecandy/`](eyecandy/) | five pieces of eye candy — aurora over a mirrored lake, thin-film soap bubbles, 200k-point GPU nebula, bioluminescent jellyfish, a feedback kaleidoscope — each with a panel, a preset and a headless check | [/eyecandy/](https://makefunstuff.github.io/strata-test/eyecandy/) |
design gallery's own summary: the eleven scores, the verdict on range and taste, and the
two things the audit was blind to. The gallery and the study pages use ES modules, so they
need http:// (or GitHub Pages), not `file://` — measured, not assumed:
`design/tools/filecheck.mjs` opens every page twice and finds 4 of 27 clean over `file://`
(`05-system` and the three pages of `10-redesign`) and 23 blocked by CORS, nine of the
eleven task index pages among them. Serve it and read it the way Pages will:
`node design/tools/serve.mjs`.

Benchmarks of Strata itself, one folder each with its README (what, how to run, results, verdict):

- [`whole-repo-qa/`](whole-repo-qa/): whole-repo Q&A with citations at ~100K tokens (TST-1).
- [`parallel-agents/`](parallel-agents/): can one Strata box serve two pi agents at once with `"parallel": 2`? Not in this RAM (TST-3).
- [`context-ladder/`](context-ladder/): prefill and decode speed at 8K–120K tokens, Strata (NVFP4-QAD pack) against the 27B; Strata pays off from ~32K (ST-1).

## Setup on this machine

- Strata runs as `strata.service` (IQ2_XS for the October benchmarks; now the `qwen3.8-flash-next-fp4-local` NVFP4-QAD pack, as of 2026-10-29, OpenAI-compatible API on port 18097 under `/v1`; the host is set with `STRATA_BASE_URL`).
  It holds both GPUs, so it can't run beside the llama.cpp router: switch with `local-ai-mode strata|router|status`.
- Background and benchmarks: `homelab/evals/strata-2026-10-19/` (Coder IQ1_M) and
  `homelab/evals/strata-2026-10-19-full-experts/` (IQ2_XS and Q2_0).

## Rules

- TypeScript or shell only, no Python. Drive the model through headless pi (`pi -p --mode json`) where an agent
  is involved.
- **Never switch modes from inside an agent run.** An agent working on this box is served by
  `strata.service` itself, so `local-ai-mode router` stops the model that is answering: the run
  dies mid-task (it killed a games task on 2026-10-19). Leave Strata up and walk away. Switching
  to the router is the human's call, made from a shell, after the agent is finished.
  `local-ai-mode status` is safe to read at any time.

## Public repo

This repo is public on GitHub, and the games are deployed to GitHub Pages. Never commit secrets, API keys,
internal hostnames or LAN addresses; read them from env vars (`STRATA_BASE_URL`, `STRATA_API_KEY`).
