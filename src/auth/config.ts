import type { BetterAuthOptions } from 'better-auth';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { adminClient } from 'better-auth/client/plugins';
import { admin } from 'better-auth/plugins';
import {
  createAccessControl,
  type AccessControl,
  type Role,
  type Statements,
} from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
} from 'better-auth/plugins/admin/access';

export type AuthServerPlugin = NonNullable<BetterAuthOptions['plugins']>[number];

export interface AuthRouteConfig<TAppStatement extends string = string> {
  authApiPrefix: string;
  loginPath: string;
  protectedExactPaths: readonly string[];
  protectedPrefixes: readonly string[];
  adminExactPaths: readonly string[];
  adminPrefixes: readonly string[];
  adminPermission: {
    readonly app: readonly TAppStatement[];
  };
}

export interface AuthRoleConfig<
  TRole extends string = string,
  TAppStatement extends string = string,
> {
  roles: readonly TRole[];
  defaultRole: TRole;
  adminRoles: readonly TRole[];
  appStatements: readonly TAppStatement[];
  roleAppPermissions: {
    readonly [Role in TRole]: readonly TAppStatement[];
  };
  bannedSessionError: {
    code: string;
    message: string;
  };
}

export interface AuthBrowserConfig {
  defaultErrorMessage: string;
}

export interface DefineAuthConfigInput<
  TRole extends string = string,
  TAppStatement extends string = string,
> {
  routes: AuthRouteConfig<TAppStatement>;
  roles: AuthRoleConfig<TRole, TAppStatement>;
  browser: AuthBrowserConfig;
}

export type AuthAccessStatements<TAppStatement extends string = string> =
  typeof defaultStatements & {
    readonly app: readonly TAppStatement[];
  };

export type AuthRoleMap<
  TRole extends string = string,
  TAppStatement extends string = string,
> = Record<TRole, Role<Statements, AuthAccessStatements<TAppStatement>>>;

export interface DefinedAuthConfig<
  TRole extends string = string,
  TAppStatement extends string = string,
> extends DefineAuthConfigInput<TRole, TAppStatement> {
  accessStatements: AuthAccessStatements<TAppStatement>;
  accessControl: AccessControl<AuthAccessStatements<TAppStatement>>;
  authRoles: AuthRoleMap<TRole, TAppStatement>;
}

export type AnyDefinedAuthConfig = DefinedAuthConfig<any, any>;

export type AuthRole<TConfig extends AnyDefinedAuthConfig> =
  TConfig['roles']['roles'][number];

const emptyAdminPermissions = {
  user: [],
  session: [],
} as const;

export function defineAuthConfig<
  const TRole extends string,
  const TAppStatement extends string,
>(
  config: DefineAuthConfigInput<TRole, TAppStatement>,
): DefinedAuthConfig<TRole, TAppStatement> {
  const accessStatements = {
    ...defaultStatements,
    app: config.roles.appStatements,
  } as AuthAccessStatements<TAppStatement>;
  const accessControl = createAccessControl(accessStatements);
  const adminRoleNames = new Set<string>(config.roles.adminRoles);
  const authRoles = {} as AuthRoleMap<TRole, TAppStatement>;

  for (const roleName of config.roles.roles) {
    const app = config.roles.roleAppPermissions[roleName];
    const roleStatements = adminRoleNames.has(roleName)
      ? {
          ...adminAc.statements,
          app,
        }
      : {
          ...emptyAdminPermissions,
          app,
        };

    authRoles[roleName] = accessControl.newRole(
      roleStatements as never,
    ) as AuthRoleMap<TRole, TAppStatement>[TRole];
  }

  return {
    ...config,
    accessStatements,
    accessControl,
    authRoles,
  };
}

export function createAuthServerPlugins(
  authConfig: AnyDefinedAuthConfig,
  additionalPlugins: readonly AuthServerPlugin[] = [],
): NonNullable<BetterAuthOptions['plugins']> {
  return [
    admin({
      defaultRole: authConfig.roles.defaultRole,
      adminRoles: [...authConfig.roles.adminRoles],
      ac: authConfig.accessControl,
      roles: authConfig.authRoles,
    }),
    ...additionalPlugins,
  ];
}

export function createAuthClientPlugins(
  authConfig: AnyDefinedAuthConfig,
  additionalPlugins: readonly BetterAuthClientPlugin[] = [],
) {
  return [
    adminClient({
      ac: authConfig.accessControl,
      roles: authConfig.authRoles,
    }),
    ...additionalPlugins,
  ];
}
