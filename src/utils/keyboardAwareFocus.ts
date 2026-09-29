/**
 * Поле, в которое пишут, должно быть видно.
 *
 * На телефоне клавиатура занимает нижнюю половину экрана, а у экрана брони
 * внизу ещё и закреплённая панель с кнопкой. Поле в нижней части страницы
 * после нажатия оказывается за ними обоими: человек печатает вслепую.
 *
 * Браузер сам прокручивает к полю не всегда и не туда: он ничего не знает про
 * нашу панель и считает видимой всю высоту окна, хотя клавиатура её уже
 * закрыла. Поэтому считаем сами.
 *
 * Опорная величина — visualViewport: при открытии клавиатуры уменьшается
 * именно он, тогда как window.innerHeight на Android часто остаётся прежним.
 */

const FIELD = 'input, textarea, [contenteditable="true"]';
/** Типы полей, у которых нет клавиатуры и прокрутка только раздражала бы. */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset']);
/** Воздух между полем и тем, что под ним. */
const GAP = 12;

/**
 * Клавиатура выезжает с анимацией, и экран меняет размер не один раз, а
 * несколько раз подряд. Считать по первому же событию — значит померить
 * наполовину выехавшую клавиатуру и прокрутить не туда. Поэтому ждём тишины:
 * каждое новое изменение отодвигает расчёт.
 */
const QUIET_MS = 140;
/** Если событий об изменении экрана не будет вовсе — считаем по таймеру. */
const FIRST_WAIT_MS = 320;
/** Предел ожидания, чтобы анимация не откладывала расчёт бесконечно. */
const MAX_WAIT_MS = 1200;
/** Проверочный заход: клавиатура могла доехать уже после расчёта. */
const VERIFY_MS = 400;

type TelegramViewport = {
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
};

function isTextField(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement) || !el.matches(FIELD)) return false;
  if (el instanceof HTMLInputElement && NO_KEYBOARD.has(el.type)) return false;
  return true;
}

/**
 * Высота закреплённой снизу панели, если она есть на экране.
 * Помечена в разметке через data-sticky-bar — иначе её пришлось бы угадывать.
 */
function stickyBarHeight(): number {
  let height = 0;
  for (const bar of document.querySelectorAll<HTMLElement>('[data-sticky-bar]')) {
    // Проверять видимость через offsetParent здесь нельзя: у элемента с
    // position: fixed он всегда null. Такая проверка отсекала бы ровно те
    // панели, которые и нужно измерить.
    const rect = bar.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (getComputedStyle(bar).visibility === 'hidden') continue;
    height = Math.max(height, rect.height);
  }
  return height;
}

/**
 * Место снизу, добавленное на время.
 *
 * Прокручивать бывает просто некуда: поле у конца страницы упирается в её край
 * и остаётся под клавиатурой, сколько ни листай. Сколько именно не хватает,
 * считаем по остатку прокрутки, а не по высоте клавиатуры: как платформа о ней
 * сообщает — дело платформы, а «докуда я могу долистать» верно везде.
 */
let addedRoom = 0;

function setRoom(px: number): void {
  addedRoom = Math.max(0, Math.round(px));
  if (addedRoom > 0) document.body.style.setProperty('padding-bottom', `${addedRoom}px`);
  else document.body.style.removeProperty('padding-bottom');
}

