import React from 'react';
import { ArrowLeft } from 'lucide-react';

type Props = {
  onBack: () => void;
};

export default function PrivacyPolicyScreen({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-[#0b0b0b] border-b border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
          aria-label="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold text-white">Политика конфиденциальности</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5 text-sm text-white/80 leading-relaxed max-w-xl mx-auto w-full">
        <section className="space-y-2">
          <h2 className="text-white font-semibold">1. Кто обрабатывает данные</h2>
          <p>
            Оператор персональных данных — сервис EventSeatBot. По вопросам обработки данных обращайтесь в Telegram:{' '}
            <a
              href="https://t.me/nikto_ne_kruche_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C6A75E] underline"
            >
              @nikto_ne_kruche_bot
            </a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">2. Какие данные собираются</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Контактный номер телефона — вводится вами при оформлении бронирования.</li>
            <li>Идентификатор пользователя платформы (Telegram ID или ВКонтакте ID) — получается автоматически при входе.</li>
            <li>Комментарий к бронированию — по желанию, при оформлении заказа.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">3. Цель обработки</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Оформление и подтверждение бронирования мест на мероприятия.</li>
            <li>Связь организатора мероприятия с покупателем билета.</li>
            <li>Уведомления через Telegram и ВКонтакте о статусе бронирования.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">4. Хранение данных</h2>
          <p>
            Данные хранятся в защищённой базе данных (Supabase / PostgreSQL, серверы расположены на территории РФ). Данные
            хранятся на протяжении работы сервиса. Данные не передаются третьим лицам, за исключением
            уведомлений организатору мероприятия через Telegram и ВКонтакте.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">5. Права пользователя</h2>
          <p>
            Вы вправе запросить удаление своих данных, обратившись к оператору в Telegram:{' '}
            <a
              href="https://t.me/nikto_ne_kruche_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C6A75E] underline"
            >
              @nikto_ne_kruche_bot
            </a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">6. Согласие</h2>
          <p>
            Используя сервис и оформляя бронирование, вы подтверждаете своё согласие с настоящей политикой
            конфиденциальности и даёте согласие на обработку указанных персональных данных.
          </p>
        </section>

        <p className="text-xs text-white/40 pt-2">Дата актуализации: апрель 2025 г.</p>
      </div>
    </div>
  );
}
