#!/usr/bin/env bash
# The network pi-tickets.ts's sandboxed pi runs see (homelab/evals/strata-2026-10-19-full-experts/scripts/sandbox.sh,
# pointed at STRATA_BASE_URL's host:port instead of the host's loopback): the strata-sbx-proxy container has no network
# at all (--network none) and relays its own 127.0.0.1:18097 through a unix socket to Strata. The pi containers join
# its namespace (--network container:strata-sbx-proxy), so their base URL is http://127.0.0.1:18097/v1 and nothing
# else is reachable.
# usage: sandbox.sh up | down
set -eu
SOCK_DIR=${SOCK_DIR:-/tmp/strata-sbx-sock}
down(){ docker rm -f strata-sbx-proxy >/dev/null 2>&1 || true
  [ -f "$SOCK_DIR/socat.pid" ] && kill "$(cat "$SOCK_DIR/socat.pid")" 2>/dev/null; rm -f "$SOCK_DIR/socat.pid"; }
case ${1:-} in
  down) down ;;
  up)
    : "${STRATA_BASE_URL:?}"
    TARGET=$(printf '%s' "$STRATA_BASE_URL" | sed -E 's|^https?://([^/]+).*|\1|')
    down
    mkdir -p "$SOCK_DIR"; rm -f "$SOCK_DIR/model.sock"
    setsid socat UNIX-LISTEN:$SOCK_DIR/model.sock,fork,mode=666 TCP:$TARGET >/dev/null 2>&1 < /dev/null &
    echo $! > "$SOCK_DIR/socat.pid"
    docker run -d --rm --name strata-sbx-proxy --network none --read-only --cap-drop ALL \
      --security-opt no-new-privileges -v "$SOCK_DIR:/s" \
      alpine/socat@sha256:3d9e7966201dd3a065df591020a09fd3c70845de7e7086e3531ea69db774406b \
      TCP-LISTEN:18097,bind=127.0.0.1,fork,reuseaddr UNIX-CONNECT:/s/model.sock >/dev/null
    echo "strata-sbx-proxy 127.0.0.1:18097 -> Strata" ;;
  *) echo "usage: sandbox.sh up | down"; exit 2 ;;
esac
