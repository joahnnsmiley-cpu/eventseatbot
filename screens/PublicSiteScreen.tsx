import React, { useEffect, useState } from 'react';
import { CalendarBlank, MapPin, Ticket, CreditCard, ArrowRight } from '@phosphor-icons/react';
import OfferScreen from '../components/OfferScreen';
import UserAgreementScreen from '../components/UserAgreementScreen';
import PrivacyPolicyScreen from '../components/PrivacyPolicyScreen';
import { getApiBaseUrl } from '../config/api';
import { formatEventDateTime } from '../src/utils/formatDate';
import { DEFAULT_TZ_OFFSET_MINUTES } from '../src/config/timezone';

/**
 * What a visitor sees at niktonekruche.ru.
 *
 * Until now this address answered with a black screen saying the service only
 * works inside Telegram or ВКонтакте — true, but it left anyone who arrived by
 * link, and any acquirer reviewing the shop, with nothing: no description of
 * what is sold, no prices, no offer, no seller's details, no refund terms.
 * The gate message is still here, at the bottom, where it belongs.
 */

const TELEGRAM_URL = 'https://t.me/nikto_ne_kruche_bot';
const VK_URL = 'https://vk.ru/app54480403';

type Category = { name?: string; price?: number; isActive?: boolean };
type PublicEvent = {
  id: string;
  title?: string;
  venue?: string;
  event_date?: string | null;
  event_time?: string | null;
  timezoneOffsetMinutes?: number | null;
  coverImageUrl?: string | null;
  imageUrl?: string | null;
  ticketCategories?: Category[] | null;
};

const money = (n: number) => n.toLocaleString('ru-RU');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#8A8377]">{title}</h2>
      {children}
    </section>
  );
}

