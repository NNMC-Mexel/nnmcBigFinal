# Local setup

This local profile uses ports `1301` and up.

## Ports

| Port | Service |
| --- | --- |
| 1301 | PostgreSQL |
| 1302 | MinIO API |
| 1303 | MinIO Console |
| 1304 | Keycloak |
| 1305 | Main frontend |
| 1306 | `server` Strapi |
| 1307 | `server-kpi` Strapi |
| 1308 | `server-conf` Strapi |
| 1309 | `server-priemnaya` Strapi |
| 1310 | `server-signdoc` Strapi |
| 1311 | Standalone `client` frontend |

## Coolify to local mapping

| Coolify resource | Local folder | Local URL | Local DB |
| --- | --- | --- | --- |
| `frontend` | `frontend` | `http://localhost:1305` | - |
| `server-pm` | `server` | `http://localhost:1306` | `nnmc_board` |
| `server-kpi` | `server-kpi` | `http://localhost:1307` | `nnmc_kpi` |
| `server-conference` | `server-conf` | `http://localhost:1308` | `conference_rooms` |
| `server-priemnaya` | `server-priemnaya` | `http://localhost:1309` | `journal_priemnaya` |
| `server-sign-doc` | `server-signdoc` | `http://localhost:1310` | `nnmc_signdoc` |
| `keycloak` | Docker service | `http://localhost:1304` | internal Keycloak DB |
| MinIO | Docker service | `http://localhost:1302`, console `http://localhost:1303` | buckets `nnmc-main`, `nnmc-kpi`, `nnmc-signdoc` |

Coolify database card names can differ from the actual `DATABASE_NAME` used by Strapi. For local launch, the `.env` files in each backend folder are the source of truth.

## Docker prerequisite

Docker is required for PostgreSQL, MinIO, and Keycloak.

On macOS, the simplest option is Docker Desktop. With Homebrew/Colima:

```bash
brew install colima docker docker-compose
colima start --cpu 4 --memory 8
docker compose version
```

If `docker compose version` prints `docker: unknown command: docker compose`, add the Homebrew compose plugin path to Docker config:

```json
{
  "auths": {},
  "currentContext": "colima",
  "cliPluginsExtraDirs": [
    "/opt/homebrew/lib/docker/cli-plugins"
  ]
}
```

Then run:

```bash
docker compose version
```

## Start infrastructure

```bash
cd pmNNmc
npm run infra:up
```

Useful URLs:

- MinIO Console: `http://localhost:1303`
- Keycloak Admin: `http://localhost:1304` (`admin` / `admin`)

MinIO credentials:

- Access key: `nnmcminio`
- Secret key: `nnmcminio123`

PostgreSQL credentials:

- Host: `127.0.0.1`
- Port: `1301`
- User: `nnmc`
- Password: `nnmc_local_password`

Created databases:

- `nnmc_board`
- `nnmc_kpi`
- `conference_rooms`
- `journal_priemnaya`
- `nnmc_signdoc`

## Install dependencies

```bash
cd pmNNmc
npm install
cd frontend && npm install
cd ../server && npm install
cd ../server-kpi && npm install
cd ../server-conf && npm install
cd ../server-priemnaya && npm install
cd ../server-signdoc && npm install
cd ../client && npm install
```

## Start app

For the main frontend and all Strapi backends:

```bash
cd pmNNmc
npm run dev:local
```

Or run them separately:

```bash
npm run dev:local:frontend
npm run dev:local:server
npm run dev:local:kpi
npm run dev:local:conf
npm run dev:local:journal
npm run dev:local:signdoc
```

Open:

- Frontend: `http://localhost:1305`
- Main Strapi Admin: `http://localhost:1306/admin`
- KPI Strapi Admin: `http://localhost:1307/admin`
- Conference Strapi Admin: `http://localhost:1308/admin`
- Journal Strapi Admin: `http://localhost:1309/admin`
- SignDoc Strapi Admin: `http://localhost:1310/admin`

## Keycloak mode

The Keycloak container imports realm `nnmc` and client `pmnnmc-app`.

Local env files currently use `KEYCLOAK_ENABLED=false` and `VITE_KEYCLOAK_ENABLED=false` so that local Strapi email/password login works first. After creating Strapi users/roles and checking the basic app, enable SSO by changing these values to `true`:

- `server/.env`
- `server-kpi/.env`
- `server-conf/.env`
- `server-priemnaya/.env`
- `server-signdoc/.env`
- `frontend/.env.development.local`

Keycloak test user:

- Username: `local.admin`
- Password: `Admin123!`
