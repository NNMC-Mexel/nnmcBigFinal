# NNMC BPM Server

Separate Strapi backend for BPM modules.

## Current scope

- Employee cards synchronized from 1C REST API.
- Employee sync logs.
- Minimal BPM departments for access control.
- Keycloak SSO through `users-permissions` provider.
- Optional Keycloak account creation for synced employees.

## Auth model

The frontend should use `VITE_BPM_API_URL` and store the BPM token as `bpm_token`.
The token is received through the same Keycloak callback flow:

`/api/auth/keycloak/callback?access_token=<keycloak_access_token>`

For the first admin, set `BPM_SUPERADMIN_USERNAMES` to a comma-separated list of Keycloak usernames or emails.

## Required environment

Use `.env.example` as the deployment checklist. On production, set unique secret values and point `SERVER_URL`/`PUBLIC_URL` to the real BPM backend URL.