function OpenAppButtons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 ${compact ? '' : 'sm:flex-row'}`}>
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl bg-[#C6A75E] text-[#14110B] font-semibold text-sm transition hover:bg-[#d4b86c]"
      >
        Забронировать в Telegram
        <ArrowRight size={16} weight="bold" />
      </a>
      <a
        href={VK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl border border-white/20 text-white font-medium text-sm transition hover:bg-white/5"
      >
        Забронировать во ВКонтакте
        <ArrowRight size={16} />
      </a>
    </div>
  );
}

export default function PublicSiteScreen() {
  const [doc, setDoc] = useState<'offer' | 'agreement' | 'privacy' | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    // The poster is public: no token, and a failure here must not blank the
    // page — everything below the poster is what the page is really for.
    fetch(`${getApiBaseUrl()}/public/events`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data: { featured?: PublicEvent | null; events?: PublicEvent[] }) => {
        if (!alive) return;
        const list = Array.isArray(data.events) ? data.events : [];
        const featured = data.featured;
        const ordered = featured ? [featured, ...list.filter((e) => e.id !== featured.id)] : list;
        setEvents(ordered);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  // React keeps the scroll position across the swap, so opening a document from
  // the bottom of the page lands the reader in the middle of it — on a dark
  // page the first frame just looks blank.
  // 'instant' on purpose: index.css sets `scroll-behavior: smooth` on <html>,
  // and a smooth scroll gets cancelled the moment the taller document replaces
  // the page — leaving the reader exactly where the blank looked like a bug.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [doc]);

  if (doc === 'offer') return <OfferScreen onBack={() => setDoc(null)} />;
  if (doc === 'agreement') {
    return <UserAgreementScreen onBack={() => setDoc(null)} onOpenOffer={() => setDoc('offer')} />;
  }
  if (doc === 'privacy') return <PrivacyPolicyScreen onBack={() => setDoc(null)} />;

  const now = Date.now();
  const upcoming = events.filter((e) => {
    if (!e.event_date) return false;
    const offset = e.timezoneOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES;
    const ts = Date.parse(`${e.event_date}T${(e.event_time ?? '23:59:59')}Z`) - offset * 60_000;
    return Number.isFinite(ts) && ts > now;
  });
  const next = upcoming[0] ?? null;

  const categories = (next?.ticketCategories ?? [])
    .filter((c): c is Category & { price: number } => typeof c?.price === 'number' && c.isActive !== false)
    .sort((a, b) => b.price - a.price);
  const cheapest = categories.length ? Math.min(...categories.map((c) => c.price)) : null;

  return (
    <div className="min-h-[100dvh] bg-[#0B0A09] text-[#F5F1E9]">
      <div className="mx-auto w-full max-w-xl px-5 py-10 space-y-12">

        <header className="space-y-3 text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#8A8377]">Концерты в Новосибирске</p>
          <h1 className="font-premium-title text-4xl leading-none">#НИКТОНЕКРУЧЕ</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            Живые концерты за столами. Вы выбираете конкретное место на плане зала,
            платите онлайн и получаете билет в мессенджер.
          </p>
        </header>

        {next ? (
          <Section title="Ближайший концерт">
            <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/[0.03]">
              {(next.coverImageUrl || next.imageUrl) && (
                <img
                  src={next.coverImageUrl ?? next.imageUrl ?? ''}
                  alt={`Афиша: ${next.title ?? 'концерт'}`}
                  className="w-full aspect-[4/3] object-cover"
                />
              )}
              <div className="p-5 space-y-3">
                <h3 className="font-premium-title text-2xl leading-tight">{next.title}</h3>
                <div className="flex flex-col gap-1.5 text-sm text-white/70">
                  <span className="flex items-center gap-2">
                    <CalendarBlank size={16} className="text-[#C6A75E]" />
                    <span className="nums">
                      {formatEventDateTime(
                        next.event_date,
                        next.event_time,
                        next.timezoneOffsetMinutes ?? DEFAULT_TZ_OFFSET_MINUTES,
                      )}
                    </span>
                  </span>
                  {next.venue && (
                    <span className="flex items-center gap-2">
                      <MapPin size={16} className="text-[#C6A75E]" />
                      {next.venue}
                    </span>
                  )}
                  {cheapest != null && (
                    <span className="flex items-center gap-2">
                      <Ticket size={16} className="text-[#C6A75E]" />
                      Места от <span className="nums font-semibold text-white">{money(cheapest)} ₽</span>
                    </span>
                  )}
                </div>
                <OpenAppButtons compact />
              </div>
            </div>
          </Section>
        ) : (
          <Section title="Ближайший концерт">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
              <p className="text-sm text-white/70">
                {loaded
                  ? 'Даты следующего концерта пока нет. Откройте приложение — там появится, как только объявим.'
                  : 'Загружаем афишу…'}
              </p>
              <OpenAppButtons compact />
            </div>
          </Section>
        )}

        {categories.length > 0 && (
          <Section title="Стоимость участия">
            <ul className="rounded-2xl border border-white/10 divide-y divide-white/10 overflow-hidden">
              {categories.map((c, i) => (
                <li key={`${c.name}-${i}`} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">{c.name ?? 'Категория'}</span>
                  <span className="nums text-sm font-semibold">{money(c.price)} ₽</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/40 leading-relaxed">
              Цена указана за одно место и зависит от категории стола. Итоговая сумма
              показывается до подтверждения брони. НДС не облагается.
            </p>
          </Section>
        )}

        <Section title="Как это работает">
          <ol className="space-y-3">
            {[
              'Открываете приложение в Telegram или во ВКонтакте и выбираете стол и места на плане зала.',
              'Оставляете номер телефона — по нему с вами свяжется организатор, если что-то изменится.',
              'Оплачиваете банковской картой или через СБП. Место держится за вами ограниченное время, оно показано на экране брони.',
              'Билет приходит сообщением в мессенджер и остаётся в приложении, в разделе «Мои билеты». Чек приходит отдельно.',
            ].map((text, i) => (
              <li key={i} className="flex gap-3 text-sm text-white/75 leading-relaxed">
                <span className="nums shrink-0 w-6 h-6 rounded-full bg-[#C6A75E]/15 text-[#C6A75E] text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Оплата">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3 text-sm text-white/75 leading-relaxed">
            <p className="flex items-center gap-2 text-white">
              <CreditCard size={18} className="text-[#C6A75E]" />
              Банковская карта и Система быстрых платежей
            </p>
            <p>
              Платежи проходят через сервис Robokassa. Данные вашей карты не попадают
              в приложение и нигде у нас не хранятся.
            </p>
            <p>
              После оплаты вы получаете чек, сформированный по Федеральному закону
              от 27.11.2018 № 422-ФЗ и зарегистрированный в налоговой.
            </p>
          </div>
        </Section>

        <Section title="Возврат">
          <div className="space-y-2 text-sm text-white/75 leading-relaxed">
            <p>
              Если концерт отменят — вернём всю сумму. Если перенесут — можно оставить
              оплату на новую дату или забрать деньги.
            </p>
            <p>
              Если вы передумали, напишите на{' '}
              <a href="mailto:darryp@yandex.ru" className="text-[#C6A75E] underline">darryp@yandex.ru</a>
              {' '}до начала концерта: укажите имя, телефон брони и код брони. Заявление
              рассматриваем 10 календарных дней, деньги возвращаем тем же способом,
              которым вы платили.
            </p>
            <p className="text-white/50">
              Полные условия — в{' '}
              <button
                type="button"
                onClick={() => setDoc('offer')}
                className="text-[#C6A75E] underline underline-offset-2"
              >
                разделе 7 публичной оферты
              </button>.
            </p>
          </div>
        </Section>

        <Section title="Документы">
          <div className="flex flex-col gap-2">
            {([
              ['offer', 'Публичная оферта'],
              ['agreement', 'Пользовательское соглашение'],
              ['privacy', 'Политика конфиденциальности'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDoc(key)}
                className="flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10 text-sm text-white/85 transition hover:bg-white/5"
              >
                {label}
                <ArrowRight size={16} className="text-[#8A8377]" />
              </button>
            ))}
          </div>
        </Section>

        <Section title="Организатор">
          <div className="space-y-1 text-sm text-white/70">
            <p className="text-white">Индивидуальный предприниматель Подковырина Дарья Андреевна</p>
            <p>ИНН <span className="nums">190309009577</span></p>
            <p>ОГРНИП <span className="nums">326190000025967</span></p>
            <p>
              <a href="tel:+79039178940" className="text-[#C6A75E] underline nums">+7 903 917-89-40</a>
              {' · '}
              <a href="mailto:darryp@yandex.ru" className="text-[#C6A75E] underline">darryp@yandex.ru</a>
            </p>
          </div>
        </Section>

        <footer className="pt-2 border-t border-white/10 space-y-2 text-center">
          <p className="text-xs text-white/40 leading-relaxed">
            Бронирование и оплата доступны в мини-приложении внутри Telegram или ВКонтакте —
            на этой странице их нет.
          </p>
          <p className="text-xs text-white/25">© НиктоНеКруче</p>
        </footer>
      </div>
    </div>
  );
}
