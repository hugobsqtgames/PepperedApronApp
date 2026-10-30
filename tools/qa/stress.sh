#!/usr/bin/env bash
# Full stress campaign, for the development and production variants.
#   bash tools/qa/stress.sh            (logs and summary in $QA_OUT, default /tmp/pepperedapron-qa)
# Variant-independent suites (core logic, local database, sync) run once; the app's own tests
# and the native configuration run once per variant.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${QA_OUT:-/tmp/pepperedapron-qa}"
VARIANTS="${QA_VARIANTS:-development production}"
mkdir -p "$OUT"
rm -f "$OUT"/*.log "$OUT/status"

run() {
  local name="$1"; shift
  echo "▶ $name"
  local start=$SECONDS
  (cd "$ROOT" && "$@") >"$OUT/$name.log" 2>&1
  local code=$?
  echo "$name $code $((SECONDS - start))" >>"$OUT/status"
  [ $code -eq 0 ] && echo "  ok ($((SECONDS - start)) s)" || echo "  ÉCHEC ($code) — voir $OUT/$name.log"
}

run core env STRESS=1 pnpm --filter @pepperedapron/core exec vitest run --silent=false
run client env STRESS=1 FUZZ_SCENARIOS=300 pnpm --filter @pepperedapron/client exec vitest run --silent=false
run site pnpm --filter @pepperedapron/site test
for v in $VARIANTS; do
  run "native-$v" env APP_VARIANT="$v" node tools/qa/native-check.mjs
  run "mobile-$v" env APP_VARIANT="$v" STRESS=1 MONKEY_PRESSES=200 NODE_OPTIONS=--expose-gc \
    pnpm --filter @pepperedapron/mobile exec jest --testTimeout=3600000
done

node "$ROOT/tools/qa/summary.mjs" "$OUT" | tee "$OUT/summary.md"
! grep -qv " 0 " "$OUT/status"
