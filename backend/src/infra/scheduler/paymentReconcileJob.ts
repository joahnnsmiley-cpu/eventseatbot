/**
 * Сверка оплат с Робокассой.
 *
 * ВАЖНО, и это выяснено опытом, а не из справочника: **возврат, сделанный
 * руками в кабинете Робокассы, этой сверкой не обнаруживается**. Проверено на
 * настоящем возвращённом платеже — OpStateExt продолжает отвечать состоянием
 * 100 «оплата прошла», ровно как по невозвращённому соседу. Уведомления о
 * возврате у Робокассы тоже нет: на странице оповещений только ResultURL и
 * ResultUrl2, и оба про оплату.
 *
 * Отсюда правило, которое важнее кода: **возвраты делать из нашей админки, а
 * не из кабинета Робокассы.** Тогда возврат запрашиваем мы, знаем его номер
 * заявки и узнаём об исполнении. Возврат из кабинета останется невидимым, и
 * бронь придётся гасить вручную.
 *
 * Зачем тогда эта задача. Во-первых, она забирает и хранит OpKey — без него
 * нельзя запросить возврат через их API, а в уведомлении об оплате его нет.
 * Во-вторых, ловит расхождения: если у нас оплачено, а Робокасса говорит
 * «отменено» или «деньги возвращены покупателю» — такое она показывает, когда
 * операция не дошла до зачисления, — мы об этом узнаем и погасим бронь.
 *
 * Про осторожность. Действуем только на состояние, значение которого знаем
 * точно. Незнакомое записываем и зовём человека: ошибка здесь стоит либо
 * потерянного билета у честного гостя, либо прохода по возвращённому.
 */

import { db } from '../../db';
import { getProductionCredentials } from '../../config/robokassa';
import { fetchOpState, meansRefunded, isKnownState, OP_STATE } from '../../domain/payments/opState';
import {
  findPaidPaymentsToReconcile,
  findPendingRefunds,
  recordOpState,
  recordRefundState,
  markPaymentRefunded,
} from '../../domain/payments/robokassa.repository';
import { fetchRefundState } from '../../domain/payments/refund';
import { notifyAdmins } from '../../services/telegramService';

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Что сверка делала в последний раз.
 *
 * Видно в /health. Без этого задача, которая молча ничего не находит,
 * неотличима от задачи, которая молча падает: логи Render читает только
 * владелец, а понять «работает ли вообще» надо быстро.
 */
let lastRun: {
  at: string | null;
  candidates: number;
  answered: number;
  refunded: number;
  reason: string | null;
} = { at: null, candidates: 0, answered: 0, refunded: 0, reason: 'ещё не запускалась' };

export function reconcileStatus() {
  return { ...lastRun };
}

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

/**
 * Чем кончились поданные нами заявки на возврат.
 *
 * Возврат у Робокассы не мгновенный, а уведомления о его исполнении нет —
 * только опрос по номеру заявки. Пока деньги не вернулись, бронь не трогаем:
 * погасить её раньше значило бы отнять билет у человека, которому деньги могут
 * и не прийти.
 */
async function checkPendingRefunds(): Promise<number> {
  let settled = 0;
  const pending = await findPendingRefunds(BATCH).catch(() => []);

  for (const payment of pending) {
    if (!payment.refundRequestId) continue;
    const state = await fetchRefundState(payment.refundRequestId);
    // Не ответили — спросим через пять минут.
    if (!state) continue;
    if (state.state === 'processing') continue;

    await recordRefundState(payment.invId, state.state).catch((err) => {
      console.error('[PaymentReconcile] не смог записать исход возврата', payment.invId, err);
    });

    if (state.state === 'finished') {
      settled += 1;
      await handleRefund(payment.invId, payment.bookingId).catch((err) => {
        console.error('[PaymentReconcile] ошибка при гашении после возврата', payment.invId, err);
      });
      continue;
    }

    // canceled: заявку отменили в кабинете. Деньги остались у нас, бронь
    // трогать не нужно — но человек должен знать, что возврат не состоялся.
    console.warn(JSON.stringify({
      action: 'robokassa_refund_canceled', invId: payment.invId, bookingId: payment.bookingId,
    }));
    await notifyAdmins(
      `↩️ Возврат по счёту ${payment.invId} отменён

`
      + `Деньги остались у нас, бронь ${payment.bookingId} не трогали.`,
    ).catch(() => {});
  }
  return settled;
}

async function runOnce(): Promise<void> {
  lastRun = { at: new Date().toISOString(), candidates: 0, answered: 0, refunded: 0, reason: null };

  /**
   * Сверяем боевые платежи всегда, даже если магазин сейчас в тестовом режиме.
   *
   * Здесь была ошибка замысла: я привязал сверку к текущему режиму магазина, а
   * надо к тому, каким был сам платёж. Настоящая оплата остаётся настоящей, и
   * возврат по ней может случиться когда угодно — в том числе после того, как
   * магазин переключили обратно в тест. Выборка и так берёт только боевые
   * платежи, а подпись считаем боевым Паролем #2.
   */
  // Сначала заявки, которые подали мы: это единственный возврат, о котором мы
  // вообще можем узнать.
  lastRun.refunded += await checkPendingRefunds().catch(() => 0);

  const creds = getProductionCredentials();
  if (!creds) { lastRun.reason = 'нет боевых реквизитов'; return; }

  const since = new Date(Date.now() - LOOK_BACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let payments;
  try {
    payments = await findPaidPaymentsToReconcile(since, BATCH);
  } catch (err) {
    lastRun.reason = 'выборка не удалась: ' + (err instanceof Error ? err.message : String(err)).slice(0, 120);
    return;
  }
  lastRun.candidates = payments.length;
  if (payments.length === 0) { lastRun.reason = 'нечего сверять'; return; }

  for (const payment of payments) {
    const state = await fetchOpState(creds, payment.invId);
    // Не ответили — не беда, вернёмся через пять минут.
    if (!state) { lastRun.reason = 'Робокасса не ответила'; continue; }
    lastRun.answered += 1;

    await recordOpState(payment.invId, state).catch((err) => {
      console.error('[PaymentReconcile] не смог записать состояние', payment.invId, err);
    });

    if (meansRefunded(state.stateCode)) {
      lastRun.refunded += 1;
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
