import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthOptions,
  createAuthClientPlugins,
  createAuthEmailSenderOptions,
  createAuthServerPlugins,
  defineAuthConfig,
  getAppRolesForUser,
  isAppBannedUser,
  resolveAuthBaseURL,
  resolveAuthSecret,
  resolveRouteAccess,
  shouldRedirectSignOutRequest,
  userHasAppPermission,
} from '../src/auth/index.js';
import type { AuthEmailSender, SendEmailInput } from '../src/email/index.js';

const authConfig = defineAuthConfig({
  routes: {
    authApiPrefix: '/api/auth',
    loginPath: '/login',
    protectedExactPaths: ['/dashboard'],
    protectedPrefixes: [],
    adminExactPaths: ['/admin'],
    adminPrefixes: ['/admin/'],
    adminPermission: { app: ['administer'] },
  },
  roles: {
    roles: ['admin', 'moderator', 'user', 'banned'],
    defaultRole: 'user',
    adminRoles: ['admin'],
    appStatements: ['access', 'moderate', 'administer'],
    roleAppPermissions: {
      admin: ['access', 'moderate', 'administer'],
      moderator: ['access', 'moderate'],
      user: ['access'],
      banned: [],
    },
    bannedSessionError: {
      code: 'BANNED_USER',
      message:
        'Your account has been suspended. Please contact support if you believe this is an error.',
    },
  },
  browser: {
    defaultErrorMessage:
      "We couldn't complete that request. Check the fields and try again.",
  },
});

describe('auth config helpers', () => {
  it('derives Better Auth admin plugins from declarative app policy', () => {
    expect(authConfig.routes.loginPath).toBe('/login');
    expect(authConfig.roles.roles).toEqual([
      'admin',
      'moderator',
      'user',
      'banned',
    ]);
    expect(createAuthServerPlugins(authConfig).map((plugin) => plugin.id)).toContain(
      'admin',
    );
    expect(createAuthClientPlugins(authConfig).map((plugin) => plugin.id)).toContain(
      'admin-client',
    );
  });

  it('normalizes roles and evaluates app permissions', () => {
    expect(getAppRolesForUser(authConfig, { role: 'admin,moderator' })).toEqual([
      'admin',
      'moderator',
    ]);
    expect(getAppRolesForUser(authConfig, { role: 'unknown' })).toEqual([
      'user',
    ]);
    expect(isAppBannedUser(authConfig, { role: 'banned' })).toBe(true);
    expect(isAppBannedUser(authConfig, { role: 'user', banned: true })).toBe(
      true,
    );
    expect(
      userHasAppPermission(authConfig, { role: 'moderator' }, {
        app: ['moderate'],
      }),
    ).toBe(true);
    expect(
      userHasAppPermission(authConfig, { role: 'moderator' }, {
        user: ['list'],
      }),
    ).toBe(false);
  });
});

describe('auth route helpers', () => {
  it('resolves public, protected, admin, and banned route access', () => {
    expect(resolveRouteAccess(authConfig, '/', false)).toEqual({
      type: 'allow',
    });
    expect(resolveRouteAccess(authConfig, '/dashboard', false)).toEqual({
      type: 'redirect',
      location: '/login?redirectTo=%2Fdashboard',
    });
    expect(
      resolveRouteAccess(authConfig, '/dashboard', {
        isAuthenticated: true,
        user: { role: 'banned' },
      }),
    ).toEqual({ type: 'forbidden' });
    expect(
      resolveRouteAccess(authConfig, '/admin/users', {
        isAuthenticated: true,
        user: { role: 'admin' },
      }),
    ).toEqual({ type: 'allow' });
  });

  it('detects HTML sign-out form posts without changing JSON API behavior', () => {
    expect(
      shouldRedirectSignOutRequest(
        authConfig,
        new Request('https://vk.example.com/api/auth/sign-out', {
          method: 'POST',
          headers: { accept: 'text/html' },
        }),
      ),
    ).toBe(true);
    expect(
      shouldRedirectSignOutRequest(
        authConfig,
        new Request('https://vk.example.com/api/auth/sign-out', {
          method: 'POST',
          headers: { accept: 'application/json' },
        }),
      ),
    ).toBe(false);
  });
});

