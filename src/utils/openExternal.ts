/**
 * Send the guest to a page outside the mini app.
 *
 * A payment page cannot run inside the Telegram or VK web view: the bank's
 * 3-D Secure step and СБП both need a real browser, and `window.open` inside
 * Telegram's web view is silently swallowed on several clients. Telegram has
 * `openLink` for exactly this; VK and the plain web fall back to `window.open`,
 * and a blocked pop-up falls back again to navigating this tab, which always
 * works.
 */

type TelegramWebApp = {
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

export function openExternal(url: string): void {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  if (typeof tg?.openLink === 'function') {
    tg.openLink(url);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}
