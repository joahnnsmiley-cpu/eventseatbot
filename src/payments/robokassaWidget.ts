/**
 * Оплата: уход на страницу Робокассы и прямая ссылка СБП.
 *
 * Здесь была ещё встроенная форма — платёжное окно Робокассы поверх мини-аппа,
 * чтобы гость никуда не уходил. Её пришлось убрать: внутри вебвью Телеграма она
 * открывается, но оплата не проходит — карта отклоняется как неверная. Причина
 * на их стороне, и чинить чужой фрейм вслепую мы не можем, а каждая такая
 * попытка — это реальный гость, который не смог заплатить.
 *
 * Поэтому карта снова уходит на полную страницу в настоящий браузер. Это на
 * один переход длиннее, зато работает.
 *
 * СБП остаётся здесь: у него свой метод, который отдаёт настоящую ссылку СБП и
 * уводит сразу в приложение банка, минуя страницу Робокассы. Открывать её тоже
 * только снаружи — из вебвью ссылка вида qr.nspk.ru приложение банка не
 * запустит, об этом прямо сказано в документации Робокассы.
 */

import { openExternal } from '../utils/openExternal';

const BADGE_SRC = 'https://auth.robokassa.ru/merchant/bundle/robokassa-iframe-badge.js';

const SCRIPT_TIMEOUT_MS = 6000;
/** Сколько ждём ссылку СБП: её выдаёт запрос к Робокассе, а не локальный код. */
const LINK_TIMEOUT_MS = 12000;

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
  pay?: { startOp?: (options: Record<string, unknown>) => void };
};

function api(): RobokassaGlobal | undefined {
  return (window as unknown as { Robokassa?: RobokassaGlobal }).Robokassa;
}

const hasSbpApi = () => typeof api()?.pay?.startOp === 'function';

/**
 * Загрузить скрипт и дождаться именно нужного метода.
 *
 * Проверяем не факт загрузки, а наличие метода: у Робокассы несколько скриптов,
 * и они пишут в одну переменную window.Robokassa, затирая друг друга — кто
 * загрузился последним, у того API и остаётся.
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

export type SbpResult = 'bank' | 'external';

/**
 * СБП: получить ссылку и увести гостя прямо в приложение банка.
 *
 * Ссылку выдаёт сама Робокасса в ответ на startOp — это настоящая ссылка СБП, а
 * не адрес их платёжной страницы, поэтому банк открывается сразу. QR не рисуем:
 * на своём же телефоне его нечем отсканировать.
 *
 * Не получилось — уходим на обычную страницу оплаты. Тупика у гостя быть не
 * должно.
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
