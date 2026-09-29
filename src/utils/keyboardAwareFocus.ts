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
 * Если его нет, прокручиваем по таймеру — хуже, чем по событию, но лучше, чем
 * ничего.
 */

const FIELD = 'input, textarea, [contenteditable="true"]';
/** Типы полей, у которых нет клавиатуры и прокрутка только раздражала бы. */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset']);
/** Воздух между полем и тем, что под ним. */
const GAP = 12;
/** Сколько ждём клавиатуру, если событий от visualViewport не будет. */
const FALLBACK_MS = 350;

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
    // панели, которые и нужно измерить, высота выходила нулевой, и поле
    // оставалось закрытым — молча, потому что прокрутка всё же происходила,
    // просто недостаточная.
    const rect = bar.getBoundingClientRect();
    if (rect.height === 0) continue;
    if (getComputedStyle(bar).visibility === 'hidden') continue;
    height = Math.max(height, rect.height);
  }
  return height;
}

/**
 * Клавиатура закрывает столько-то пикселей снизу.
 *
 * Порог нужен, чтобы не принять за клавиатуру схлопывание адресной строки
 * браузера: она тоже меняет visualViewport, но на несколько десятков пикселей.
 */
const KEYBOARD_MIN_PX = 120;

function keyboardHeight(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const hidden = window.innerHeight - vv.height;
  return hidden > KEYBOARD_MIN_PX ? hidden : 0;
}

/**
 * Пока открыта клавиатура, странице нужно место снизу.
 *
 * Без него прокручивать бывает просто некуда: поле у конца страницы упирается
 * в её край и остаётся под клавиатурой, сколько ни листай. Это не редкий
 * случай, а обычный — на экране брони телефон и комментарий как раз внизу.
 *
 * Отступ временный и снимается, как только клавиатура убралась.
 */
function setKeyboardRoom(px: number): void {
  const body = document.body;
  if (px > 0) body.style.setProperty('padding-bottom', `${px}px`);
  else body.style.removeProperty('padding-bottom');
}

function revealField(el: HTMLElement): void {
  setKeyboardRoom(keyboardHeight());

  const vv = window.visualViewport;
  // Нижняя граница того, что человек реально видит.
  const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const safeBottom = visibleBottom - stickyBarHeight() - GAP;

  const rect = el.getBoundingClientRect();
  // Уже видно целиком — не трогаем: лишняя прокрутка под пальцами раздражает
  // сильнее, чем помогает.
  if (rect.bottom <= safeBottom && rect.top >= (vv?.offsetTop ?? 0) + GAP) return;

  const delta = rect.bottom > safeBottom
    ? rect.bottom - safeBottom
    : rect.top - ((vv?.offsetTop ?? 0) + GAP);

  // Без плавности намеренно. Во-первых, она здесь не нужна: прокрутка идёт
  // одновременно с выездом клавиатуры и всё равно не читается как движение.
  // Во-вторых, плавная прокрутка длится доли секунды и её легко прерывает
  // то же самое изменение размеров экрана — поле останется закрытым.
  window.scrollBy(0, delta);
}

/**
 * Включить поведение на всё приложение. Возвращает функцию отключения.
 *
 * Слушаем focusin на документе, а не вешаем обработчики на каждое поле: полей
 * много, они появляются и исчезают, и один слушатель надёжнее десятка.
 */
export function installKeyboardAwareFocus(): () => void {
  let timer: number | null = null;
  let pending: HTMLElement | null = null;

  const settle = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    const el = pending;
    pending = null;
    if (el && document.contains(el)) revealField(el);
  };

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target as Element | null;
    if (!isTextField(el)) return;
    pending = el;
    // Клавиатура выезжает не мгновенно. Считать размеры сразу — значит считать
    // их по экрану без клавиатуры и никуда не прокрутиться.
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(settle, FALLBACK_MS);
  };

  // Клавиатура появилась — вот теперь размеры настоящие.
  const onViewportChange = () => {
    if (pending) { settle(); return; }
    // Клавиатура убралась — вернуть страницу как было.
    if (keyboardHeight() === 0) setKeyboardRoom(0);
  };

  // Ушли из поля — место снизу больше не нужно. С небольшой отсрочкой: переход
  // между двумя полями идёт через focusout, и убирать отступ на полпути значит
  // дёрнуть страницу под пальцами.
  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!isTextField(document.activeElement)) setKeyboardRoom(0);
    }, 120);
  };

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', onViewportChange);

  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    window.visualViewport?.removeEventListener('resize', onViewportChange);
    if (timer !== null) window.clearTimeout(timer);
    setKeyboardRoom(0);
  };
}
