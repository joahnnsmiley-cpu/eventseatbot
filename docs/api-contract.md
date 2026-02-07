# EventSeatBot — API Contract

## Общие принципы
- Admin API и Public API — разные домены
- Разные response shape — это осознанное решение
- Admin-domain допускает draft / partially configured events
- Publish не валидирует «готовность», только статус

---

## Admin API

### GET /admin/events/:id

**Назначение:**  
Получение события в admin-домене для редактирования

**Response shape (JSON):**
- id: string
- title: string
- description: string
- date: string
- imageUrl: string
- schemaImageUrl: string | null
- tables: Table[]
- paymentPhone: string
- maxSeatsPerBooking: number
- status: "draft" | "published" | "archived" | undefined

Admin API работает с полной моделью EventData.
status возвращается и считается допустимой частью admin-домена.
Это НЕ UI-проекция, а рабочий доменный API.

---

### POST /admin/events

**Назначение:**  
Создание события в статусе draft

**Response:**  
Минимальный объект (id, title, description, date), НЕ полный EventData.  
Это историческая/техническая асимметрия: frontend не должен ожидать полный EventData после создания.  
Для получения полной модели используется GET /admin/events/:id.

---

### PUT /admin/events/:id

**Назначение:**  
Обновление события (draft или partially configured)

**Ограничения:**
- Нет валидации «полноты» события
- После publish любые изменения запрещены (403)

---

### POST /admin/events/:id/publish

**Назначение:**  
Публикация события

**Инварианты:**
- событие должно существовать
- status === "draft"
- НЕТ других скрытых проверок

**Response:**  
200 OK, возвращается полный EventData.  
409, если событие уже опубликовано или находится не в draft.

---

## Public API

### GET /events/:id

**Назначение:**  
Технический / internal endpoint. Может вернуть draft и не гарантирует публичность.

**Response shape (JSON):**
- id
- title
- description
- date
- imageUrl
- schemaImageUrl
- tables
- status
- paymentPhone
- maxSeatsPerBooking

Этот endpoint НЕ фильтрует draft (возвращает любые события).

---

### GET /public/events/:id

**Назначение:**  
Публичный read-only endpoint. Возвращает ТОЛЬКО published события.

**Response shape (JSON):**
- id
- title
- description
- date
- coverImageUrl
- schemaImageUrl
- tables

---

## Общие структуры

### Table
- id
- number
- seatsTotal
- seatsAvailable
- centerX
- centerY
- shape

### Seat
- id
- number
- status
- price
- lockedAt?
- bookedBy?
- ticketImagePath?

Seat.status — доменное состояние, используется для бронирований и блокировок.  
Это не UI-статус кнопки.

---

## Изображения

- imageUrl — афиша / превью события
- schemaImageUrl — схема зала
- оба поля nullable (schemaImageUrl может быть null после миграции, imageUrl может быть пустой строкой)
- используются независимо

---

## Примечания

- Контракт подтверждён тестами:
  - admin.event.crud.test.ts
  - public.events.read.test.ts
- Тесты подстраиваются под API, а не наоборот
