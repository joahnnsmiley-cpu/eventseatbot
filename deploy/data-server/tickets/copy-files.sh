#!/bin/bash
# Runs copy-files.py on the compose network, where the Storage API is reachable
# without going out through Caddy. Source credentials come from the
# environment and are not stored here:
#
#   OLD_URL=https://<ref>.supabase.co OLD_KEY=<service_role key> tickets/copy-files.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${OLD_URL:?}" "${OLD_KEY:?}"
NEW_KEY="$(grep '^TICKETS_SERVICE_KEY=' .env | cut -d= -f2-)"

docker run --rm --network data_default \
    -e OLD_URL -e OLD_KEY -e NEW_URL=http://storage-tickets:5000 -e NEW_KEY="$NEW_KEY" \
    -v "$PWD/tickets/copy-files.py:/copy-files.py:ro" \
    python:3.13-alpine python /copy-files.py
