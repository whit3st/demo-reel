#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="${TLA_JAR:-$ROOT/.tla/tla2tools.jar}"
SHA256="df7cef5d37bcca879817424c001696e07fd094d68a72690449af3045fd972469"
URL="https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"

if [ ! -f "$JAR" ]; then
  mkdir -p "$(dirname "$JAR")"
  echo "Downloading pinned tla2tools.jar"
  curl -fsSL -o "$JAR" "$URL"
fi

echo "$SHA256  $JAR" | sha256sum -c -

LOG_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$LOG_DIR" "$ROOT/formal/states" "$ROOT/formal"/*_TTrace_*
}
trap cleanup EXIT

cd "$ROOT/formal"

echo "==> TLC fixed model"
java -jar "$JAR" -cleanup -config ChatterboxWorker_Fixed.cfg ChatterboxWorker.tla

echo "==> TLC buggy model (must fail)"
set +e
java -jar "$JAR" -cleanup -config ChatterboxWorker_BuggyCleanExit.cfg ChatterboxWorker.tla \
  >"$LOG_DIR/buggy.log" 2>&1
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  echo "Buggy config passed TLC; the negative model is vacuous." >&2
  exit 1
fi

if ! grep -q "NoDeadWorkerWithPending" "$LOG_DIR/buggy.log"; then
  echo "Buggy config failed, but not for the intended invariant:" >&2
  cat "$LOG_DIR/buggy.log" >&2
  exit 1
fi

echo "Buggy config failed for the intended reason (NoDeadWorkerWithPending)."
