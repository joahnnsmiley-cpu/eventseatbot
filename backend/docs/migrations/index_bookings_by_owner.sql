-- Indexes for the targeted booking queries that replaced the full table scans.
-- Applied to wusmsvtciztfkynaufko on 2026-09-12. Adds indexes only.

-- The profile screens look bookings up by their owner. Telegram and VK ids live
-- in separate columns and the lookup ORs across both, so each needs its own
-- index. Partial: most rows have one of the two and NULL in the other.
CREATE INDEX IF NOT EXISTS idx_bookings_user_telegram_id
  ON bookings (user_telegram_id) WHERE user_telegram_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_user_vk_id
  ON bookings (user_vk_id) WHERE user_vk_id IS NOT NULL;

-- getBookedSeatsByEvents and the organizer counts both filter event + status.
CREATE INDEX IF NOT EXISTS idx_bookings_event_status
  ON bookings (event_id, status);
