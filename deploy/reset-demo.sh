#!/bin/sh
set -e
cd "$(dirname "$0")"
docker compose stop app
docker compose run --rm --no-deps --entrypoint sh app -c 'find /data -mindepth 1 -delete'
docker compose up -d app
echo "reset-demo: /data emptied, the app reseeds it from the image snapshot on start"
