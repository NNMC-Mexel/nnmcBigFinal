# 1C Employee Directory

Configure these variables in Coolify for the main `server` service:

```env
ONEC_API_URL=http://192.168.40.83/copy10062025-rest/hs/nnmc
ONEC_API_USER=Администратор
ONEC_API_PASSWORD=change-me
ONEC_API_TIMEOUT_MS=120000
ONEC_EMPLOYEE_PAGE_SIZE=200
EMPLOYEE_SYNC_ENABLED=true
EMPLOYEE_SYNC_HOUR_UTC=2
```

`EMPLOYEE_SYNC_HOUR_UTC=2` means 07:00 in Kazakhstan (UTC+5).

The scheduled synchronization:

- reads `/v1/employee-cards` page by page;
- stores one card per IIN;
- keeps all workplaces and personnel numbers in the card;
- updates only changed cards;
- marks missing cards inactive without deleting history;
- does not create Keycloak accounts automatically.

SuperAdmin and HR can also start a manual synchronization from the employee
directory page. Accounting has read access but cannot start synchronization.
