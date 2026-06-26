import assert from 'node:assert/strict';
import test from 'node:test';

import extendUsersPermissions from '../src/extensions/users-permissions/strapi-server';

function createJwtService(userSessionVersion: number) {
  const plugin: any = {
    bootstrap: async () => {},
    controllers: {
      auth: () => ({}),
      user: () => ({}),
    },
    services: {
      jwt: () => ({
        issue: (payload: any) => payload,
        verify: async (token: string) => ({
          id: 1,
          sessionVersion: token === 'current' ? userSessionVersion : 0,
        }),
      }),
    },
  };

  extendUsersPermissions(plugin);

  const strapi: any = {
    config: {
      get: () => 'legacy-support',
    },
    db: {
      query: () => ({
        findOne: async () => ({ id: 1, sessionVersion: userSessionVersion }),
      }),
    },
  };

  return plugin.services.jwt({ strapi });
}

test('JWT issued before a password change is rejected', async () => {
  const jwt = createJwtService(1);
  await assert.rejects(jwt.verify('old'), /Invalid token/);
});

test('JWT issued for the current session version is accepted', async () => {
  const jwt = createJwtService(1);
  const payload = await jwt.verify('current');
  assert.equal(payload.sessionVersion, 1);
});

test('legacy JWT remains valid until the first password change', async () => {
  const jwt = createJwtService(0);
  const payload = await jwt.verify('old');
  assert.equal(payload.sessionVersion, 0);
});
