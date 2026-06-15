# NNMC REST API for 1C

This directory contains the server-side code for a direct REST integration with
1C. It does not use `onec-bridge` or COMConnector.

## Employee endpoint

```http
GET /hs/nnmc/v1/employees?department=ОЦМК-2&year=2026&month=6&limit=1000
```

The endpoint reads employees from conducted
`ТабельУчетаРабочегоВремени.ДанныеОВремени` rows. This source is already
confirmed in the NNMC configuration and is appropriate for employees who
participate in KPI timesheets. It returns stable 1C reference UUIDs instead of
using FIO as an identifier.

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
- Use a dedicated read-only 1C account.
- Store the 1C username and password only in Coolify secrets.
- Do not call 1C directly from the frontend.
- Keep 1C authentication enabled for the publication.

## Configure server-kpi

Add these Coolify environment variables:

```env
ONEC_API_URL=https://onec.internal/base/hs/nnmc
ONEC_API_USER=nnmc_rest_reader
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
