# EventSeatBot — сводка проекта для ИИ

Краткое саммари всего продукта: что это, как устроено, где что лежит и что куда править.

---

## 1. Что за продукт

**EventSeatBot** — веб-приложение для продажи билетов на мероприятия (концерты, вечера). Работает как **Telegram Mini App** (WebApp): пользователь открывает бота в Telegram, видит события, выбирает стол/места, бронирует или оплачивает, смотрит «Мои билеты» и профиль.

**Роли:**
- **Гость** — смотрит события, бронирует/покупает места, видит свои билеты и гостевой профиль (стол, соседи, привилегии).
- **Организатор** — владелец события; в профиле видит дашборд: гости, обратный отсчёт, статистика (продано/свободно/заполнено), столы, прибыль, категории, VIP-гости, действия (карта, «посмотреть как гость»).
- **Админ** — полная админка: события, постеры, раскладка зала, брони, смена статусов, оплаты.

**Стек:**
- **Фронт:** React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion. Сборка — SPA, отдаётся статикой.
- **Бэкенд:** Node.js, Express. Хранилище — **Supabase (PostgreSQL)**. Авторизация — JWT (Telegram initData или dev-login).
- **Интеграции:** Telegram Bot (уведомления, команды), опционально платежи и генерация билетов.

---

## 2. Структура репозитория (где что лежит)

### Корень проекта
- `App.tsx` — корневой компонент: роутинг по экранам (`view`), состояние (события, выбранное событие/стол/места, брони, профиль), вызовы API, обёртка в `AppLayout` и нижнее меню.
- `index.html`, `index.css` — точка входа и глобальные стили (Tailwind, кастомные классы: `.event-details-cta`, `.font-luxury-event-title`, `.profile-organizer-premium` и т.д.).
- `types.ts` — общие типы: `EventData`, `Booking`, `Table`, `TicketCategory`, `Seat`, `TableModel` и др.
- `constants/uiText.ts` — все пользовательские строки (кнопки, заголовки, сообщения) для единого места правок текста.
- `config/api.ts` — базовый URL API (`getApiBaseUrl()`), в проде по умолчанию `https://eventseatbot.onrender.com`.

### Фронт: экраны и основные компоненты
- **Экраны (screens/):**
  - `ProfileScreen.tsx` — переключатель «гость / организатор»: загружает `getProfileGuestData` и `getProfileOrganizerData`, рендерит `ProfileGuestScreen` или `ProfileOrganizerScreen` (или скелетоны/ошибки).
  - `ProfileGuestScreen.tsx` — гостевой профиль: приветствие, имя, обратный отсчёт, «Ближайшее событие» (стол, места, категория), соседи, привилегии, приватный доступ. Стиль: премиум, без тяжёлых карточек.
  - `ProfileOrganizerScreen.tsx` — дашборд организатора: заголовок, счётчик гостей, шестерёнка (админка), обратный отсчёт, блок статистики/аналитики/категорий/VIP/действия. Данные приходят из `OrganizerStatsLazy` и др.

- **Ключевые компоненты (components/):**
  - `EventPage.tsx` — страница события: режим **preview** (афиша, заголовок, дата/локация, описание, кнопка «Купить билеты», параллакс hero, CTA-анимация) и режим **seatmap** (карта столов, легенда категорий, контакт организатора, итог и «Продолжить»).
  - `SeatMap.tsx` — карта зала: фон `layoutImageUrl`, столы (круги/прямоугольники), мини-карта, зум, выбор стола → переход к выбору мест.
  - `SeatPicker.tsx` — выбор мест за столом (сетка мест, занятые из `occupiedMap`), сохранение в `selectedSeatsByTable`.
  - `MyTicketsPage.tsx` — «Мои билеты»: список бронирований с фильтром (Все / Оплачено / Истекло), карточки билетов, кнопки «Я оплатил» / «Связаться с админом».
  - `BookingSuccessView.tsx` — экран после успешного бронирования: сообщение, подсказка про оплату, кнопка «Перейти к билетам».
  - `AdminPanel.tsx` — админка: список событий, CRUD событий, постеры, шаблон билета, загрузка раскладки зала, таблицы/категории, брони (смена статуса, отмена, подтверждение), контакт с организатором.

