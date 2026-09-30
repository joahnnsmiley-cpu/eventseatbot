/**
 * Российский номер набирается сам.
 *
 * Человек начинает вводить 999… и ждёт, что получится +7 999 123-45-67, а не
 * голые цифры. Дописывать +7 руками раздражает, а без него номер приходит
 * организатору в десятке разных видов: 8..., 7..., 9..., со скобками и без.
 *
 * Иностранные номера не ломаем: если человек сам начал с плюса и там не
 * семёрка, оставляем как есть. Гость из-за границы — редкость, но превращать
 * его номер в российский нельзя.
 */

/** +7 XXX XXX-XX-XX — группы цифр после кода страны. */
const GROUPS = [3, 3, 2, 2];

export function formatPhone(raw: string): string {
  const input = raw.trim();

  // Начали с плюса и это не +7 — чужая страна, форматировать нечего.
  if (input.startsWith('+')) {
    const rest = input.slice(1).replace(/\D/g, '');
    if (rest && rest[0] !== '7' && rest[0] !== '8') {
      return `+${rest.slice(0, 15)}`;
    }
  }

  let digits = input.replace(/\D/g, '');
  if (!digits) return '';

  // 8 903… и 903… — это один и тот же номер, приводим к коду страны.
  if (digits[0] === '8') digits = `7${digits.slice(1)}`;
  else if (digits[0] !== '7') digits = `7${digits}`;
  digits = digits.slice(0, 11);

  const national = digits.slice(1);
  if (!national) return '+7';

  const parts: string[] = [];
  let at = 0;
  for (const size of GROUPS) {
    if (at >= national.length) break;
    parts.push(national.slice(at, at + size));
    at += size;
  }

  // Код оператора отделён пробелом, дальше номер через дефисы: так его читают
  // и так он печатается на билетах и в уведомлениях.
  const [code, ...tail] = parts;
  return tail.length > 0 ? `+7 ${code} ${tail.join('-')}` : `+7 ${code}`;
}

/** Только цифры — то, что уходит на сервер и по чему ищут бронь. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Похоже ли на российский номер целиком. */
export function isCompleteRuPhone(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length === 11 && digits[0] === '7';
}

/**
 * Номер введён до конца — по нему можно звонить.
 *
 * Нужно кнопке «Далее»: наполовину набранный номер — это не введённый номер, и
 * пускать с ним дальше значит получить бронь, по которой не дозвониться.
 * Иностранные номера считаем по длине: правил для всех стран мы не знаем, но
 * десять цифр — разумный минимум.
 */
export function isUsablePhone(value: string): boolean {
  if (isCompleteRuPhone(value)) return true;
  const digits = phoneDigits(value);
  return value.trim().startsWith('+') && digits[0] !== '7' && digits.length >= 10;
}

/**
 * Обработчик ввода для поля телефона.
 *
 * Форматирование вставляет пробелы и дефисы, из-за чего курсор уезжает: React
 * возвращает его на тот же номер символа, а символов стало больше. Поэтому,
 * если человек печатал в конце строки, курсор туда же и возвращаем. Если он
 * правил середину — не трогаем, иначе правка стала бы невозможной.
 */
export function handlePhoneInput(
  el: HTMLInputElement,
  set: (value: string) => void,
): void {
  const atEnd = el.selectionStart === el.value.length;
  const next = formatPhone(el.value);
  set(next);
  if (!atEnd) return;
  requestAnimationFrame(() => {
    try { el.setSelectionRange(next.length, next.length); } catch { /* поле уже не в дереве */ }
  });
}
