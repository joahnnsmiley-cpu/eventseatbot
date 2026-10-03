#!/bin/bash
# Nightly dump of every database + off-box copy to S3. Run from cron:
#
#   0 20 * * * /opt/data/scripts/backup.sh >> /var/log/data-backup.log 2>&1
#
# (20:00 UTC is 03:00 in Novosibirsk.)
#
# Two rules, same as in the Лила build this grew from:
#   1. A backup on the same disk as the database is not a backup — the copy
#      to S3 is the point, the local files are only a convenience.
#   2. A backup nobody has restored is a belief. See restore-drill.sh.
#
# A non-zero exit is what makes a failure visible. Never `|| true` in here.
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/data}"
REMOTE="${REMOTE:-s3:nnk-data-backups}"
DATABASES="${DATABASES:-tickets leelah murashki}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-30}"
# Objects of the tickets Storage API; its index is inside the tickets dump.
STORAGE_VOLUME="${STORAGE_VOLUME:-/var/lib/docker/volumes/data_storage-tickets/_data}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
log() { echo "[$(date -u +%FT%TZ)] $*"; }

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

for db in $DATABASES; do
    out="${BACKUP_DIR}/${db}-${STAMP}.sql.gz"
    # --clean --if-exists so the dump restores over a non-empty database.
    docker compose exec -T db \
        pg_dump -U postgres --clean --if-exists --no-owner "$db" \
        | gzip -9 > "$out"
    size=$(stat -c %s "$out")
    # An empty database still dumps to ~480 bytes of preamble; a dead pg_dump
    # leaves only the 20-byte gzip header.
    if [ "$size" -lt 200 ]; then
        echo "FATAL: ${db} dump is only ${size} bytes — treating as failure" >&2
        rm -f "$out"
        exit 1
    fi
    log "dumped ${db}: ${size} bytes"
    rclone copy "$out" "${REMOTE}/db/${db}/"
done
log "dumps copied to ${REMOTE}/db/"

# Files change rarely and never in place, so a sync is cheap after the first run.
rclone sync "$STORAGE_VOLUME" "${REMOTE}/storage-tickets/"
log "storage files synced: $(rclone size "${REMOTE}/storage-tickets/" | tr '\n' ' ')"

find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+${KEEP_LOCAL_DAYS}" -delete
rclone delete "${REMOTE}/db/" --min-age "${KEEP_REMOTE_DAYS}d"
log "done"
