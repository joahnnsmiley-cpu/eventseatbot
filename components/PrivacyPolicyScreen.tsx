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
          <h2 className="text-white font-semibold">1. Оператор персональных данных</h2>
          <p>
            Оператором персональных данных является сервис НиктоНеКруче (далее — Разработчик). По всем
            вопросам, связанным с обработкой персональных данных, обращайтесь:
          </p>
          <ul className="list-none space-y-1">
            <li>Email:{' '}
              <a href="mailto:joahnnsmiley@gmail.com" className="text-[#C6A75E] underline">joahnnsmiley@gmail.com</a>
            </li>
            <li>ВКонтакте:{' '}
              <a href="https://vk.com/niktonekruchee" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">vk.com/niktonekruchee</a>
            </li>
            <li>Telegram:{' '}
              <a href="https://t.me/nikto_ne_kruche_bot" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">@nikto_ne_kruche_bot</a>
            </li>
          </ul>
          <p>
            Разработчик обязуется рассмотреть и направить ответ на поступивший запрос в течение
            30 дней с момента его получения.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">2. Состав обрабатываемых данных</h2>
          <p>Разработчик обрабатывает следующие персональные данные Пользователей:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Контактный номер телефона — вводится Пользователем при оформлении бронирования.</li>
            <li>
              Идентификатор пользователя платформы (Telegram ID или ВКонтакте ID) — получается
              автоматически при входе через соответствующую платформу.
            </li>
            <li>Комментарий к бронированию — предоставляется Пользователем по желанию.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">3. Цели обработки</h2>
          <p>
            Обработка персональных данных осуществляется исключительно в целях выполнения
            обязательств Разработчика перед Пользователями:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Оформление и подтверждение бронирования мест на мероприятия.</li>
            <li>Связь организатора мероприятия с покупателем билета.</li>
            <li>Уведомления через Telegram и ВКонтакте о статусе бронирования.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">4. Сбор и передача данных третьим лицам</h2>
          <p>
            Персональные данные Пользователей не передаются третьим лицам, за исключением
            уведомлений организатору мероприятия через Telegram-бот и ВКонтакте в рамках
            функционирования сервиса. Предоставление данных государственным органам осуществляется
            в порядке, предусмотренном законодательством Российской Федерации.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">5. Хранение персональных данных</h2>
          <p>
            Персональные данные Пользователей хранятся на территории Российской Федерации в
            защищённой базе данных (Supabase / PostgreSQL). Хранение осуществляется исключительно
            на электронных носителях с использованием автоматизированных систем обработки.
          </p>
          <p>
            Данные хранятся в течение использования сервиса Пользователем, а после прекращения
            использования — в течение срока, установленного действующим законодательством
            Российской Федерации.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">6. Прекращение обработки данных</h2>
          <p>
            Обработка персональных данных прекращается при достижении целей обработки или по
            запросу Пользователя об отзыве согласия. Для отзыва согласия обратитесь к Разработчику:
            Email{' '}
            <a href="mailto:joahnnsmiley@gmail.com" className="text-[#C6A75E] underline">joahnnsmiley@gmail.com</a>
            , ВКонтакте{' '}
            <a href="https://vk.com/niktonekruchee" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">vk.com/niktonekruchee</a>
            {' '}или Telegram{' '}
            <a href="https://t.me/nikto_ne_kruche_bot" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">@nikto_ne_kruche_bot</a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">7. Права пользователя</h2>
          <p>Пользователь вправе:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Осуществлять бесплатный доступ к информации о себе, обратившись к Разработчику.
            </li>
            <li>
              Запрашивать у Разработчика информацию, касающуюся обработки его персональных данных.
            </li>
            <li>
              Требовать уточнения, блокирования или уничтожения своих персональных данных в случае,
              если они являются неполными, устаревшими, неточными или незаконно полученными.
            </li>
            <li>
              Отозвать согласие на обработку персональных данных, направив соответствующий запрос
              Разработчику.
            </li>
          </ul>
          <p>
            Запросы направляются на Email{' '}
            <a href="mailto:joahnnsmiley@gmail.com" className="text-[#C6A75E] underline">joahnnsmiley@gmail.com</a>
            , ВКонтакте{' '}
            <a href="https://vk.com/niktonekruchee" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">vk.com/niktonekruchee</a>
            {' '}или Telegram{' '}
            <a href="https://t.me/nikto_ne_kruche_bot" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">@nikto_ne_kruche_bot</a>
            . Срок ответа — 30 дней с момента получения запроса.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">8. Меры защиты данных</h2>
          <p>
            Разработчик принимает необходимые технические и организационные меры для защиты
            персональных данных Пользователей от неправомерного или случайного доступа,
            уничтожения, изменения, блокирования, копирования и распространения.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">9. Согласие</h2>
          <p>
            Используя сервис, Пользователь подтверждает, что ознакомлен с настоящей Политикой,
            выражает своё согласие с ней и принимает на себя указанные в ней права и обязанности.
            В случае несогласия с условиями Политики использование сервиса должно быть прекращено.
          </p>
        </section>

        <p className="text-xs text-white/40 pt-2">Дата актуализации: апрель 2025 г.</p>
      </div>
    </div>
  );
}
