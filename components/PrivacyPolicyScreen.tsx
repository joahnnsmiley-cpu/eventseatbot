import React from 'react';
import { ArrowLeft } from '@phosphor-icons/react';

type Props = {
  onBack: () => void;
};

export default function PrivacyPolicyScreen({ onBack }: Props) {
  return (
    <div className="min-h-[100dvh] bg-[#0B0A09] text-white flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-[#0B0A09] border-b border-white/10">
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
            Оператором персональных данных является индивидуальный предприниматель
            Подковырина Дарья Андреевна (далее — Оператор), ИНН{' '}
            <span className="nums">190309009577</span>, ОГРНИП{' '}
            <span className="nums">326190000025967</span>. По всем вопросам, связанным
            с обработкой персональных данных, обращайтесь:
          </p>
          <ul className="list-none space-y-1">
            <li>Email:{' '}
              <a href="mailto:darryp@yandex.ru" className="text-[#C6A75E] underline">darryp@yandex.ru</a>
            </li>
            <li>Телефон:{' '}
              <a href="tel:+79039178940" className="text-[#C6A75E] underline nums">+7 903 917-89-40</a>
            </li>
            <li>ВКонтакте:{' '}
              <a href="https://vk.com/niktonekruchee" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">vk.com/niktonekruchee</a>
            </li>
            <li>Telegram:{' '}
              <a href="https://t.me/nikto_ne_kruche_bot" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">@nikto_ne_kruche_bot</a>
            </li>
          </ul>
          <p>
            Оператор обязуется рассмотреть и направить ответ на поступивший запрос в течение
            30 дней с момента его получения.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">2. Состав обрабатываемых данных</h2>
          <p>Оператор обрабатывает следующие персональные данные Пользователей:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Контактный номер телефона — вводится Пользователем при оформлении бронирования.</li>
            <li>
              Идентификатор пользователя платформы (Telegram ID или ВКонтакте ID) — получается
              автоматически при входе через соответствующую платформу.
            </li>
            <li>
              Имя, фамилия и имя пользователя (ник) из профиля платформы, дата последнего
              входа — получаются автоматически при входе.
            </li>
            <li>
              Комментарий к бронированию, включая имена гостей, если Пользователь их укажет, —
              предоставляется Пользователем по желанию.
            </li>
            <li>
              Адрес электронной почты — предоставляется Пользователем по желанию и используется
              исключительно для направления кассового чека об оплате.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">3. Цели обработки</h2>
          <p>
            Обработка персональных данных осуществляется исключительно в целях выполнения
            обязательств Оператора перед Пользователями:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Оформление и подтверждение бронирования мест на мероприятия.</li>
            <li>Связь организатора мероприятия с покупателем билета.</li>
            <li>Уведомления через Telegram и ВКонтакте о статусе бронирования.</li>
            <li>
              Приём оплаты и формирование кассового чека, а также регистрация дохода в
              соответствии с Федеральным законом от 27.11.2018 № 422-ФЗ.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">4. Сбор и передача данных третьим лицам</h2>
          <p>
            Персональные данные Пользователей не передаются третьим лицам, за исключением
            случаев, перечисленных ниже, и уведомлений организатору мероприятия через
            Telegram-бот и ВКонтакте в рамках функционирования сервиса.
          </p>
          <p>
            При оплате банковской картой или через Систему быстрых платежей данные об оплате
            передаются платёжному сервису Robokassa (ООО «Робокасса»): сумма, наименование
            оплачиваемой услуги и, если Пользователь его указал, адрес электронной почты для
            направления кассового чека. Реквизиты банковской карты вводятся Пользователем на
            стороне платёжного сервиса и Оператору не передаются и им не хранятся.
          </p>
          <p>
            Сведения о произведённой оплате передаются в Федеральную налоговую службу в объёме,
            необходимом для формирования кассового чека и регистрации дохода в соответствии с
            Федеральным законом от 27.11.2018 № 422-ФЗ.
          </p>
          <p>
            Предоставление данных государственным органам осуществляется в порядке,
            предусмотренном законодательством Российской Федерации.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">5. Трансграничная передача данных</h2>
          <p>
            Серверная часть сервиса работает на оборудовании хостинг-провайдера Render
            (Render Services, Inc.) в дата-центре во Франкфурте-на-Майне, Германия. При
            использовании сервиса данные, перечисленные в разделе 2, передаются на этот сервер
            для обработки: проверки входа, оформления бронирования и отправки уведомлений.
            На этом сервере данные не накапливаются и не хранятся.
          </p>
          <p>
            Уведомления в Telegram доставляются через инфраструктуру мессенджера Telegram,
            расположенную за пределами Российской Федерации.
          </p>
          <p>
            Трансграничная передача осуществляется в соответствии со статьёй 12 Федерального
            закона от 27.07.2006 № 152-ФЗ «О персональных данных» на основании согласия
            Пользователя.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">6. Хранение персональных данных</h2>
          <p>
            Запись, систематизация, накопление и хранение персональных данных Пользователей
            осуществляются в базе данных на территории Российской Федерации: на серверах
            облачного провайдера Timeweb Cloud в Москве. Резервные копии хранятся в хранилище
            того же провайдера в Санкт-Петербурге. Хранение осуществляется исключительно на
            электронных носителях с использованием автоматизированных систем обработки.
          </p>
          <p>
            Данные хранятся в течение использования сервиса Пользователем, а после прекращения
            использования — в течение срока, установленного действующим законодательством
            Российской Федерации.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">7. Прекращение обработки данных</h2>
          <p>
            Обработка персональных данных прекращается при достижении целей обработки или по
            запросу Пользователя об отзыве согласия. Для отзыва согласия обратитесь к Оператору:
            Email{' '}
            <a href="mailto:darryp@yandex.ru" className="text-[#C6A75E] underline">darryp@yandex.ru</a>
            , ВКонтакте{' '}
            <a href="https://vk.com/niktonekruchee" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">vk.com/niktonekruchee</a>
            {' '}или Telegram{' '}
            <a href="https://t.me/nikto_ne_kruche_bot" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">@nikto_ne_kruche_bot</a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">8. Права пользователя</h2>
          <p>Пользователь вправе:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Осуществлять бесплатный доступ к информации о себе, обратившись к Оператору.
            </li>
            <li>
              Запрашивать у Оператора информацию, касающуюся обработки его персональных данных.
            </li>
            <li>
              Требовать уточнения, блокирования или уничтожения своих персональных данных в случае,
              если они являются неполными, устаревшими, неточными или незаконно полученными.
            </li>
            <li>
              Отозвать согласие на обработку персональных данных, направив соответствующий запрос
              Оператору.
            </li>
          </ul>
          <p>
            Запросы направляются на Email{' '}
            <a href="mailto:darryp@yandex.ru" className="text-[#C6A75E] underline">darryp@yandex.ru</a>
            , ВКонтакте{' '}
            <a href="https://vk.com/niktonekruchee" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">vk.com/niktonekruchee</a>
            {' '}или Telegram{' '}
            <a href="https://t.me/nikto_ne_kruche_bot" target="_blank" rel="noopener noreferrer" className="text-[#C6A75E] underline">@nikto_ne_kruche_bot</a>
            . Срок ответа — 30 дней с момента получения запроса.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">9. Меры защиты данных</h2>
          <p>
            Оператор принимает необходимые технические и организационные меры для защиты
            персональных данных Пользователей от неправомерного или случайного доступа,
            уничтожения, изменения, блокирования, копирования и распространения.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-white font-semibold">10. Согласие</h2>
          <p>
            Используя сервис, Пользователь подтверждает, что ознакомлен с настоящей Политикой,
            выражает своё согласие с ней, включая трансграничную передачу данных, описанную в
            разделе 5, и принимает на себя указанные в ней права и обязанности.
            В случае несогласия с условиями Политики использование сервиса должно быть прекращено.
          </p>
        </section>

        <p className="text-xs text-white/40 pt-2">Дата актуализации: 3 октября 2026 г.</p>
      </div>
    </div>
  );
}
