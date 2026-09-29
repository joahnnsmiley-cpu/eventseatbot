/**
 * Добор билетов, которые не доехали.
 *
 * Выдача билета устроена как fire-and-forget: confirmBookingPaid дожидается
 * записи в базу, а генерацию картинки запускает и не ждёт — иначе уведомление
 * от эквайринга висело бы лишние секунды, а Робокасса ждёт быстрый ответ.
 * Плата за это в том, что работа живёт только пока жив процесс. Деплой,
 * перезапуск или падение в неудачную секунду — и бронь оплачена, а билета нет.
 *
 * Первая же оплата через эквайринг так и прошла: бронь в paid, файла в
 * хранилище нет, а в логе на этой минуте — передеплой.
 *
 * Задача раз в две минуты добирает такие брони. Только свежие, за сутки:
 * автоматически чинить провалы месячной давности смысла нет, про них есть
 * отдельное уведомление администратору.
 */

import { db } from '../../db';
import { deliverTicket } from '../../domain/bookings/confirmPayment';

let intervalHandle: NodeJS.Timeout | null = null;

const CHECK_INTERVAL_MS = 120_000;
/** Насколько назад смотрим. Сутки — с запасом на ночной перезапуск. */
const LOOK_BACK_MS = 24 * 60 * 60 * 1000;
/** За один проход, чтобы не занять процесс надолго генерацией картинок. */
const BATCH = 5;

async function runOnce(): Promise<void> {
  const since = new Date(Date.now() - LOOK_BACK_MS).toISOString();
  const pending = await db.findPaidBookingsWithoutTicket(since, BATCH);
  if (pending.length === 0) return;

  console.log(JSON.stringify({
    action: 'ticket_retry_found',
    count: pending.length,
    bookingIds: pending.map((b) => b.id),
  }));

  // Последовательно: генерация разворачивает шаблон в памяти, и пять таких
  // одновременно на маленьком инстансе — верный способ получить нехватку
  // памяти вместо билетов.
  for (const booking of pending) {
    await deliverTicket(booking);
  }
}

export function startTicketRetryJob(): void {
  if (intervalHandle !== null) {
    console.warn('[TicketRetryJob] Job already started, skipping');
    return;
  }

  console.log('[TicketRetryJob] Starting (interval: 120s)');

  intervalHandle = setInterval(() => {
    runOnce().catch((err) => {
      // Никогда не роняем приложение: это подметание, а не основная операция.
      console.error('[TicketRetryJob] Error during execution:', err);
    });
  }, CHECK_INTERVAL_MS);

  if (intervalHandle.unref) intervalHandle.unref();
}

export function stopTicketRetryJob(): void {
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  console.log('[TicketRetryJob] Stopped');
}
