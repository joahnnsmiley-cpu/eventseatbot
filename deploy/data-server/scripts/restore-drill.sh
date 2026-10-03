#!/bin/bash
# Proof that the backups in S3 actually restore. Downloads the newest dump of
# each database from S3 — not the local copy — loads it into a throwaway
# Postgres and counts what is inside. Never touches the live database.
#
#   0 21 1 * * /opt/data/scripts/restore-drill.sh >> /var/log/data-backup.log 2>&1
set -euo pipefail

REMOTE="${REMOTE:-s3:nnk-data-backups}"
DATABASES="${DATABASES:-tickets leelah murashki}"
CONTAINER="data-restore-drill"
TMP="$(mktemp -d)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD="drill-$(date +%s)" \
    pgvector/pgvector:0.8.7-pg17-trixie >/dev/null
for _ in $(seq 1 30); do
    docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 2
done

# The roles have to exist before the GRANTs in the dumps are replayed.
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres <<'SQL'
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
SQL

for db in $DATABASES; do
    latest="$(rclone lsf "${REMOTE}/db/${db}/" | sort | tail -1)"
    [ -n "$latest" ] || { echo "FATAL: no dump of ${db} in ${REMOTE}" >&2; exit 1; }
    rclone copy "${REMOTE}/db/${db}/${latest}" "$TMP/"
    docker exec "$CONTAINER" psql -q -U postgres -c "CREATE DATABASE ${db}"
    gunzip -c "$TMP/$latest" | docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -U postgres "$db" >/dev/null
    echo "--- ${db}: ${latest}"
    docker exec -i "$CONTAINER" psql -U postgres -At -F' | ' "$db" <<'SQL'
SELECT schemaname || '.' || relname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text || ' rows'
FROM pg_stat_user_tables
WHERE schemaname IN ('public', 'storage')
ORDER BY 1;
SQL
done

echo "--- drill passed ---"
