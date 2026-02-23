# NNMC IT Project Board

Полнофункциональная система управления IT-проектами для медицинского центра.

## Особенности

- **Backend**: Strapi v5 + SQLite (порт 12005)
- **Frontend**: React + Vite + TailwindCSS (порт 13005)
- **Авторизация**: JWT, Email подтверждение, Reset Password
- **Роли**: Admin, Lead, Member (с разграничением прав)
- **Языки**: Русский / Казахский (i18n переключатель)
- **UI**: Медицина + IT тема (бирюзовый/синий)

## Быстрый старт

### Требования
- Node.js >= 20
- npm >= 6

### Локальный запуск

```bash
# 1. Клонируйте репозиторий
git clone <repository-url>
cd it-onlinereview

# 2. Запустите Backend (Strapi)
cd server
npm install
npm run develop
# Откройте http://192.168.101.25:12005/admin для настройки

# 3. В новом терминале запустите Frontend
cd frontend
npm install
npm run dev
# Откройте http://192.168.101.25:13005
```

### Docker запуск

```bash
# Продакшн
docker-compose up -d

# Разработка
docker-compose -f docker-compose.dev.yml up
```

## Структура проекта

```
├── server/                 # Strapi Backend
│   ├── config/            # Конфигурация сервера
│   ├── src/
│   │   ├── api/           # Content Types (API)
│   │   │   ├── department/
│   │   │   ├── project/
│   │   │   ├── task/
│   │   │   ├── board-stage/
│   │   │   ├── meeting-note/
│   │   │   └── analytics/  # Кастомный API аналитики
│   │   └── components/
│   ├── scripts/           # Seed скрипты
│   └── Dockerfile
│
├── frontend/              # React Frontend
│   ├── src/
│   │   ├── api/          # API клиенты
│   │   ├── components/   # UI компоненты
│   │   ├── i18n/         # Переводы RU/KZ
│   │   ├── layouts/      # Layouts
│   │   ├── pages/        # Страницы
│   │   ├── store/        # Zustand stores
│   │   └── types/        # TypeScript типы
│   └── Dockerfile
│
├── docker-compose.yml     # Продакшн compose
└── docker-compose.dev.yml # Dev compose
```

## API Endpoints

### Стандартные Strapi CRUD

- `GET/POST /api/projects` - Проекты
- `GET/POST /api/tasks` - Задачи
- `GET/POST /api/departments` - Отделы
- `GET/POST /api/board-stages` - Стадии канбана
- `GET/POST /api/meeting-notes` - Заметки планёрок

### Кастомные endpoints

- `GET /api/analytics/summary` - Аналитика для Dashboard

### Авторизация

- `POST /api/auth/local` - Вход
- `POST /api/auth/local/register` - Регистрация
- `POST /api/auth/forgot-password` - Восстановление пароля
- `POST /api/auth/reset-password` - Сброс пароля
- `GET /api/users/me` - Текущий пользователь

## Модели данных

### Department (Отдел)
- `key`: IT | DIGITALIZATION
- `name_ru`, `name_kz`

### Project (Проект)
- `title`, `description` (richtext)
- `department` (relation)
- `startDate`, `dueDate`
- `status`: ACTIVE | ARCHIVED
- `priorityLight`: GREEN | YELLOW | RED
- `responsibleUsers` (many-to-many)
- `manualStageOverride` (relation to BoardStage)
- `tasks`, `meetings` (one-to-many)

**Вычисляемые поля:**
- `progressPercent` = DONE tasks / total
- `overdue` = dueDate < today AND ACTIVE
- `dueSoon` = dueDate in next 3 days

### Task (Задача)
- `title`, `description`
- `project` (relation)
- `assignee` (user)
- `status`: TODO | IN_PROGRESS | DONE
- `dueDate`, `order`

### BoardStage (Стадия)
- `name_ru`, `name_kz`
- `minPercent`, `maxPercent`
- `order`, `color`

**Seed-данные (5 стадий):**
1. Начало (0-20%)
2. Планирование (20-40%)
3. В работе (40-60%)
4. Тестирование (60-80%)
5. Завершение (80-100%)

### MeetingNote (Планёрка)
- `text` (richtext)
- `project`, `author`
- `createdAt` (auto)

## Права доступа

| Действие | Admin | Lead | Member |
|----------|-------|------|--------|
| Просмотр проектов | ✅ | ✅ | ✅ |
| Создание проектов | ✅ | ✅ | ❌ |
| Редактирование | ✅ | ✅ | ❌ |
| Архивирование | ✅ | ✅ | ❌ |
| Drag & Drop | ✅ | ✅ | ❌ |
| Задачи CRUD | ✅ | ✅ | ❌ |
| Планёрки CRUD | ✅ | ✅ | ❌ |
| Настройки стадий | ✅ | ❌ | ❌ |

## Переменные окружения

### Backend (.env)

```env
# Server
HOST=0.0.0.0
PORT=12005

# Secrets
APP_KEYS=key1,key2,key3,key4
API_TOKEN_SALT=your-salt
ADMIN_JWT_SECRET=your-secret
JWT_SECRET=your-jwt-secret

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-app-password
SMTP_FROM=noreply@nnmc.kz

# CORS
FRONTEND_URL=http://192.168.101.25:13005
```

### Frontend (.env)

```env
VITE_API_URL=http://192.168.101.25:12005
VITE_FRONTEND_URL=http://192.168.101.25:13005
```

## Coolify Deployment

1. Создайте новый проект в Coolify
2. Добавьте репозиторий
3. Настройте сервисы:
   - Backend: `./server/Dockerfile`, порт 12005
   - Frontend: `./frontend/Dockerfile`, порт 13005
4. Добавьте environment variables
5. Настройте volumes для persistence:
   - `/app/.tmp` - SQLite база
   - `/app/public/uploads` - Загруженные файлы

## Первый запуск

1. Запустите backend (`npm run develop`)
2. Откройте http://192.168.101.25:12005/admin
3. Создайте первого Admin пользователя
4. Seed-данные создадутся автоматически
5. Настройте права в Settings → Users & Permissions → Roles

## Разработка

```bash
# Backend (режим разработки)
cd server
npm run develop

# Frontend (режим разработки)
cd frontend
npm run dev
```

## Лицензия

MIT
