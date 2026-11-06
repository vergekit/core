import { describe, expect, it, vi } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createEmailVerificationToken } from 'better-auth/api';
import { createAuth, defineAuthConfig } from '../src/auth/index.js';

const baseURL = 'https://vk.example.com';
const secret = 'test-secret-with-at-least-32-characters';
const password = 'test-password-123';
const authConfig = defineAuthConfig({
  routes: { authApiPrefix: '/api/auth', loginPath: '/login', protectedExactPaths: ['/account'], protectedPrefixes: [], adminExactPaths: [], adminPrefixes: [], adminPermission: { app: ['administer'] } },
  roles: {
    roles: ['admin', 'user', 'banned'], defaultRole: 'user', adminRoles: ['admin'], appStatements: ['administer'],
    roleAppPermissions: { admin: ['administer'], user: [], banned: [] },
    bannedSessionError: { code: 'BANNED_USER', message: 'This account is banned.' },
  },
  browser: { defaultErrorMessage: 'Authentication failed.' },
});

async function fixture() {
  const mail = vi.fn();
  const auth = createAuth({
    database: {}, schema: {}, authConfig, baseURL, secret,
    extendOptions: options => ({
      ...options,
      advanced: { disableOriginCheck: false },
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailVerification: { ...options.emailVerification, sendVerificationEmail: mail },
    }),
  });
  const context = await auth.$context;
  const signup = await auth.api.signUpEmail({ body: { name: 'Account holder', email: 'old@example.com', password } });
  await context.internalAdapter.updateUser(signup.user.id, { emailVerified: true });
  const login = await auth.api.signInEmail({ body: { email: 'old@example.com', password }, returnHeaders: true });
  const cookie = login.headers.getSetCookie().find(value => value.includes('.session_token='))!.split(';')[0];
  mail.mockClear();
  const change = (newEmail: string, headers: Record<string, string> = { cookie }) => auth.handler(new Request(`${baseURL}/api/auth/change-email-direct`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: baseURL, ...headers },
    body: JSON.stringify({ newEmail }),
  }));
  return { auth, context, userId: signup.user.id, cookie, token: login.response.token, mail, change };
}

describe('direct account email changes', () => {
  it('updates and trusts an unused address without a password or email link', async () => {
    const { auth, context, userId, cookie, token, mail, change } = await fixture();
    const other = await auth.api.signInEmail({ body: { email: 'old@example.com', password } });
    const response = await change(' NEW@EXAMPLE.COM ');
    expect(response.status).toBe(200);
    expect(await context.internalAdapter.findUserById(userId)).toMatchObject({ email: 'new@example.com', emailVerified: true });
    expect(mail).not.toHaveBeenCalled();
    expect(await context.internalAdapter.findSession(other.token)).toBeNull();
    expect(await context.internalAdapter.findSession(token)).not.toBeNull();
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.email).toBe('new@example.com');
    await expect(auth.api.signInEmail({ body: { email: 'new@example.com', password } })).resolves.toHaveProperty('token');
    await expect(auth.api.signInEmail({ body: { email: 'old@example.com', password } })).rejects.toBeDefined();
  });

  it('does not require a fresh login for an otherwise valid session', async () => {
    const { context, token, change } = await fixture();
    await context.adapter.update({ model: 'session', where: [{ field: 'token', value: token }], update: { createdAt: new Date(Date.now() - 2 * 86400_000) } });
    expect((await change('new@example.com')).status).toBe(200);
  });

  it('rejects another account’s address and keeps both accounts unchanged', async () => {
    const { auth, context, userId, change } = await fixture();
    const other = await auth.api.signUpEmail({ body: { name: 'Other', email: 'taken@example.com', password } });
    const response = await change('TAKEN@example.com');
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('EMAIL_ALREADY_IN_USE');
    expect((await context.internalAdapter.findUserById(userId))?.email).toBe('old@example.com');
    expect((await context.internalAdapter.findUserById(other.user.id))?.email).toBe('taken@example.com');
  });

  it('handles a duplicate detected by the database after the initial availability check', async () => {
    const { auth, context, userId, change } = await fixture();
    await auth.api.signUpEmail({ body: { name: 'Other', email: 'taken@example.com', password } });
    vi.spyOn(context.internalAdapter, 'findUserByEmail').mockResolvedValueOnce(null);
    vi.spyOn(context.internalAdapter, 'updateUser').mockRejectedValueOnce(new Error('unique constraint'));
    expect((await change('taken@example.com')).status).toBe(409);
    expect((await context.internalAdapter.findUserById(userId))?.email).toBe('old@example.com');
  });

  it('allows keeping the current address without revoking sessions', async () => {
    const { auth, context, change } = await fixture();
    const other = await auth.api.signInEmail({ body: { email: 'old@example.com', password } });
    expect((await change('OLD@example.com')).status).toBe(200);
    expect(await context.internalAdapter.findSession(other.token)).not.toBeNull();
  });

  it('requires an authenticated session', async () => {
    const { change } = await fixture();
    expect((await change('new@example.com', {})).status).toBe(401);
  });

  it('rejects a revoked session', async () => {
    const { context, token, change } = await fixture();
    await context.internalAdapter.deleteSession(token);
    expect((await change('new@example.com')).status).toBe(401);
  });

  it.each([{ banned: true }, { role: 'banned' }])('rejects banned accounts: %j', async (ban) => {
    const { context, userId, change } = await fixture();
    await context.internalAdapter.updateUser(userId, ban);
    expect((await change('new@example.com')).status).toBe(403);
  });

  it('rejects a cross-origin request', async () => {
    const { cookie, change } = await fixture();
    expect((await change('new@example.com', { cookie, origin: 'https://untrusted.example' })).status).toBe(403);
  });

  it('rejects invalid email syntax', async () => {
    const { change } = await fixture();
    expect((await change('not-an-email')).status).toBe(400);
  });

  it('keeps the link-based email-change endpoint disabled', async () => {
    const { auth, cookie, mail } = await fixture();
    await expect(auth.api.changeEmail({ headers: new Headers({ cookie }), body: { newEmail: 'new@example.com' } }))
      .rejects.toMatchObject({ body: { code: 'CHANGE_EMAIL_DISABLED' } });
    expect(mail).not.toHaveBeenCalled();
  });

  it('rejects old links that lack an account ID', async () => {
    const { auth, context, userId } = await fixture();
    const token = await createEmailVerificationToken(secret, 'old@example.com', 'new@example.com');
    expect((await auth.handler(new Request(`${baseURL}/api/auth/verify-email?token=${token}`))).status).toBe(401);
    expect((await context.internalAdapter.findUserById(userId))?.email).toBe('old@example.com');
  });

  it('does not let an outstanding link take over a replacement account', async () => {
    const { auth, context, userId, change } = await fixture();
    const token = await createEmailVerificationToken(secret, 'old@example.com', 'destination@example.com', 3600, {
      userId, requestType: 'change-email-verification',
    });
    expect((await change('moved@example.com')).status).toBe(200);
    const replacement = await auth.api.signUpEmail({ body: { name: 'Replacement', email: 'old@example.com', password } });
    const response = await auth.handler(new Request(`${baseURL}/api/auth/verify-email?token=${token}`));
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().some(value => value.includes('.session_token='))).toBe(false);
    expect((await context.internalAdapter.findUserById(replacement.user.id))?.email).toBe('old@example.com');
  });
});
