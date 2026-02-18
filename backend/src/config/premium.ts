/**
 * Premium user greeting messages.
 * PREMIUM_IDS from ENV: comma-separated Telegram IDs (e.g. "123456789,987654321").
 * Keys in PREMIUM_MESSAGES must match Telegram IDs (as string).
 */
const PREMIUM_IDS = new Set(
  (process.env.PREMIUM_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

const PREMIUM_MESSAGES: Record<string, string> = {
  // Keys must match Telegram IDs from PREMIUM_IDS (e.g. "123456789").
  // Replace the key below with the actual ID from your PREMIUM_IDS env.
  444164017: `
Дорогая Ирина!

Мы, Иван и Даша, очень рады разделить с Вами очень радостный шаг на пути к структурному проектному решению, которое было бы невозможным, если бы не соединились наши энергии, не взаимодополнились наши энтузиазмы.

В очередной раз благодарим Вас за то, что приложили руку к нашему союзу!
`.trim(),
};

export function getPremiumUserInfo(userTelegramId: string | number): {
  isPremium: boolean;
  premiumMessage?: string | null;
} {
  const id = String(userTelegramId);
  if (!PREMIUM_IDS.has(id)) {
    return { isPremium: false };
  }
  return {
    isPremium: true,
    premiumMessage: PREMIUM_MESSAGES[id] ?? null,
  };
}
