/**
 * Оплата, не выходя из мини-аппа.
 *
 * Робокасса умеет показывать свою платёжную форму во фрейме поверх нашей
 * страницы. Это лучше редиректа: гость не уходит в браузер и не возвращается
 * обратно по ссылке «вернуться в Telegram», которую половина людей не нажимает.
 *
 * Но фрейм — не замена полной странице, а попытка. Он может не открыться:
 * скрипт Робокассы не загрузился, банк-эмитент запрещает показывать 3-D Secure
 * во фрейме, вебвью мессенджера повёл себя по-своему. Поэтому здесь всё
 * построено вокруг одного правила: если за отведённое время форма не появилась
 * — молча уходим на обычную страницу оплаты. Тупика у гостя быть не должно.
 *
 * Только карты. СБП во фрейме не работает принципиально: выбор банка ведёт на
 * deep link (sbolpay:, qr.nspk.ru), а вебвью такие ссылки не открывает — это
 * прямо написано в документации Робокассы. СБП уходит во внешний браузер.
 */

import { openExternal } from '../utils/openExternal';

const SCRIPT_URL = 'https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js';
const SCRIPT_TIMEOUT_MS = 6000;
/** Сколько ждём появления фрейма, прежде чем считать попытку неудачной. */
const FRAME_TIMEOUT_MS = 3500;

export type RobokassaFields = Record<string, string>;

type RobokassaGlobal = {
  StartPayment?: (params: Record<string, unknown>) => void;
  Render?: (params: Record<string, unknown>, containerId?: string) => void;
  /** Не описан в документации, но есть в скрипте. Используем как подсказку. */
  SetCallbacks?: (callbacks: { onComplete?: (r: { status?: string }) => void }) => void;
  ClosePaymentForm?: () => void;
};

/**
 * Идентификатор фрейма, который создаёт скрипт Робокассы.
 *
 * Проверено на их же демо: элемент называется robokassa_iframe, а атрибут src
 * у него пустой — форма приходит в него POST-ом через form target. Поэтому
 * искать фрейм «по адресу robokassa.ru» бессмысленно: такого адреса в разметке
 * не будет никогда, и каждая оплата ложно считалась бы неудачной.
 */
const FRAME_ID = 'robokassa_iframe';

function robokassa(): RobokassaGlobal | undefined {
  return (window as unknown as { Robokassa?: RobokassaGlobal }).Robokassa;
}

let scriptPromise: Promise<boolean> | null = null;

/** Скрипт грузится один раз на всё время жизни страницы — этого требует Робокасса. */
function loadScript(): Promise<boolean> {
  if (robokassa()) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const el = existing ?? document.createElement('script');
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      // Неудачу не кэшируем: связь могла пропасть на секунду.
      if (!ok) scriptPromise = null;
      resolve(ok);
    };

    const timer = window.setTimeout(() => done(false), SCRIPT_TIMEOUT_MS);
    el.addEventListener('load', () => { window.clearTimeout(timer); done(Boolean(robokassa())); });
    el.addEventListener('error', () => { window.clearTimeout(timer); done(false); });

    if (!existing) {
      el.src = SCRIPT_URL;
      el.async = true;
      document.head.appendChild(el);
    }
  });
  return scriptPromise;
}

/** Фрейм на странице и он показан — признак того, что форма действительно открылась. */
function frameIsUp(): boolean {
  const el = document.getElementById(FRAME_ID);
  return Boolean(el) && (el as HTMLElement).style.visibility !== 'hidden';
}

function waitForFrame(): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + FRAME_TIMEOUT_MS;
    const tick = () => {
      if (frameIsUp()) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      window.setTimeout(tick, 150);
    };
    tick();
  });
}

export type InAppResult = 'frame' | 'external';

/**
 * Открыть оплату: сначала пробуем фрейм, при любой заминке — обычная страница.
 *
 * Возвращает, чем дело кончилось, чтобы вызывающий экран знал, ждать ли гостя
 * обратно (external) или он остался здесь и статус надо опрашивать (frame).
 */
export async function payInApp(
  fields: RobokassaFields,
  fallbackUrl: string,
  onComplete?: () => void,
): Promise<InAppResult> {
  const goOut = (): InAppResult => { openExternal(fallbackUrl); return 'external'; };

  if (!(await loadScript())) return goOut();

  const api = robokassa();
  const start = api?.Render ?? api?.StartPayment;
  if (typeof start !== 'function') return goOut();

  // Подсказка о завершении, если скрипт её даёт. Ничему не верим на слово:
  // оплаченной бронь делает только уведомление на ResultURL, а это лишь повод
  // обновить экран сразу, не дожидаясь следующего опроса.
  try {
    api?.SetCallbacks?.({ onComplete: () => onComplete?.() });
  } catch { /* необязательная возможность */ }

  try {
    start.call(api, {
      ...fields,
      Settings: JSON.stringify({ PaymentMethods: ['BankCard'], Mode: 'modal' }),
    });
  } catch {
    return goOut();
  }

  return (await waitForFrame()) ? 'frame' : goOut();
}
