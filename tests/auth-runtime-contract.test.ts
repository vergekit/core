import { describe, expect, it, vi } from 'vitest';

const { drizzleAdapterMock } = vi.hoisted(() => ({
  drizzleAdapterMock: vi.fn(() => vi.fn()),
}));

vi.mock('@better-auth/drizzle-adapter', () => ({
  drizzleAdapter: drizzleAdapterMock,
}));

import { buildAuthOptions, defineAuthConfig } from '../src/auth/index.js';

const authConfig = defineAuthConfig({
  routes: {
    authApiPrefix: '/api/auth',
    loginPath: '/login',
    protectedExactPaths: [],
    protectedPrefixes: [],
    adminExactPaths: [],
    adminPrefixes: [],
    adminPermission: { app: ['administer'] },
  },
  roles: {
    roles: ['admin', 'user'],
    defaultRole: 'user',
    adminRoles: ['admin'],
    appStatements: ['administer'],
    roleAppPermissions: {
      admin: ['administer'],
      user: [],
    },
    bannedSessionError: {
      code: 'BANNED_USER',
      message: 'This account is banned.',
    },
  },
  browser: {
    defaultErrorMessage: 'Authentication failed.',
  },
});

describe('Better Auth database provider contract', () => {
  it('forwards the MySQL provider to the Better Auth Drizzle adapter', () => {
    const database = {};
    const schema = {};

    buildAuthOptions({
      database,
      schema,
      authConfig,
      baseURL: 'https://node.example.com',
      secret: 'test-secret-with-at-least-32-characters',
      drizzle: { provider: 'mysql' },
    });

    expect(drizzleAdapterMock).toHaveBeenCalledOnce();
    expect(drizzleAdapterMock).toHaveBeenCalledWith(database, {
      provider: 'mysql',
      schema,
    });
  });
});
