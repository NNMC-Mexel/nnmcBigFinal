Короткие инструкции для AI-агентов — репозиторий NNMC IT Project Board

Цель: быстро ввести агента в архитектуру, рабочие сценарии и проектные соглашания.

- Кратко об архитектуре:
  - Монорепо: `frontend/` (React + Vite) и `server/` (Strapi v5).
  - Фронтенд общается с бэкендом через REST API по базовому URL `VITE_API_URL` (см. `frontend/src/api/client.ts`).
  - Аутентификация через JWT: токен хранится в `localStorage` или `sessionStorage` под ключом `jwt`.

- Ключевые команды:
  - Фронтенд (в `frontend/`): `npm install`, `npm run dev` (vite — порт 13004), `npm run build`, `npm run preview`.
  - Сервер (в `server/`): `npm install`, `npm run develop` (или `npm run dev`), `npm run build`, `npm run start`, `npm run seed` (запустить initial seed).
  - Docker (dev): `docker-compose -f docker-compose.dev.yml up` — полезно для локальной интеграции.

- Важные файлы/точки входа (чтобы быстро ориентироваться):
  - `frontend/src/api/client.ts` — axios-клиент, baseURL и interceptor для JWT и 401-редиректа.
  - `frontend/src/store/authStore.ts` — Zustand store с persist; метод `login` сохраняет JWT в `localStorage`/`sessionStorage`.
  - `frontend/src/pages/auth/LoginPage.tsx` — пример использования `useAuthStore` и «запомнить email».
  - `server/package.json` — скрипты Strapi и требуемый Node engine (>=20).
  - `server/scripts/seed.js|.ts` и `server/src/index.ts` — автозапуск seed при первом старте.
  - `server/config/server.ts` — порт по умолчанию `12004` и переменные окружения.

- Поведенческие паттерны и соглашения в проекте:
  - State: используется `zustand` (см. `frontend/src/store/*`); магазины могут быть persisted через `persist` middleware.
  - API: все запросы идут через `frontend/src/api/*` (пример: `auth.ts`, `projects.ts`) и используют `client` с префиксом `/api`.
  - Роли и права: helper `useUserRole` внутри `authStore.ts` вычисляет `isAdmin`, `isLead`, `isMember` и детальные права — изучайте его для логики отображения/доступа.
  - i18n: `react-i18next` — локали в `frontend/src/i18n/locales`.
  - Assets/uploads: серверные файлы загружаются в `server/public/uploads`.

- Интеграция и внешние зависимости:
  - Бэкенд — Strapi v5 с провайдером `better-sqlite3` по умолчанию в dev.
  - Фронтенд — Vite + React + Zustand; drag&drop через `@dnd-kit`.
  - Переменные окружения: смотрите `env.example` в корне и `server/config/server.ts`.

- Что важно для правок кода/фиксов:
  - При изменении API — обновляйте `frontend/src/api/*` и проверьте `client` (авторизация, baseURL).
  - Изменение авторизации: проверьте `useAuthStore` и поведение interceptor'а (удаление токена при 401).
  - Seed-скрипт запускается автоматически при пустой БД (см. `server/src/index.ts`), но можно запускать вручную `npm run seed` в `server/`.

- Примеры часто встречующихся задач (быстрые подсказки):
  - Добавил API route в Strapi → обновить / проверить `server/migrations` и seed при необходимости.
  - Новое поле в user → обновить `authStore` (получение `getMe`) и UI-формы.

- Контекст для тестирования/отладки:
  - Логи Strapi видны в консоли при `npm run develop`.
  - Фронтенд доступен на `http://localhost:13004` по умолчанию.

Если нужна более детальная секция (CI, secrets, ветвления, правила PR), напишите, что добавить или показать — адаптирую содержимое.
