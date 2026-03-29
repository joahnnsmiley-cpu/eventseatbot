-- Migration: Create controllers table for ticket validators
-- Controllers are users who can scan and validate tickets at event entry.
-- Managed by admins via the admin panel.

CREATE TABLE IF NOT EXISTS controllers (
  id         BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform   TEXT NOT NULL DEFAULT 'telegram',
  label      TEXT
);
