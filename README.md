# strata-test

This is a mini-projects testing repo for [Strata](https://github.com/Niko1221/Strata): small, self-contained
experiments that run Qwen3.8-Flash-Next on a home GPU box through Strata, to find out what it is good for.

Each mini project lives in its own folder with a short README: what it tries, how to run it, and what came out.

## Setup on this machine

- Strata runs as `strata.service` (IQ2_XS, OpenAI-compatible API on port 18097 under `/v1`; the host is set with `STRATA_BASE_URL`).
  It holds both GPUs, so it can't run beside the llama.cpp router: switch with `local-ai-mode strata|router|status`.
- Background and benchmarks: `homelab/evals/strata-2026-10-19/` (Coder IQ1_M) and
  `homelab/evals/strata-2026-10-19-full-experts/` (IQ2_XS and Q2_0).

## Rules

- TypeScript or shell only, no Python. Drive the model through headless pi (`pi -p --mode json`) where an agent
  is involved.
- Switch back to the router when you're done (`local-ai-mode router`).

## Public repo

This repo is public on GitHub, and the games are deployed to GitHub Pages. Never commit secrets, API keys,
internal hostnames or LAN addresses; read them from env vars (`STRATA_BASE_URL`, `STRATA_API_KEY`).
