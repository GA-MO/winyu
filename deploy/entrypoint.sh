#!/bin/sh
set -e
if [ -z "$(ls -A "$WINYU_DATA_DIR")" ]; then
  cp -a /app/seed-data/. "$WINYU_DATA_DIR"/
  echo "entrypoint: seeded $WINYU_DATA_DIR from the demo snapshot"
fi
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "$PORT"
