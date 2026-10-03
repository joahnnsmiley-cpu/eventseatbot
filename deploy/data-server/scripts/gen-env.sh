#!/bin/bash
# Writes .env with fresh secrets and the JWT keys derived from them.
# Run ONCE on the server, before the first `docker compose up`. Refuses to
# overwrite: regenerating secrets under a live database locks every app out.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -e .env ] && { echo ".env already exists — not touching it" >&2; exit 1; }

secret() { openssl rand -hex 32; }

# HS256 JWT carrying {"role": ...}, ten years. Same shape as a Supabase key.
jwt() {
    python3 scripts/jwt.py "$1" "$2"
}

umask 077
{
    echo "POSTGRES_PASSWORD=$(secret)"
    echo "TICKETS_STORAGE_PASSWORD=$(secret)"
    for p in LEELAH TICKETS MURASHKI; do
        s="$(secret)"
        echo "${p}_AUTHENTICATOR_PASSWORD=$(secret)"
        echo "${p}_JWT_SECRET=${s}"
        echo "${p}_ANON_KEY=$(jwt "$s" anon)"
        echo "${p}_SERVICE_KEY=$(jwt "$s" service_role)"
    done
    echo "# Hostnames for Caddy; fill in once DNS points here."
    echo "LEELAH_HOST="
    echo "TICKETS_HOST="
    echo "MURASHKI_HOST="
} > .env
echo ".env written"
