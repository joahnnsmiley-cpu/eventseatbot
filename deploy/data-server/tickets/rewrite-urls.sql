-- Some rows store the full public URL of a file rather than its path, so after
-- a copy they still point at the old Supabase host. Run after copy-data.sh:
--
--   docker compose exec -T db psql -U postgres -d tickets -v ON_ERROR_STOP=1 \
--     -v old=https://<ref>.supabase.co -v new=https://db.niktonekruche.ru < rewrite-urls.sql
--
-- Columns found by scanning the live data on 2026-10-03; no JSON column
-- carried the old host.
BEGIN;
UPDATE public.events   SET image_url           = replace(image_url,           :'old', :'new') WHERE image_url           LIKE :'old' || '%';
UPDATE public.events   SET layout_image_url    = replace(layout_image_url,    :'old', :'new') WHERE layout_image_url    LIKE :'old' || '%';
UPDATE public.events   SET ticket_template_url = replace(ticket_template_url, :'old', :'new') WHERE ticket_template_url LIKE :'old' || '%';
UPDATE public.bookings SET ticket_file_url     = replace(ticket_file_url,     :'old', :'new') WHERE ticket_file_url     LIKE :'old' || '%';
COMMIT;
