# Backend environment variables

## Required for core

- `PORT` — Server port (default: 4000)
- `BOT_TOKEN` — Telegram bot token (optional; bot disabled if missing)
- `API_BASE_URL` — Public API base URL (e.g. `https://your-app.onrender.com`)
- `WEBAPP_URL` — Telegram Web App URL (default: `{API_BASE_URL}/public/view`)
- `JWT_SECRET` — Secret for admin JWT signing
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_ID` — Optional; Telegram notifiers

## Storage

- **Current:** `data.json` in the backend directory (ephemeral on Render).
- **Future production storage:** Supabase. When migrating, set:
  - `SUPABASE_URL` — Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only; bypasses RLS)

The Supabase client is bootstrapped but **not used** for reads/writes yet. All data still comes from `data.json`.
