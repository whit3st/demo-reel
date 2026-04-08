#!/bin/bash
set -e

# tsx is in /app/node_modules but WORKDIR is /work, so use absolute path
TSX_ESM="/app/node_modules/tsx/dist/esm/index.mjs"

case "${1:-}" in
  voice)
    shift
    exec node --import "$TSX_ESM" /app/dist/script/voice-cli.js "$@"
    ;;
  crawl)
    shift
    exec node --import "$TSX_ESM" /app/dist/script/crawl-cli.js "$@"
    ;;
  *)
    exec node --import "$TSX_ESM" /app/dist/cli.js "$@"
    ;;
esac
