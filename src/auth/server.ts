import {
  drizzleAdapter,
  type DrizzleAdapterConfig,
} from '@better-auth/drizzle-adapter';
import {
  APIError,
  betterAuth,
  type BetterAuthOptions,
  type Session,
} from 'better-auth';
import {
  createAuthEmailSenderFromEnv,
  type AuthEmailSender,
  type CreateAuthEmailSenderFromEnvOptions,
  type EmailRuntimeEnv,
} from '../email/index.js';
import {
  createAuthServerPlugins,
  type AuthServerPlugin,
  type AnyDefinedAuthConfig,
} from './config.js';
import { isAppBannedUser, type AppUserFields } from './permissions.js';

export interface AuthRuntimeEnv extends EmailRuntimeEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
}

type DrizzleDatabase = Parameters<typeof drizzleAdapter>[0];
type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>;
type BeforeSessionCreate = NonNullable<
  NonNullable<NonNullable<DatabaseHooks['session']>['create']>['before']
>;

export interface BuildAuthOptionsInput<
  TConfig extends AnyDefinedAuthConfig = AnyDefinedAuthConfig,
> {
  database: DrizzleDatabase;
  schema: NonNullable<DrizzleAdapterConfig['schema']>;
  authConfig: TConfig;
  baseURL: string;
  secret: string;
  authEmail?: AuthEmailSender;
  additionalPlugins?: readonly AuthServerPlugin[];
  drizzle?: Partial<Omit<DrizzleAdapterConfig, 'schema' | 'provider'>> & {
    provider?: DrizzleAdapterConfig['provider'];
  };
  extendOptions?: (options: BetterAuthOptions) => BetterAuthOptions;
}

export interface CreateAuthFromEnvInput<
  TConfig extends AnyDefinedAuthConfig = AnyDefinedAuthConfig,
> extends Omit<
    BuildAuthOptionsInput<TConfig>,
    'authEmail' | 'baseURL' | 'secret'
  > {
  runtimeEnv: AuthRuntimeEnv;
  request: Request;
  authEmail?: AuthEmailSender;
  authEmailOptions?: CreateAuthEmailSenderFromEnvOptions;
}

export type AppAuthSession = Session & {
  impersonatedBy?: string | null;
};

export function createBlockAppBannedSessionHook<
  TConfig extends AnyDefinedAuthConfig,
>(authConfig: TConfig): BeforeSessionCreate {
  return async (session, context) => {
    if (!context) {
      return;
    }

    const user = await context.context.internalAdapter.findUserById(
      session.userId,
    );

    if (!isAppBannedUser(authConfig, user as AppUserFields | null)) {
      return;
    }

    throw APIError.from('FORBIDDEN', {
      code: authConfig.roles.bannedSessionError.code,
      message: authConfig.roles.bannedSessionError.message,
    });
  };
}

export function buildAuthOptions<TConfig extends AnyDefinedAuthConfig>({
  database,
  schema,
  authConfig,
  baseURL,
  secret,
  authEmail,
  additionalPlugins,
  drizzle,
  extendOptions,
}: BuildAuthOptionsInput<TConfig>): BetterAuthOptions {
  const emailAndPassword: BetterAuthOptions['emailAndPassword'] = {
    enabled: true,
    requireEmailVerification: true,
  };

  if (authEmail) {
    emailAndPassword.sendResetPassword = async ({ user, url }) => {
      await authEmail.sendResetPasswordEmail({
        to: user.email,
        name: user.name,
        url,
      });
    };
  }

  const options: BetterAuthOptions = {
    baseURL,
    secret,
    database: drizzleAdapter(database, {
      provider: drizzle?.provider ?? 'sqlite',
      ...drizzle,
      schema,
    }),
    databaseHooks: {
      session: {
        create: {
          before: createBlockAppBannedSessionHook(authConfig),
        },
      },
    },
    emailAndPassword,
    emailVerification: {
      autoSignInAfterVerification: true,
      ...(authEmail
        ? {
            sendOnSignUp: true,
            sendVerificationEmail: async ({ user, url }) => {
              await authEmail.sendVerificationEmail({
                to: user.email,
                name: user.name,
                url,
              });
            },
          }
        : {}),
    },
    plugins: createAuthServerPlugins(authConfig, additionalPlugins),
  };

  return extendOptions ? extendOptions(options) : options;
}

export function createAuth<TConfig extends AnyDefinedAuthConfig>(
  options: BuildAuthOptionsInput<TConfig>,
) {
  return betterAuth(buildAuthOptions(options));
}

export function resolveAuthBaseURL(
  runtimeEnv: Pick<AuthRuntimeEnv, 'BETTER_AUTH_URL'>,
  request: Request,
) {
  const configuredBaseURL = runtimeEnv.BETTER_AUTH_URL?.trim();

  if (configuredBaseURL) {
    return configuredBaseURL.replace(/\/$/, '');
  }

  return new URL(request.url).origin;
}

export function resolveAuthSecret(
  runtimeEnv: Pick<AuthRuntimeEnv, 'BETTER_AUTH_SECRET'>,
) {
  const secret = runtimeEnv.BETTER_AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required to initialize Better Auth');
  }

  return secret;
}

export function createAuthFromEnv<TConfig extends AnyDefinedAuthConfig>({
  runtimeEnv,
  request,
  authEmail,
  authEmailOptions,
  ...options
}: CreateAuthFromEnvInput<TConfig>) {
  return createAuth({
    ...options,
    baseURL: resolveAuthBaseURL(runtimeEnv, request),
    secret: resolveAuthSecret(runtimeEnv),
    authEmail:
      authEmail ??
      (authEmailOptions
        ? createAuthEmailSenderFromEnv(runtimeEnv, authEmailOptions)
        : undefined),
  });
}

export function createAuthEmailSenderOptions(
  options: CreateAuthEmailSenderFromEnvOptions,
): CreateAuthEmailSenderFromEnvOptions {
  return options;
}