- **Профиль (components/profile/):**
  - `ProfileLayout.tsx` — обёртка профиля: отступы, фон (для организатора/гостя — тёмный + фиолетовое свечение).
  - `ProfileOrganizerScreen` использует: `OrganizerStatsLazy.tsx` (статистика, аналитика, категории), `CountdownCard.tsx` / `CountdownDisplay.tsx`, `ProfileAnimatedStack.tsx`, `ProfileCard.tsx`, `ProfileSectionSkeleton.tsx`, `CategoryBadge.tsx`.

- **UI (src/ui/):**
  - `Card`, `PrimaryButton`, `SectionTitle`, `BackHeader`, `ToastContext`, `PremiumGreetingModal`, `TicketModal`, `Skeleton` и т.д.

- **Лейаут (src/layout/):**
  - `AppLayout.tsx` — общая оболочка: скролл-контейнер (`data-app-scroll`), отступы, нижний nav; для премиум-тем — зерно и фон.
  - `BottomNav.tsx` — нижнее меню: События, Мои билеты, Профиль (и подсветка активного таба).

### Сервисы и конфиг фронта
- `services/storageService.ts` — **все вызовы API**: события (`getEvents`, `getEvent`), занятые места (`getOccupiedSeats`), брони (`getMyBookings`, `createSeatsBooking`, …), профили (`getProfileGuestData`, `getProfileOrganizerData`), тикеты (`getMyTickets`), контакт организатора, аватар и т.д.
- `services/authService.ts` — логин (Telegram / dev), хранение JWT, logout, заголовки авторизации.
- `design/theme.ts`, `design/elevation.ts`, `design/motion.ts` — токены дизайна (цвета, тени, длительности анимаций) для единообразия UI.
- `src/config/categoryColors.ts` — цвета категорий билетов (VIP, Gold, Silver, …), лейблы, градиенты; используется в картах, профиле, билетах.
- `src/utils/formatDate.ts`, `src/utils/getTablePrice.ts`, `src/utils/getCurrentUser.ts` и др. — утилиты.

### Бэкенд (backend/)
- **Точка входа:** `backend/src/server.ts` — Express, CORS, подключение роутов, Supabase, Telegram-нотификаторы, планировщик истечения броней.
- **Хранилище:** `backend/src/db/index.ts` → `backend/src/db-postgres.ts` — все запросы к Supabase (события, таблицы, брони, админы). Типы строк БД: `EventsRow`, `BookingsRow` и т.д.; маппинг в модели приложения.
- **Роуты (backend/src/routes/):**
  - **Публичные (publicEvents.ts):**  
    `GET /public/events`, `GET /public/events/:id`, `GET /public/events/:eventId/occupied-seats`,  
    `POST /public/bookings`, `POST /public/bookings/table`, `POST /public/bookings/seats`,  
    `GET /public/bookings/my?telegramId=`, `PATCH /public/bookings/:id/status`, `POST /public/bookings/:id/cancel`,  
    `POST /public/contact-organizer`, `GET /public/ticket/:id` и т.д.
  - **Авторизованные (me.routes.ts):**  
    `GET /me/user`, `GET /me/bookings`, `GET /me/tickets`,  
    `GET /me/profile-guest` (данные гостевого профиля),  
    `GET /me/profile-organizer?eventId=` (дашборд организатора: статистика, столы, категории, VIP-гости).
  - **Админ (adminEvents.ts, adminBookings.ts, admin.uploadLayout.ts, adminPayments.ts, publicPayments.ts):**  
    события CRUD, публикация, постер/билет/раскладка, брони (статусы, отмена, подтверждение), платежи.
  - **Авторизация (auth/auth.routes.ts):**  
    `POST /auth/telegram`, `POST /auth/dev-user-login`, `POST /auth/dev-admin-login`.

- **Домен и инфраструктура:**
  - `domain/bookings/` — логика бронирований, истечение, нотификации.
  - `domain/payments/` — платежи, подтверждение.
  - `infra/telegram/` — бот, уведомления в Telegram, команды.
  - `infra/scheduler/` — джоба истечения броней.

---

## 3. Где что делать (краткий чеклист для ИИ)