describe('Better Auth server helpers', () => {
  it('builds Better Auth options with email/password, admin plugin, email hooks, and extension hooks', async () => {
    const sent: SendEmailInput[] = [];
    const authEmail: AuthEmailSender = {
      sendVerificationEmail: async (input) => {
        sent.push({
          to: input.to,
          from: 'accounts@example.com',
          subject: 'Verify',
          html: input.url,
          text: input.url,
        });
      },
      sendResetPasswordEmail: async (input) => {
        sent.push({
          to: input.to,
          from: 'accounts@example.com',
          subject: 'Reset',
          html: input.url,
          text: input.url,
        });
      },
    };
    const customPlugin = { id: 'custom-plugin' };
    const options = buildAuthOptions({
      database: {},
      schema: {},
      authConfig,
      baseURL: 'https://vk.example.com',
      secret: 'test-secret-with-at-least-32-characters',
      authEmail,
      additionalPlugins: [customPlugin],
      extendOptions: (baseOptions) => ({
        ...baseOptions,
        trustedOrigins: ['https://admin.vk.example.com'],
      }),
    });

    expect(options.baseURL).toBe('https://vk.example.com');
    expect(options.secret).toBe('test-secret-with-at-least-32-characters');
    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(options.plugins?.map((plugin) => plugin.id)).toEqual([
      'admin',
      'custom-plugin',
    ]);
    expect(options.trustedOrigins).toEqual(['https://admin.vk.example.com']);

    await options.emailVerification?.sendVerificationEmail?.({
      user: userFixture,
      token: 'verify-token',
      url: 'https://vk.example.com/verify-email?token=verify-token',
    });
    await options.emailAndPassword?.sendResetPassword?.({
      user: userFixture,
      token: 'reset-token',
      url: 'https://vk.example.com/reset-password/reset-token',
    });

    expect(sent).toEqual([
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Verify',
        html: 'https://vk.example.com/verify-email?token=verify-token',
      }),
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Reset',
        html: 'https://vk.example.com/reset-password/reset-token',
      }),
    ]);
  });

  it('blocks Better Auth session creation for banned app users', async () => {
    const options = buildAuthOptions({
      database: {},
      schema: {},
      authConfig,
      baseURL: 'https://vk.example.com',
      secret: 'test-secret-with-at-least-32-characters',
    });
    const beforeSessionCreate = options.databaseHooks?.session?.create?.before;
    const findUserById = vi.fn(async () => ({
      ...userFixture,
      role: 'banned',
      banned: false,
    }));

    expect(beforeSessionCreate).toBeTypeOf('function');
    await expect(
      beforeSessionCreate!(
        {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          expiresAt: new Date(),
          token: 'session-token',
        },
        {
          context: {
            internalAdapter: {
              findUserById,
            },
          },
        } as unknown as Parameters<NonNullable<typeof beforeSessionCreate>>[1],
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      body: {
        code: 'BANNED_USER',
      },
    });
  });

  it('resolves runtime env values and auth email sender options', () => {
    expect(
      resolveAuthBaseURL(
        { BETTER_AUTH_URL: 'https://auth.example.com/' },
        new Request('https://vk.example.com/dashboard'),
      ),
    ).toBe('https://auth.example.com');
    expect(
      resolveAuthBaseURL({}, new Request('https://vk.example.com/dashboard')),
    ).toBe('https://vk.example.com');
    expect(resolveAuthSecret({ BETTER_AUTH_SECRET: ' configured-secret ' })).toBe(
      'configured-secret',
    );
    expect(() => resolveAuthSecret({})).toThrow('BETTER_AUTH_SECRET is required');

    const emailOptions = createAuthEmailSenderOptions({
      fallbackFromName: 'VK',
      renderVerificationEmail: async () => ({
        subject: 'Verify',
        html: '',
        text: '',
      }),
      renderResetPasswordEmail: async () => ({
        subject: 'Reset',
        html: '',
        text: '',
      }),
    });

    expect(emailOptions.fallbackFromName).toBe('VK');
    expect(emailOptions.renderVerificationEmail).toBeTypeOf('function');
    expect(emailOptions.renderResetPasswordEmail).toBeTypeOf('function');
  });
});

const userFixture = {
  id: 'user_1',
  name: 'Ada',
  email: 'ada@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  updatedAt: new Date('2026-06-19T00:00:00.000Z'),
};
