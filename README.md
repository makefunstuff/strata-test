# strata-test

This is a mini-projects testing repo for [Strata](https://github.com/Niko1221/Strata): small, self-contained
experiments that run Qwen3.8-Flash-Next on a home GPU box through Strata, to find out what it is good for.

Each mini project lives in its own folder with a short README: what it tries, how to run it, and what came out.

## What's in here

Two shelves of browser work, both plain static files (no build step, no npm, no server), both published
to GitHub Pages, the layout on Pages mirroring this repo:

| shelf | what | live |
|---|---|---|
| [`games/`](games/) | five three.js arcade games on one shared kit (CRT bezel, particles, bloom, WebAudio) | [/games/](https://makefunstuff.github.io/strata-test/games/) |
| [`experiments/`](experiments/) | five three.js graphics/motion experiments: GPU water, Rapier voxel demolition, tearing cloth, GPU flocking, volumetric fire | [/experiments/](https://makefunstuff.github.io/strata-test/experiments/) |

The site root is [`index.html`](index.html), the hub that links both. Each folder carries its own
headless-Chromium checker (`games/tools/verify.mjs`, `experiments/tools/check.mjs`); the numbers they
last reported are in the shelf READMEs.

## Setup on this machine

- Strata runs as `strata.service` (IQ2_XS, OpenAI-compatible API on port 18097 under `/v1`; the host is set with `STRATA_BASE_URL`).
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
