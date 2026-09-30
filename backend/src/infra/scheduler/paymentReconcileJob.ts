/**
 * Сверка оплат с Робокассой.
 *
 * Уведомление об оплате приходит один раз и о возврате молчит. Возврат,
 * сделанный руками в кабинете, наша система не замечала вовсе: деньги
 * возвращались, чек в «Моём налоге» аннулировался сам, а билет у человека
 * оставался рабочим — по нему можно было пройти на концерт.
 *
 * Эта задача спрашивает Робокассу сама. Нашла возврат — гасит бронь: места
 * освобождаются, билет перестаёт действовать, администратору уходит письмо.
 *
 * Про осторожность. Действуем только на состояние, значение которого знаем
 * точно. Незнакомое записываем и зовём человека: ошибка здесь стоит либо
 * потерянного билета у честного гостя, либо прохода по возвращённому, и
 * догадки тут неуместны.
 */

import { db } from '../../db';
import { getRobokassaConfig } from '../../config/robokassa';
import { fetchOpState, meansRefunded, isKnownState, OP_STATE } from '../../domain/payments/opState';
import {
  findPaidPaymentsToReconcile,
  recordOpState,
  markPaymentRefunded,
} from '../../domain/payments/robokassa.repository';
import { notifyAdmins } from '../../services/telegramService';

let intervalHandle: NodeJS.Timeout | null = null;

/** Раз в пять минут: возврат — не та новость, ради которой стоит частить. */
const CHECK_INTERVAL_MS = 5 * 60_000;
/** За один проход, чтобы не устроить Робокассе поток запросов. */
const BATCH = 10;
/** Насколько назад смотрим. Возврат через два месяца после концерта — к человеку. */
const LOOK_BACK_DAYS = 60;

async function handleRefund(invId: number, bookingId: string): Promise<void> {
  // Пометить платёж первым: если следом что-то упадёт, повторный проход не
  // станет гасить бронь второй раз и слать второе письмо.
  const claimed = await markPaymentRefunded(invId);
  if (!claimed) return;

  const booking = await db.getBookingById(bookingId).catch(() => null);
  const wasPaid = booking?.status === 'paid';
  if (wasPaid) {
    await db.updateBookingStatus(bookingId, 'cancelled');
  }

  console.log(JSON.stringify({
    action: 'robokassa_refund_detected',
    invId, bookingId, bookingWasPaid: wasPaid,
    timestamp: new Date().toISOString(),
  }));

  await notifyAdmins(
    `💸 Возврат по счёту ${invId}\n\n`
    + `Бронь ${bookingId} ${wasPaid ? 'отменена, билет больше не действует' : `была в статусе «${booking?.status ?? 'не найдена'}», трогать не стали`}.\n`
    + 'Места освобождены. Чек в «Моём налоге» Робокасса аннулирует сама.',
  ).catch(() => {});
}

async function runOnce(): Promise<void> {
  const cfg = getRobokassaConfig();
  // В тестовом режиме опрашивать нечего: Робокасса о тестовых операциях этим
  // методом не отвечает.
  if (!cfg.enabled || cfg.isTest) return;

  const since = new Date(Date.now() - LOOK_BACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const payments = await findPaidPaymentsToReconcile(since, BATCH);
  if (payments.length === 0) return;

  for (const payment of payments) {
    const state = await fetchOpState(cfg, payment.invId);
    // Не ответили — не беда, вернёмся через пять минут.
    if (!state) continue;

    await recordOpState(payment.invId, state).catch((err) => {
      console.error('[PaymentReconcile] не смог записать состояние', payment.invId, err);
    });

    if (meansRefunded(state.stateCode)) {
      await handleRefund(payment.invId, payment.bookingId).catch((err) => {
        console.error('[PaymentReconcile] ошибка при гашении', payment.invId, err);
      });
      continue;
    }

    // Оплата на месте — обычный случай, молчим.
    if (state.stateCode === OP_STATE.PAID || state.stateCode === OP_STATE.CREDITING) continue;

    // Всё остальное: бронь оплачена у нас, а Робокасса говорит иное. Ничего не
    // трогаем, но человек должен об этом узнать.
    console.warn(JSON.stringify({
      action: 'robokassa_state_mismatch',
      invId: payment.invId, bookingId: payment.bookingId,
      stateCode: state.stateCode, known: isKnownState(state.stateCode),
    }));
    await notifyAdmins(
      `⚠️ Счёт ${payment.invId}: у нас оплачен, у Робокассы состояние ${state.stateCode ?? 'неизвестно'}\n\n`
      + `Бронь ${payment.bookingId}. Ничего не меняли — проверьте руками.`,
    ).catch(() => {});
  }
}

export function startPaymentReconcileJob(): void {
  if (intervalHandle !== null) {
    console.warn('[PaymentReconcile] Job already started, skipping');
    return;
  }
  console.log(`[PaymentReconcile] Starting (interval: ${CHECK_INTERVAL_MS / 60000}m)`);

  intervalHandle = setInterval(() => {
    runOnce().catch((err) => {
      // Никогда не роняем приложение: это сверка, а не основная операция.
      console.error('[PaymentReconcile] Error during execution:', err);
    });
  }, CHECK_INTERVAL_MS);

  if (intervalHandle.unref) intervalHandle.unref();

  // Первый проход вскоре после старта, не дожидаясь пяти минут.
  const first = setTimeout(() => {
    runOnce().catch((err) => console.error('[PaymentReconcile] first run:', err));
  }, 30_000);
  if (first.unref) first.unref();
}

export function stopPaymentReconcileJob(): void {
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  console.log('[PaymentReconcile] Stopped');
}
