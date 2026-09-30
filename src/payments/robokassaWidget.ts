/**
 * Оплата, не выходя из мини-аппа: карта формой поверх страницы, СБП — сразу в
 * приложение банка.
 *
 * Фрейм лучше редиректа: гость не уходит в браузер и не возвращается обратно по
 * ссылке «вернуться в Telegram», которую половина людей не нажимает. Но фрейм —
 * попытка, а не замена. Он может не открыться: не загрузился скрипт, банк
 * запрещает показывать 3-D Secure во фрейме, вебвью повёл себя по-своему.
 * Поэтому здесь одно правило: если за отведённое время не получилось — молча
 * уходим на обычную страницу оплаты. Тупика у гостя быть не должно.
 *
 * Во фрейме только карты. СБП там не работает принципиально: выбор банка ведёт
 * на deep link (sbolpay:, qr.nspk.ru), а вебвью такие ссылки не открывает — об
 * этом прямо написано в документации Робокассы. СБП уходит наружу.
 */

import { openExternal } from '../utils/openExternal';

const IFRAME_SRC = 'https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js';
const BADGE_SRC = 'https://auth.robokassa.ru/merchant/bundle/robokassa-iframe-badge.js';

const SCRIPT_TIMEOUT_MS = 6000;
/** Сколько ждём появления формы, прежде чем считать попытку неудачной. */
const FRAME_TIMEOUT_MS = 3500;
/** Сколько ждём ссылку СБП: её выдаёт запрос к Робокассе, а не локальный код. */
const LINK_TIMEOUT_MS = 12000;

/**
 * Идентификатор фрейма, который создаёт скрипт Робокассы.
 *
 * Проверено на их демо: элемент называется robokassa_iframe, а атрибут src у
 * него пустой — форма приходит в него POST-ом через form target. Искать фрейм
 * «по адресу robokassa.ru» бессмысленно: такого адреса в разметке не будет
 * никогда, и каждая оплата ложно считалась бы неудачной.
 */
const FRAME_ID = 'robokassa_iframe';

export type RobokassaFields = Record<string, string>;

/** Поля для Robokassa.pay.startOp — их целиком считает и присылает сервер. */
export type SbpOp = {
  merchantLogin: string;
  outSum: string;
  invId: number;
  email: string;
  paymentMethod: 'SBP';
  signature: string;
  receipt?: string;
};

type RobokassaGlobal = {
  StartPayment?: (params: Record<string, unknown>) => void;
  Render?: (params: Record<string, unknown>, containerId?: string) => void;
  /** Не описан в документации, но есть в скрипте. Используем как подсказку. */
  SetCallbacks?: (callbacks: { onComplete?: (r: { status?: string }) => void }) => void;
  ClosePaymentForm?: () => void;
  pay?: { startOp?: (options: Record<string, unknown>) => void };
};

function api(): RobokassaGlobal | undefined {
  return (window as unknown as { Robokassa?: RobokassaGlobal }).Robokassa;
}

const hasFrameApi = () => typeof (api()?.Render ?? api()?.StartPayment) === 'function';
const hasSbpApi = () => typeof api()?.pay?.startOp === 'function';

/**
 * Загрузить нужный скрипт и дождаться именно нужного метода.
 *
 * У Робокассы два разных скрипта — для формы оплаты и для СБП — и они пишут в
 * одну и ту же переменную window.Robokassa, затирая друг друга: проверено, кто
 * загрузился последним, у того API и остаётся. Поэтому здесь нельзя запоминать
 * «скрипт уже загружен»: спрашиваем всегда про конкретный метод и, если его
 * нет, грузим свой скрипт заново. Повторная загрузка возвращает его на место.
 */
function loadApi(src: string, ready: () => boolean): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const el = document.createElement('script');
    let settled = false;
    const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    const timer = window.setTimeout(() => done(false), SCRIPT_TIMEOUT_MS);
    el.addEventListener('load', () => { window.clearTimeout(timer); done(ready()); });
    el.addEventListener('error', () => { window.clearTimeout(timer); done(false); });
    el.src = src;
    el.async = true;
    document.head.appendChild(el);
  });
}

/** Форма на странице и она показана — признак того, что оплата действительно открылась. */
export function isPaymentFrameOpen(): boolean {
  return frameIsUp();
}

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

type TelegramBackButton = {
  show?: () => void;
  hide?: () => void;
  onClick?: (cb: () => void) => void;
  offClick?: (cb: () => void) => void;
};

function backButton(): TelegramBackButton | undefined {
  return (window as unknown as { Telegram?: { WebApp?: { BackButton?: TelegramBackButton } } })
    .Telegram?.WebApp?.BackButton;
}

/**
 * Выход из платёжной формы кнопкой «назад» мессенджера.
 *
 * Внутри формы есть своё подтверждение «прервать оплату», и на него нельзя
 * полагаться: у нас оно уже попадалось в состоянии, когда кнопка «Прервать» не
 * нажимается, и гость оставался запертым в окне поверх приложения. Закрыть
 * форму снаружи мы можем всегда — этим и страхуемся.
 *
 * Кнопку «назад» приложение больше нигде не занимает, так что перехват ничего
 * не ломает: пока форма открыта, она закрывает форму, потом возвращается как
 * была.
 */
