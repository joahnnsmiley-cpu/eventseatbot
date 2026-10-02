/**
 * Возврат денег через API Робокассы.
 *
 * Почему это вообще понадобилось, хотя вернуть можно и руками в кабинете:
 * возврат из кабинета наша система не видит. Проверено на настоящем
 * возвращённом платеже — состояние операции остаётся «оплата прошла», а
 * уведомления о возврате у Робокассы нет. Значит билет у человека продолжает
 * работать, и это заметит только контролёр на входе, если заметит.
 *
 * Когда возврат запрашиваем мы, мы знаем номер заявки и можем спросить, чем
 * дело кончилось. Поэтому правило простое: **возвраты делаются отсюда**.
 *
 * Фискальную часть Робокасса берёт на себя: при возврате по счёту №19,
 * сделанном в кабинете, чек в «Моём налоге» аннулировался сам. Поэтому состав
 * чека (InvoiceItems) не передаём — он нужен для чека возврата по 54-ФЗ, а у
 * нас НПД, где исходный чек аннулируют, а не выписывают встречный. Запрос без
 * состава повторяет ровно то, что уже сработало руками.
 */

import jwt from 'jsonwebtoken';

const CREATE_URL = 'https://services.robokassa.ru/RefundService/Refund/Create';
const STATE_URL = 'https://services.robokassa.ru/RefundService/Refund/GetState';
const TIMEOUT_MS = 15_000;

/** Состояния заявки на возврат, как их называет Робокасса. */
export type RefundState = 'processing' | 'finished' | 'canceled';

export type RefundRequest =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

/**
 * Запросить возврат по операции.
 *
 * @param opKey идентификатор операции: приходит из OpStateExt, в уведомлении
 *              об оплате его нет.
 * @param sum   для частичного возврата. Полный — не передавать вовсе.
 */
export async function requestRefund(
  password3: string,
  opKey: string,
  sum?: number,
): Promise<RefundRequest> {
  if (!password3) return { ok: false, error: 'Пароль #3 не задан' };
  if (!opKey) return { ok: false, error: 'Нет идентификатора операции (OpKey)' };

  // Полезная нагрузка подписывается Паролем #3 — не тем, которым подписываются
  // платежи, и не тем, которым проверяются уведомления.
  const payload: Record<string, unknown> = { OpKey: opKey };
  if (typeof sum === 'number' && sum > 0) payload.RefundSum = sum;

  let token: string;
  try {
    token = jwt.sign(payload, password3, { algorithm: 'HS256', noTimestamp: true });
  } catch (err) {
    return { ok: false, error: `не удалось подписать запрос: ${err instanceof Error ? err.message : err}` };
  }

  try {
    const res = await fetch(CREATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let body: { success?: boolean; message?: string; requestId?: string };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return { ok: false, error: `непонятный ответ (${res.status}): ${text.slice(0, 200)}` };
    }
    if (body.success && body.requestId) return { ok: true, requestId: body.requestId };
    return { ok: false, error: body.message || `отказ без объяснения (${res.status})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Чем кончилась заявка.
 *
 * null означает «не знаем»: сеть подвела или ответ непонятен. Это не то же
 * самое, что «возврат не прошёл», и путать их нельзя — на «не знаем» мы просто
 * спросим ещё раз позже.
 */
export async function fetchRefundState(
  requestId: string,
): Promise<{ state: RefundState; amount: number | null } | null> {
  if (!requestId) return null;
  try {
    const res = await fetch(`${STATE_URL}?id=${encodeURIComponent(requestId)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { label?: string; amount?: number; message?: string };
    const label = String(body.label ?? '');
    if (label !== 'processing' && label !== 'finished' && label !== 'canceled') return null;
    return { state: label, amount: typeof body.amount === 'number' ? body.amount : null };
  } catch {
    return null;
  }
}
