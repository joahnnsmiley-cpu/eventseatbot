/**
 * Какие способы оплаты действительно подключены магазину.
 *
 * Список задаётся не в коде, а в личном кабинете Робокассы, и угадывать его
 * нельзя: попытка предложить гостю способ, которого у магазина нет, кончается
 * либо пустой формой, либо кнопкой в никуда. Ровно так и вышло с СБП — он был
 * в примерах документации, но магазину не подключён.
 *
 * Метод GetCurrencies публичный: ему нужен только идентификатор магазина.
 */

import type { RobokassaConfig } from '../../config/robokassa';

const SERVICE_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/GetCurrencies';
/** Список меняется руками в ЛК, то есть почти никогда. */
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cache: { aliases: string[]; at: number } | null = null;

/**
 * Разбираем XML регулярным выражением намеренно.
 *
 * Ответ — плоский список элементов Currency с атрибутом Alias, и тащить ради
 * него парсер XML в зависимости незачем. Если формат когда-нибудь изменится,
 * совпадений не найдётся и мы вернём пустой список — то есть поведение станет
 * прежним, а не сломанным.
 */
function parseAliases(xml: string): string[] {
  const found = new Set<string>();
  for (const m of xml.matchAll(/Alias="([^"]+)"/g)) {
    const alias = m[1]?.trim();
    if (alias) found.add(alias);
  }
  return [...found];
}

/**
 * Способы оплаты магазина. Никогда не бросает: если Робокасса не ответила,
 * возвращаем пустой список, и вызывающая сторона показывает карту — способ,
 * который есть всегда.
 */
export async function getShopMethods(cfg: RobokassaConfig): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.aliases;
  if (!cfg.merchantLogin) return [];

  try {
    const url = `${SERVICE_URL}?MerchantLogin=${encodeURIComponent(cfg.merchantLogin)}&Language=ru`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const aliases = parseAliases(await res.text());
    if (aliases.length === 0) throw new Error('пустой список способов');

    cache = { aliases, at: Date.now() };
    console.log(JSON.stringify({ action: 'robokassa_methods', aliases }));
    return aliases;
  } catch (err) {
    console.warn('[robokassa methods]', err instanceof Error ? err.message : err);
    // Старый список лучше пустого: способы не исчезают от одной неудачной сети.
    return cache?.aliases ?? [];
  }
}
