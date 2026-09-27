#!/usr/bin/env bash
# Starts a throwaway PostgreSQL cluster for local development and tests (no Docker needed).
# Usage: scripts/local-postgres.sh [start|stop|status]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local-pg"
PORT="${PGPORT_LOCAL:-54329}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] || BIN="$(dirname "$(command -v pg_ctl)")"
cmd="${1:-start}"
# PostgreSQL refuses to run as root (e.g. in CI containers): run as the "postgres" system user.
AS=()
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -r -m postgres
  DATA="/tmp/pepperedapron-pg"
  AS=(runuser -u postgres --)
fi
case "$cmd" in
  start)
    if [ ! -d "$DATA" ]; then
      "${AS[@]}" "$BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
    fi
    if ! "${AS[@]}" "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      "${AS[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/server.log" -w start >/dev/null
    fi
    for db in pepperedapron pepperedapron_test; do
      psql -h 127.0.0.1 -p "$PORT" -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
        || psql -h 127.0.0.1 -p "$PORT" -U postgres -c "CREATE DATABASE $db" >/dev/null
    done
    echo "PostgreSQL ready: postgres://postgres@127.0.0.1:$PORT/pepperedapron (test DB: pepperedapron_test)"
    ;;
  stop) "${AS[@]}" "$BIN/pg_ctl" -D "$DATA" stop ;;
  status) "${AS[@]}" "$BIN/pg_ctl" -D "$DATA" status ;;
  *) echo "usage: $0 [start|stop|status]"; exit 1 ;;
esac