function guardWithBackButton(close: () => void): void {
  const back = backButton();
  if (!back?.onClick || !back.show) return;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearInterval(watch);
    try { back.offClick?.(handler); back.hide?.(); } catch { /* уже скрыта */ }
  };
  const handler = () => { close(); finish(); };

  // Форму могли закрыть и изнутри — тогда кнопку надо убрать самим.
  const watch = window.setInterval(() => { if (!frameIsUp()) finish(); }, 500);

  back.onClick(handler);
  back.show();
}

export type InAppResult = 'frame' | 'external';

/**
 * Карта: сначала пробуем форму поверх приложения, при любой заминке — обычная
 * страница оплаты.
 *
 * Возвращает, чем дело кончилось, чтобы экран знал, ждать ли гостя обратно
 * (external) или он остался здесь и статус надо опрашивать чаще (frame).
 */
export type PayOptions = {
  /** Обновить экран, когда форма сообщит о завершении. */
  onComplete?: () => void;
  /** Способы, подключённые магазину. Приходят с сервера. */
  methods?: string[];
  /**
   * Показать только эти способы.
   *
   * Порядок кнопок внутри формы задаёт сама Робокасса и наш порядок в списке
   * игнорирует — проверено: передал СБП первым, карта всё равно осталась
   * сверху. Поэтому единственный способ вывести нужный способ вперёд — открыть
   * форму, где он один, отдельной кнопкой у нас.
   */
  only?: string[];
};

export async function payInApp(
  fields: RobokassaFields,
  fallbackUrl: string,
  options: PayOptions = {},
): Promise<InAppResult> {
  const { onComplete, methods, only } = options;
  const goOut = (): InAppResult => { openExternal(fallbackUrl); return 'external'; };

  if (!(await loadApi(IFRAME_SRC, hasFrameApi))) return goOut();

  const rk = api();
  const start = rk?.Render ?? rk?.StartPayment;
  if (typeof start !== 'function') return goOut();

  // Подсказка о завершении, если скрипт её даёт. Ничему не верим на слово:
  // оплаченной бронь делает только уведомление на ResultURL, а это лишь повод
  // обновить экран сразу, не дожидаясь следующего опроса.
  try {
    rk?.SetCallbacks?.({ onComplete: () => onComplete?.() });
  } catch { /* необязательная возможность */ }

  // Что показать в форме, решает личный кабинет магазина, а не код: список
  // приходит с сервера. Карта — если список не доехал: она есть всегда.
  //
  // СБП из формы исключён намеренно. Он там дошёл бы до выбора банка и упёрся
  // в deep link, который вебвью мессенджера не открывает, — для него есть
  // отдельная кнопка, уводящая наружу.
  const available = (methods ?? []).filter((m) => m !== 'SBP');
  const wanted = only ? available.filter((m) => only.includes(m)) : available;
  const paymentMethods = wanted.length > 0 ? wanted : ['BankCard'];

  try {
    start.call(rk, {
      ...fields,
      Settings: JSON.stringify({ PaymentMethods: paymentMethods, Mode: 'modal' }),
    });
  } catch {
    return goOut();
  }

  if (!(await waitForFrame())) return goOut();

  // Форма открылась — обеспечиваем выход из неё.
  guardWithBackButton(() => { try { rk?.ClosePaymentForm?.(); } catch { /* уже закрыта */ } });
  return 'frame';
}

export type SbpResult = 'bank' | 'external';

/**
 * СБП: получить ссылку и увести гостя прямо в приложение банка.
 *
 * Ссылку выдаёт сама Робокасса в ответ на startOp — это настоящая ссылка СБП,
 * а не адрес их платёжной страницы, поэтому банк открывается сразу, без
 * промежуточного экрана. QR здесь не рисуем: на своём же телефоне его нечем
 * отсканировать.
 *
 * Открывать только внешним браузером: из вебвью мессенджера ссылка вида
 * qr.nspk.ru не запустит приложение банка.
 */
export async function paySbp(op: SbpOp, fallbackUrl: string): Promise<SbpResult> {
  const goOut = (): SbpResult => { openExternal(fallbackUrl); return 'external'; };

  if (!(await loadApi(BADGE_SRC, hasSbpApi))) return goOut();
  const startOp = api()?.pay?.startOp;
  if (typeof startOp !== 'function') return goOut();

  const link = await new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (url: string | null) => { if (!settled) { settled = true; resolve(url); } };
    const timer = window.setTimeout(() => done(null), LINK_TIMEOUT_MS);
    try {
      startOp({
        ...op,
        onpaymentlink: (url: string) => { window.clearTimeout(timer); done(url || null); },
      });
    } catch {
      window.clearTimeout(timer);
      done(null);
    }
  });

  if (!link) return goOut();
  openExternal(link);
  return 'bank';
}
