# BPM implementation memory

This note records how NNMC BPM was implemented and fixed, so future changes can continue from the same logic.

## Purpose

`server-bpm` is a separate Strapi backend for BPM processes inside the corporate portal.

The frontend entry point for employees and super admins is:

- `/app/bpm-requests`

Regular employees use it as a simple "My requests" page. Super admins use the same page as an overview of all BPM requests and workflow stages.

## Main services

- Frontend: `pmNNmc/frontend`
- BPM backend: `pmNNmc/server-bpm`
- 1C REST API base URL is configured by `ONEC_API_URL`
- Frontend talks to BPM backend through `VITE_BPM_API_URL`

Important production ports:

- Frontend: `13010`
- BPM backend: `12016`
- Keycloak: `12012`

## Keycloak and users without email

Employees log in through Keycloak by IIN username. Real email is not required.

Keycloak token may contain:

- `preferred_username`: employee IIN
- `given_name`
- `family_name`
- `name`
- no `email`

Strapi users-permissions normally requires OAuth email, so `server-bpm` synthesizes a local technical email only for Strapi user lookup/creation:

- format: `<iin>@bpm.local`

This email must not be shown as a real employee email in the frontend.

The same username-only Keycloak fallback was added to secondary services:

- `server-kpi`
- `server-conf`
- `server-priemnaya`
- `server-signdoc`

This prevents `400 Bad Request` from `/api/auth/keycloak/callback` when an employee has no email in Keycloak.

## Super admin

Super admins are configured by env:

```env
BPM_SUPERADMIN_USERNAMES=testnnmc
```

During `server-bpm` bootstrap and Keycloak callback, matching users are promoted with:

- `isSuperAdmin = true`

The current remembered super admin account is:

- `testnnmc`

## Employee cards

Employee cards are synchronized from 1C into `server-bpm`.

Important logic:

- login username is IIN;
- frontend must not show IIN as the visible profile identity;
- profile should show FIO, position and department from employee card;
- employee card data should not be manually edited from the profile screen;
- if a department from 1C does not exist, sync should create/store it;
- if an employee has multiple workplaces/personnel numbers, the primary workplace is used first, otherwise the first workplace is used.

## BPM request logic

Implemented request type:

- `VACATION`

The employee request form automatically uses employee card data:

- FIO
- position
- department
- organization
- personnel number
- IIN internally for matching with 1C

Vacation fields:

- vacation type
- start date
- end date
- calendar days
- replacement employee name
- manager name
- manager position
- comment

Created requests are stored in `bpm_requests`.

Main fields:

- `requestNumber`
- `type`
- `title`
- `status`
- `workflowStage`
- employee snapshot fields
- manager snapshot fields
- vacation fields
- `history`
- `onecPayload`
- `onecStatus`
- `onecDocumentNumber`
- `onecError`

## Workflow statuses

Current statuses:

- `DRAFT`
- `SUBMITTED`
- `MANAGER_REVIEW`
- `HR_REVIEW`
- `ACCOUNTING_REVIEW`
- `ONEC_PENDING`
- `ONEC_SENT`
- `COMPLETED`
- `REJECTED`
- `CANCELLED`

Manual super admin advance endpoint:

```http
POST /api/bpm-requests/:id/advance
```

Current manual route:

1. `DRAFT` -> `SUBMITTED`
2. `SUBMITTED` -> `MANAGER_REVIEW`
3. `MANAGER_REVIEW` -> `HR_REVIEW`
4. `HR_REVIEW` -> `ACCOUNTING_REVIEW`
5. `ACCOUNTING_REVIEW` -> `ONEC_PENDING`
6. `ONEC_SENT` -> `COMPLETED`

Important rule:

`ONEC_PENDING` must not advance manually to `ONEC_SENT`.

The status `ONEC_SENT` is only set after a real 1C API request succeeds.

## Sending to 1C

Endpoint:

```http
POST /api/bpm-requests/:id/send-to-1c
```

Allowed for:

- HR
- Accounting
- SuperAdmin

Configured endpoint:

```env
ONEC_API_URL=http://192.168.40.83/copy10062025-rest/hs/nnmc
```

Default vacation endpoint:

```text
${ONEC_API_URL}/v1/vacation-requests
```

Can be overridden by:

```env
ONEC_VACATION_REQUEST_URL=...
```

1C credentials:

```env
ONEC_API_USER=...
ONEC_API_PASSWORD=...
```

If 1C returns success:

- status becomes `ONEC_SENT` unless the request was already `COMPLETED`;
- `onecStatus = sent`;
- `onecDocumentNumber` is stored if returned by 1C;
- `onecError` is cleared;
- history gets `sent_to_1c`.

If 1C fails:

- `onecStatus = error`;
- `onecError` stores the error message;
- the frontend displays the error in the request card.

For already completed requests that were accidentally completed before real 1C send, the frontend still shows "Передать в 1С" if `onecDocumentNumber` is empty.

## Frontend behavior

Page:

- `frontend/src/pages/app/BpmMyRequestsPage.tsx`

For regular employees:

- title: "Мои заявки";
- request list is their own requests only;
- no internal BPM tree;
- no manual advance controls.

For reviewers/super admins:

- title: "BPM заявки";
- list shows all BPM requests;
- request cards show employee name, department, status, current stage, recent history;
- super admin sees "Далее" only on advanceable stages;
- "Передать в 1С" is separate from "Далее".

Frontend API:

- `frontend/src/api/bpmRequests.ts`

Key methods:

- `list()`
- `createVacation()`
- `advance()`
- `sendToOneC()`

## 1C integration principle

We integrate with 1C through an extension, not by editing the main 1C configuration.

Pattern:

1. Create 1C extension.
2. Add HTTP service `NNMC`.
3. Add URL templates and methods.
4. Publish extension on IIS.
5. Portal calls 1C REST API.
6. 1C searches documents/catalogs/registers internally.
7. 1C returns JSON or creates a draft document.

Known 1C base path:

```text
/copy10062025-rest/hs/nnmc
```

Known existing methods:

- `GET /v1/employees`
- `GET /v1/timesheets`
- `GET /v1/timesheet`
- `POST /v1/kpi-accruals`
- `GET /v1/employee-cards`

Vacation method being prepared:

- `POST /v1/vacation-requests`

1C vacation document target:

- `Документ.ОтпускаСотрудников`
- form: `Документ.ОтпускаСотрудников.Форма.ФормаДокумента`

Important 1C rule:

Do not guess object/requisite names. Always confirm exact names in Configurator:

- Document / Catalog / Register
- Data
- Requisites
- Tabular sections

## Deployment reminders

When changing frontend BPM UI:

- redeploy `frontend`

When changing BPM backend routes/controllers/permissions:

- redeploy `server-bpm`

When changing username-only Keycloak fallback for secondary services:

- redeploy affected backend service:
  - `server-kpi`
  - `server-conf`
  - `server-priemnaya`
  - `server-signdoc`

After auth-related changes:

- log out and log in again through Keycloak.

