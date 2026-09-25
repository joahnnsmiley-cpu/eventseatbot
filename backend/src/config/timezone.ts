/**
 * The offset an event falls back to when nobody set one.
 *
 * Every concert so far is in Novosibirsk, UTC+7. The old fallback was 180
 * (UTC+3, Moscow), which quietly shifted a Novosibirsk evening by four hours
 * in countdowns, "already started" checks and ticket validity windows.
 *
 * This is a fallback, not a policy: an event that carries its own
 * timezoneOffsetMinutes always wins.
 */
export const DEFAULT_TZ_OFFSET_MINUTES = 420;
