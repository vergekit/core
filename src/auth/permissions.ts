import type { User } from 'better-auth';
import type { RoleAuthorizeRequest } from 'better-auth/plugins/access';
import type {
  AuthAccessStatements,
  AuthRole,
  AnyDefinedAuthConfig,
} from './config.js';

export interface AppUserFields {
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
}

export type AppAuthUser = User & AppUserFields;

export type AuthPermissionRequest<TConfig extends AnyDefinedAuthConfig> =
  RoleAuthorizeRequest<TConfig['accessStatements']>;

type AuthorizableRole<TConfig extends AnyDefinedAuthConfig> = {
  authorize: (
    permissions: RoleAuthorizeRequest<AuthAccessStatements>,
  ) => { success: boolean };
};

export function isAppRole<TConfig extends AnyDefinedAuthConfig>(
  authConfig: TConfig,
  value: string,
): value is AuthRole<TConfig> {
  return authConfig.roles.roles.includes(value as AuthRole<TConfig>);
}

export function getAppRolesForUser<TConfig extends AnyDefinedAuthConfig>(
  authConfig: TConfig,
  user: AppUserFields | null | undefined,
): AuthRole<TConfig>[] {
  const storedRole =
    user?.role?.trim() || String(authConfig.roles.defaultRole);
  const roles = storedRole
    .split(',')
    .map((role) => role.trim())
    .filter((role): role is AuthRole<TConfig> => isAppRole(authConfig, role));

  return roles.length ? roles : [authConfig.roles.defaultRole];
}

export function isAppBannedUser<TConfig extends AnyDefinedAuthConfig>(
  authConfig: TConfig,
  user: AppUserFields | null | undefined,
) {
  return (
    Boolean(user?.banned) ||
    getAppRolesForUser(authConfig, user).includes('banned' as AuthRole<TConfig>)
  );
}

export function userHasAppPermission<TConfig extends AnyDefinedAuthConfig>(
  authConfig: TConfig,
  user: AppUserFields | null | undefined,
  permissions: AuthPermissionRequest<TConfig>,
) {
  if (!user || isAppBannedUser(authConfig, user)) {
    return false;
  }

  return getAppRolesForUser(authConfig, user).some((role) => {
    return (
      authConfig.authRoles[role] as AuthorizableRole<TConfig>
    ).authorize(permissions).success;
  });
}
