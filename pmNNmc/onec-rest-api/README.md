# NNMC REST API for 1C

This directory contains the server-side code for a direct REST integration with
1C. It does not use `onec-bridge` or COMConnector.

`NNMCHttpServiceModule.bsl` is the complete generated module for HTTP service
`NNMC`. When applying an update, replace the complete 1C module with this file.
Run `node build-module.js` after changing any source handler file.

## Employee endpoint

```http
GET /hs/nnmc/v1/employees?department=ОЦМК-2&year=2026&month=6&limit=1000
```

## Timesheet endpoints

```http
GET /hs/nnmc/v1/timesheets?department=ОЦМК-2&year=2026&month=6
GET /hs/nnmc/v1/timesheet?id=<1C document UUID>
```

Add URL templates `/v1/timesheets` and `/v1/timesheet` to the same HTTP service.
Add GET methods with handlers `TimesheetsGET` and `TimesheetGET`, then append
[TimesheetHttpServiceHandlers.bsl](./TimesheetHttpServiceHandlers.bsl) to the
existing HTTP service module. These endpoints let `server-kpi` load timesheets
directly from 1C without `onec-bridge`.

## KPI accrual endpoint

```http
POST /hs/nnmc/v1/kpi-accruals
Content-Type: application/json
```

Add URL template `/v1/kpi-accruals` and POST handler `KpiAccrualPOST`, then append
[KpiAccrualHttpServiceHandler.bsl](./KpiAccrualHttpServiceHandler.bsl) to the
HTTP service module. The handler validates all employees first and creates an
unposted `РазовоеНачисление` document with accrual type `KPI`.

The endpoint reads employees from conducted
`ТабельУчетаРабочегоВремени.ДанныеОВремени` rows. This source is already
confirmed in the NNMC configuration and is appropriate for employees who
participate in KPI timesheets. It returns stable 1C reference UUIDs instead of
using FIO as an identifier.

## BPM vacation request endpoint

```http
POST /hs/nnmc/v1/vacation-requests
Content-Type: application/json
```

Add URL template `/v1/vacation-requests` and POST handler
`VacationRequestPOST`, then replace the HTTP service module with the generated
[`NNMCHttpServiceModule.bsl`](./NNMCHttpServiceModule.bsl).

The endpoint accepts vacation requests from `server-bpm` and creates an
unposted `Документ.Отпуск` draft. It fills the safest shared fields
(`Дата`, `Месяц`, `Организация`, `Сотрудник`, vacation dates and day count)
and stores the full BPM payload in `Комментарий` with marker `[NNMC-BPM]`.
Duplicate requests are detected by `requestNumber`.

`server-bpm` sends this endpoint automatically when `ONEC_API_URL` points to
the HTTP service root:

```env
ONEC_API_URL=http://192.168.40.83/copy10062025-rest/hs/nnmc
```

You can override the exact URL if needed:

```env
ONEC_VACATION_REQUEST_URL=http://192.168.40.83/copy10062025-rest/hs/nnmc/v1/vacation-requests
```

Example payload:

```json
{
  "documentForm": "Документ.Отпуск.Форма.ФормаДокумента",
  "source": "NNMC BPM",
  "requestNumber": "BPM-2026-000001",
  "employee": {
    "employeeId": "4d7f0bd1-...",
    "iin": "000000000000",
    "fio": "Иванов Иван Иванович",
    "personnelNumber": "1234",
    "position": "врач",
    "departmentId": "2ff251b6-...",
    "department": "ОЦМК-2",
    "organizationId": "8f7f0bd1-...",
    "organization": "АО Национальный научный медицинский центр"
  },
  "manager": {
    "name": "Петров Петр Петрович",
    "position": "руководитель отдела",
    "department": "ОЦМК-2"
  },
  "vacation": {
    "type": "Ежегодный оплачиваемый отпуск",
    "startDate": "2026-07-01",
    "endDate": "2026-07-14",
    "calendarDays": 14,
    "replacementEmployeeName": "Сидоров Сидор Сидорович",
    "comment": "Плановый отпуск"
  }
}
```

Example response:

```json
{
  "items": [
    {
      "id": "4d7f0bd1-...",
      "fio": "Иванов Иван Иванович",
      "departmentId": "2ff251b6-...",
      "department": "ОЦМК-2",
      "positionId": "27b2394f-...",
      "position": "санитарка",
      "categoryId": "c2cf7be0-...",
      "category": "ММП",
      "organization": "АО Национальный научный медицинский центр",
      "active": true
    }
  ],
  "meta": {
    "year": 2026,
    "month": 6,
    "department": "ОЦМК-2",
    "count": 1,
    "source": "ТабельУчетаРабочегоВремени.ДанныеОВремени"
  }
}
```

## Create the 1C extension

1. Create extension `NNMCIntegrationAPI`. Keep the vendor configuration
   unchanged.
2. Add HTTP service `NNMC` with root URL `nnmc`.
3. Add URL template `/v1/employees`.
4. Add GET method and set handler to `EmployeesGET`.
5. Paste [EmployeesHttpServiceModule.bsl](./EmployeesHttpServiceModule.bsl)
   into the HTTP service module.
6. Publish the test database on internal IIS and enable HTTP services.
7. Create a dedicated 1C user that can only read conducted timesheets and their
   referenced employee, department, position, category, and organization data.

## Production security

- Publish only through HTTPS.
- Allow access only from the `server-kpi`/Coolify host at the firewall or IIS.
- Use dedicated 1C accounts: read-only for employee/KPI reads, and a restricted
  writer account for BPM vacation drafts with permission to create unposted
  `Документ.Отпуск`.
- Store the 1C username and password only in Coolify secrets.
- Do not call 1C directly from the frontend.
- Keep 1C authentication enabled for the publication.

## Configure server-kpi

Add these Coolify environment variables:

```env
ONEC_API_URL=https://onec.internal/base/hs/nnmc
ONEC_API_USER=nnmc_rest_reader_or_bpm_writer
ONEC_API_PASSWORD=secret
ONEC_API_TIMEOUT_MS=30000
```

Then `server-kpi` exposes:

```http
GET /api/onec-employees?department=ОЦМК-2&year=2026&month=6
Authorization: Bearer <KPI JWT>
```

`server-kpi` checks the KPI user's department access before calling 1C.

## Important limitation

This first endpoint returns employees present in a conducted timesheet for the
requested month. For a complete HR employee directory, including employees who
have no timesheet yet, the query must later be moved to the configuration's
actual current-employment register. Its metadata name must be confirmed in the
1C configurator before implementing that version.
