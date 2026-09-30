/**
 * Состояние операции на стороне Робокассы.
 *
 * Уведомление об оплате приходит один раз и о возврате не говорит ничего.
 * Возврат, сделанный руками в кабинете, наша система не замечала вовсе: деньги
 * возвращались, чек в «Моём налоге» аннулировался сам, а билет у человека
 * оставался рабочим. Спросить состояние можно только самим — этим методом.
 *
 * Подпись здесь считается Паролем #2, тем же, которым проверяются уведомления.
 * Пароль #3 и их API возвратов для этого не нужны: мы не возвращаем деньги, мы
 * лишь узнаём, что их вернули.
 */

import crypto from 'crypto';
import type { HashAlgorithm } from '../../config/robokassa';

const SERVICE_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt';
const TIMEOUT_MS = 8000;

/**
 * Состояния операции из документации Робокассы.
 *
 * Здесь только те, в которых мы уверены. Любое другое значение — повод
 * записать его и позвать человека, а не додумывать: ошибка в эту сторону
 * стоит либо потерянного билета у честного гостя, либо прохода по
 * возвращённому.
 */
export const OP_STATE = {
  /** Операция начата, оплата не подтверждена. */
  INITIALIZED: 5,
  /** Отменена, деньги не получены. */
  CANCELLED: 10,
  /** Холдирование. */
  HOLD: 20,
  /** Деньги получены, идёт зачисление магазину. */
  CREDITING: 50,
  /** Отказ в зачислении — деньги возвращены покупателю. */
  RETURNED: 60,
  /** Исполнение приостановлено. */
  SUSPENDED: 80,
  /** Платёж прошёл, деньги зачислены. */
  PAID: 100,
} as const;

export type OpState = {
  /** Код ответа сервиса: 0 — запрос обработан. */
  resultCode: number;
  /** Состояние операции, если сервис его вернул. */
  stateCode: number | null;
  /** Идентификатор операции — он нужен, чтобы запросить возврат через их API. */
  opKey: string | null;
  /** Сырой ответ, обрезанный: по нему разбирают незнакомое состояние. */
  raw: string;
};

/** Достать значение одного тега. Ответ плоский, полноценный разбор XML тут лишний. */
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m?.[1]?.trim() || null;
}

/**
 * Спросить Робокассу о состоянии счёта.
 *
 * Возвращает null, если спросить не удалось: сеть, таймаут, невнятный ответ.
 * Молчание тут лучше догадки — вызывающая сторона просто попробует позже.
 *
 * Тестовые платежи этим методом не опрашиваются: Робокасса о них не отвечает,
 * о чём прямо сказано в их документации.
 */
export async function fetchOpState(
  creds: { merchantLogin: string; password2: string; hash: HashAlgorithm },
  invId: number,
): Promise<OpState | null> {
  if (!creds.merchantLogin || !creds.password2) return null;

  const signature = crypto
    .createHash(creds.hash)
    .update(`${creds.merchantLogin}:${invId}:${creds.password2}`, 'utf8')
    .digest('hex');

  const url = `${SERVICE_URL}?MerchantLogin=${encodeURIComponent(creds.merchantLogin)}`
    + `&InvoiceID=${invId}&Signature=${signature}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const xml = await res.text();

    // Result.Code идёт первым и относится к самому запросу; State.Code — к
    // операции. Берём оба: запрос может быть обработан успешно, а операции
    // при этом не существовать.
    const resultCode = Number(tag(xml, 'Code') ?? NaN);
    if (!Number.isFinite(resultCode)) return null;

    // Второй <Code> в ответе — это State.Code.
    const codes = [...xml.matchAll(/<Code>([^<]*)<\/Code>/g)].map((m) => Number(m[1]));
    const stateCode = codes.length > 1 && Number.isFinite(codes[1]!) ? codes[1]! : null;

    return {
      resultCode,
      stateCode,
      opKey: tag(xml, 'OpKey'),
      raw: xml.replace(/\s+/g, ' ').slice(0, 1000),
    };
  } catch {
    return null;
  }
}

/** Вернули ли деньги покупателю. */
export function meansRefunded(stateCode: number | null): boolean {
  return stateCode === OP_STATE.RETURNED;
}

/** Известное ли это состояние. Незнакомое разбирает человек, а не код. */
export function isKnownState(stateCode: number | null): boolean {
  if (stateCode === null) return false;
  return (Object.values(OP_STATE) as number[]).includes(stateCode);
}