- **Изменить тексты в интерфейсе** → `constants/uiText.ts`; при необходимости подставить в компоненты уже существующие ключи.
- **Добавить/изменить экран или крупный блок** → либо новый компонент в `components/` или `screens/`, либо правка `App.tsx` (новый `view` или замена контента для существующего).
- **Изменить запросы к API (адреса, тело, разбор ответа)** → `services/storageService.ts`; типы ответов — при необходимости в `types.ts` или в типах рядом с сервисом.
- **Изменить логику «кто организатор / какой профиль показывать»** → `screens/ProfileScreen.tsx` (кто рендерится) и `src/utils/getCurrentUser.ts`; данные организатора считаются в `backend/src/routes/me.routes.ts` (GET profile-organizer).
- **Статистика организатора (продано, гости, столы, прибыль)** → бэкенд: `backend/src/routes/me.routes.ts` (подсчёт `eventBookings`, `totalGuests`, таблицы, категории, выручка); фронт: `components/profile/OrganizerStatsLazy.tsx` (отображение), при необходимости `ProfileOrganizerScreen.tsx`.
- **Карта зала, столы, занятые места** → компоненты `SeatMap.tsx`, `SeatPicker.tsx`; занятость — `getOccupiedSeats` в `storageService`, бэкенд `GET /public/events/:eventId/occupied-seats`; сохранение выбора — состояние в `App.tsx` (`selectedSeatsByTable`, `occupiedMap`).
- **Страница события (афиша, кнопка «Купить билеты», описание)** → `components/EventPage.tsx` (режим preview); стили hero/CTA/заголовка — также `index.css` (классы `.event-details-*`).
- **Мои билеты (список, фильтры, карточки)** → `components/MyTicketsPage.tsx`; данные — `getMyTickets` / брони из `storageService`.
- **Гостевой профиль (стол, соседи, привилегии)** → `screens/ProfileGuestScreen.tsx`; данные — `getProfileGuestData` в `storageService`, бэкенд `GET /me/profile-guest`.
- **Админка (события, брони, статусы)** → `components/AdminPanel.tsx`; API — роуты в `adminEvents.ts`, `adminBookings.ts`.
- **Цвета категорий билетов (VIP, Gold и т.д.)** → `src/config/categoryColors.ts`; использование — везде, где показываются категории (карта, билеты, профиль).
- **Стили премиум/тёмной темы** → `index.css` (классы `.event-details-premium`, `.profile-organizer-premium`, `.my-tickets-premium`, `.font-luxury-event-title` и др.), при необходимости `design/theme.ts` и компоненты с Tailwind.
- **Бэкенд: добавление поля в ответ или расчёт** → соответствующий роут в `backend/src/routes/`; работа с БД — `backend/src/db-postgres.ts` (и при необходимости типы в `backend/src/models.ts`).
- **Авторизация (JWT, Telegram)** → `services/authService.ts` (фронт), `backend/src/auth/` (мидлварь, роуты логина).

---

## 4. Важные потоки данных

1. **Открытие приложения**  
   `App.tsx` → проверка Telegram / dev-login → загрузка событий (`getEvents`) → список событий или одно главное (featured). Нижнее меню ведёт на События / Мои билеты / Профиль.

2. **Выбор события и бронирование**  
   Клик по событию → `setSelectedEventId`, загрузка `getEvent` + `getOccupiedSeats` → `EventPage` (preview) → «Купить билеты» → `EventPage` (seatmap) → выбор стола в `SeatMap` → выбор мест в `SeatPicker` → отправка `createSeatsBooking` → переход на `BookingSuccessView` или в «Мои билеты».

3. **Профиль**  
   По роли вызывается `getProfileGuestData` или `getProfileOrganizerData`; роли определяются через `getCurrentUser` (organizerId события, админ, иначе гость). Организатору отдаётся событие с максимальным числом бронирований (если не передан явный `eventId`).

4. **Статистика организатора**  
   В `GET /me/profile-organizer` считаются брони по выбранному событию (`eventBookings`), по ним — гости, занятость столов, выручка; ответ уходит в `OrganizerStatsLazy` и отображается как «Продано», «Свободно», «Заполнено», аналитика, категории.

---

## 5. Запуск и окружение

- **Фронт:** `npm run dev` (Vite); прод — `npm run build`, раздача статики.
- **Бэкенд:** из папки `backend` — установка зависимостей, при необходимости `npm run build`, запуск сервера (порт из `PORT` или 4000). Нужны переменные: Supabase (URL, ключ), при использовании бота — Telegram token и админский chat id, при платежах — свои переменные.
- **API URL для фронта:** задаётся через `config/api.ts` и при необходимости `VITE_API_BASE_URL` / `VITE_API_PREVIEW_BASE_URL`; по умолчанию прод — `https://eventseatbot.onrender.com`.

---

Этого достаточно, чтобы объяснить другому ИИ суть проекта, где искать экраны, API, статистику и куда вносить правки под задачу.