function revealField(el: HTMLElement): void {
  const vv = window.visualViewport;
  const visibleTop = vv?.offsetTop ?? 0;
  const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const safeBottom = visibleBottom - stickyBarHeight() - GAP;
  const safeTop = visibleTop + GAP;

  const rect = el.getBoundingClientRect();
  // Уже видно целиком — не трогаем: лишняя прокрутка под пальцами раздражает
  // сильнее, чем помогает.
  if (rect.bottom <= safeBottom && rect.top >= safeTop) return;

  const delta = rect.bottom > safeBottom ? rect.bottom - safeBottom : rect.top - safeTop;

  if (delta > 0) {
    const doc = document.documentElement;
    const room = doc.scrollHeight - window.innerHeight - window.scrollY;
    if (room < delta) {
      setRoom(addedRoom + (delta - room) + GAP);
      // Прочитать высоту, чтобы разметка пересчиталась до прокрутки.
      void doc.scrollHeight;
    }
  }

  // behavior: 'instant' указан явно, и это не перестраховка.
  //
  // В index.css стоит html { scroll-behavior: smooth }, а это правило делает
  // плавной ЛЮБУЮ программную прокрутку, даже вызванную без указания behavior.
  // Плавная прокрутка длится доли секунды, и её прерывает то же изменение
  // размеров экрана, которым мы и вызваны, — поле остаётся закрытым. Именно на
  // это правило и налетела первая версия: на стенде без него всё работало, а в
  // приложении не двигалось вовсе.
  window.scrollBy({ top: delta, behavior: 'instant' });

  // Последняя проверка. Если страница прокручивается не окном, а каким-то
  // контейнером, о котором мы не знаем, всё выше не сработает — а вот это
  // сработает, потому что браузер сам найдёт нужный контейнер.
  const after = el.getBoundingClientRect();
  if (after.bottom > safeBottom || after.top < safeTop) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
}

/**
 * Включить поведение на всё приложение. Возвращает функцию отключения.
 *
 * Слушаем focusin на документе, а не вешаем обработчики на каждое поле: полей
 * много, они появляются и исчезают, и один слушатель надёжнее десятка.
 */
export function installKeyboardAwareFocus(): () => void {
  let timer: number | null = null;
  let verify: number | null = null;
  let pending: HTMLElement | null = null;
  let deadline = 0;

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  function settle() {
    clearTimer();
    const el = pending;
    pending = null;
    if (!el || !document.contains(el)) return;

    revealField(el);

    // Клавиатура могла доехать уже после расчёта. Заход повторный и безвредный:
    // если поле видно, revealField ничего не сделает.
    if (verify !== null) window.clearTimeout(verify);
    verify = window.setTimeout(() => {
      verify = null;
      if (document.activeElement === el && document.contains(el)) revealField(el);
    }, VERIFY_MS);
  }

  const schedule = (delay: number) => {
    clearTimer();
    const at = Math.min(Date.now() + delay, deadline);
    timer = window.setTimeout(settle, Math.max(0, at - Date.now()));
  };

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target as Element | null;
    if (!isTextField(el)) return;
    pending = el;
    deadline = Date.now() + MAX_WAIT_MS;
    schedule(FIRST_WAIT_MS);
  };

  // Экран изменил размер: клавиатура выезжает. Не считаем сразу — отодвигаем
  // расчёт, пока изменения не прекратятся.
  const onViewportChange = () => {
    if (pending) { schedule(QUIET_MS); return; }
    // Клавиатура убралась, а поле не в фокусе — вернуть страницу как было.
    if (!isTextField(document.activeElement)) setRoom(0);
  };

  // Ушли из поля — место снизу больше не нужно. С небольшой отсрочкой: переход
  // между двумя полями идёт через focusout, и убирать отступ на полпути значит
  // дёрнуть страницу под пальцами.
  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!isTextField(document.activeElement)) setRoom(0);
    }, 150);
  };

  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramViewport } }).Telegram?.WebApp;

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', onViewportChange);
  window.visualViewport?.addEventListener('scroll', onViewportChange);
  // Телеграм сообщает о своём изменении размера отдельно, и в его вебвью это
  // бывает единственный сигнал.
  tg?.onEvent?.('viewportChanged', onViewportChange);

  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    window.visualViewport?.removeEventListener('resize', onViewportChange);
    window.visualViewport?.removeEventListener('scroll', onViewportChange);
    tg?.offEvent?.('viewportChanged', onViewportChange);
    clearTimer();
    if (verify !== null) window.clearTimeout(verify);
    setRoom(0);
  };
}
