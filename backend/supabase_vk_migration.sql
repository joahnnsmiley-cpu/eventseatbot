-- Migration Script: Add VK Mini App Support

-- 1. `users` table does not exist in this project; user info is stored directly in `bookings`.

-- 2. Add `platform` and `user_vk_id` to `bookings` table (if we want to store it directly on the booking)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform text DEFAULT 'telegram';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_vk_id bigint;

-- Add comments for documentation
COMMENT ON COLUMN bookings.platform IS 'Platform the booking was made from: telegram or vk';
COMMENT ON COLUMN bookings.user_vk_id IS 'VKontakte user ID who made the booking, if applicable';
