import { APIError, type BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, sensitiveSessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import type { AnyDefinedAuthConfig } from './config.js';
import { isAppBannedUser, type AppAuthUser } from './permissions.js';

// VK trusts replacement addresses supplied by authenticated account holders.
export function createDirectEmailChangePlugin(authConfig: AnyDefinedAuthConfig) {
  return {
    id: 'vk-direct-email-change',
    endpoints: {
      changeEmailDirect: createAuthEndpoint('/change-email-direct', {
        method: 'POST',
        body: z.object({
          newEmail: z.string().trim().pipe(z.email().max(255)).transform(value => value.toLowerCase()),
        }),
        use: [sensitiveSessionMiddleware],
      }, async (ctx) => {
        const { session } = ctx.context;
        const adapter = ctx.context.internalAdapter;
        const user = await adapter.findUserById(session.user.id) as AppAuthUser | null;
        if (!user) throw APIError.fromStatus('UNAUTHORIZED');
        if (isAppBannedUser(authConfig, user)) {
          throw APIError.from('FORBIDDEN', authConfig.roles.bannedSessionError);
        }
        const email = ctx.body.newEmail;
        if (user.email === email) return ctx.json({ status: true });
        const conflict = () => APIError.from('CONFLICT', {
          code: 'EMAIL_ALREADY_IN_USE',
          message: 'That email address is already in use.',
        });
        if (await adapter.findUserByEmail(email)) throw conflict();

        let updatedUser;
        try {
          // The database unique constraint also protects concurrent requests.
          updatedUser = await adapter.updateUser(user.id, { email, emailVerified: true });
        } catch {
          if (await adapter.findUserByEmail(email)) throw conflict();
          throw APIError.from('INTERNAL_SERVER_ERROR', {
            code: 'EMAIL_UPDATE_FAILED', message: 'Could not update your email. Please try again.',
          });
        }
        const others = (await adapter.listSessions(user.id))
          .filter(value => value.token !== session.session.token);
        await adapter.deleteSessions(others.map(value => value.token));
        await setSessionCookie(ctx, { session: session.session, user: updatedUser });
        return ctx.json({ status: true });
      }),
    },
  } satisfies BetterAuthPlugin;
}
