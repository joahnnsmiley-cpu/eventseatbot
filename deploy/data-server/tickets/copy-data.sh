#!/bin/bash
# Copy every row of the tickets database from Supabase Cloud into the local
# `tickets` database. Reads only from the source; REPLACES the local rows.
# Safe to re-run — that is how the final copy before switch-over is made.
#
# Run on the data server, from /opt/data, with the SOURCE credentials in the
# environment (they are not stored here):
#
#   OLD_URL=https://<ref>.supabase.co OLD_KEY=<service_role key> tickets/copy-data.sh
#
# Rows travel as the raw JSON text PostgREST returned and are typed by
# jsonb_populate_recordset on the way in, so numerics, bigints, arrays and
# timestamps are never reparsed by anything in between.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${OLD_URL:?}" "${OLD_KEY:?}"

# Parents before children, for the foreign keys.
TABLES="events event_tables bookings payments app_users admins controllers organizers team_invites venues layout_changes"
PAGE=1000

psql() { docker compose exec -T db psql -U postgres -d tickets -v ON_ERROR_STOP=1 -q "$@"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for t in $TABLES; do
    offset=0
    : > "$TMP/$t.count"
    while :; do
        f="$TMP/$t.$offset.json"
        curl -fsS "$OLD_URL/rest/v1/$t?select=*&limit=$PAGE&offset=$offset" \
            -H "apikey: $OLD_KEY" -H "Authorization: Bearer $OLD_KEY" -o "$f"
        n="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1], encoding="utf-8"))))' "$f")"
        echo "$n" >> "$TMP/$t.count"
        [ "$n" -lt "$PAGE" ] && break
        offset=$((offset + PAGE))
    done
done

{
    echo "BEGIN;"
    echo "TRUNCATE $(echo $TABLES | sed 's/ /, /g');"
    for t in $TABLES; do
        for f in "$TMP/$t".*.json; do
            echo "\\set j \`cat /tmp/copy/$(basename "$f")\`"
            echo "INSERT INTO public.$t SELECT * FROM jsonb_populate_recordset(null::public.$t, :'j'::jsonb);"
        done
    done
    echo "SELECT setval(pg_get_serial_sequence('public.payments','inv_id'), coalesce((SELECT max(inv_id) FROM public.payments), 1));"
    echo "COMMIT;"
} > "$TMP/load.sql"

CID="$(docker compose ps -q db)"
docker exec "$CID" rm -rf /tmp/copy
docker cp -q "$TMP" "$CID:/tmp/copy"
docker exec "$CID" chmod -R a+rX /tmp/copy
psql -f /tmp/copy/load.sql
docker exec "$CID" rm -rf /tmp/copy

for t in $TABLES; do
    src="$(awk '{s+=$1} END {print s+0}' "$TMP/$t.count")"
    dst="$(psql -Atc "select count(*) from public.$t")"
    printf '%-16s source=%-5s local=%-5s %s\n' "$t" "$src" "$dst" "$([ "$src" = "$dst" ] && echo ok || echo MISMATCH)"
done
