import type { AnyDefinedAuthConfig } from './config.js';
import {
  type AppUserFields,
  type AuthPermissionRequest,
  isAppBannedUser,
  userHasAppPermission,
} from './permissions.js';

export type RouteAccessDecision =
  | { type: 'allow' }
  | { type: 'redirect'; location: string }
  | { type: 'forbidden' };

export interface RouteAccessContext {
  isAuthenticated: boolean;
  user?: AppUserFields | null;
}

function getRoutePathname(routePath: string) {
  try {
    return new URL(routePath).pathname;
  } catch {
    const pathEnd = routePath.search(/[?#]/);
    const pathname = pathEnd === -1 ? routePath : routePath.slice(0, pathEnd);

    return pathname || '/';
  }
}

function resolveLocalRedirectPath(target: unknown, fallbackPath = '/') {
  if (typeof target !== 'string') {
    return fallbackPath;
  }

  const redirectPath = target.trim();

  if (!redirectPath.startsWith('/') || redirectPath.startsWith('//')) {
    return fallbackPath;
  }

  return redirectPath;
}

export function getAuthApiPrefix(authConfig: AnyDefinedAuthConfig) {
  return authConfig.routes.authApiPrefix;
}

export function getLoginPath(authConfig: AnyDefinedAuthConfig) {
  return authConfig.routes.loginPath;
}

export function getSignOutPath(authConfig: AnyDefinedAuthConfig) {
  return `${getAuthApiPrefix(authConfig)}/sign-out`;
}

export function isAuthApiRoute(
  authConfig: AnyDefinedAuthConfig,
  routePath: string,
) {
  const pathname = getRoutePathname(routePath);
  const authApiPrefix = getAuthApiPrefix(authConfig);

  return pathname === authApiPrefix || pathname.startsWith(`${authApiPrefix}/`);
}

export function isSignOutApiRoute(
  authConfig: AnyDefinedAuthConfig,
  routePath: string,
) {
  return getRoutePathname(routePath) === getSignOutPath(authConfig);
}

export function shouldRedirectSignOutRequest(
  authConfig: AnyDefinedAuthConfig,
  request: Request,
) {
  const accept = request.headers.get('accept') ?? '';

  return (
    request.method.toUpperCase() === 'POST' &&
    isSignOutApiRoute(authConfig, request.url) &&
    accept.includes('text/html') &&
    !accept.includes('application/json')
  );
}

export function createSignOutAuthRequest(
  authConfig: AnyDefinedAuthConfig,
  request: Request,
) {
  if (!shouldRedirectSignOutRequest(authConfig, request)) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('content-type');

  return new Request(request.url, {
    method: request.method,
    headers,
  });
}

export async function resolveSignOutRedirectPath(request: Request) {
  const requestURL = new URL(request.url);
  const queryRedirect =
    requestURL.searchParams.get('redirectTo') ??
    requestURL.searchParams.get('callbackURL');

  if (queryRedirect) {
    return resolveLocalRedirectPath(queryRedirect);
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const formData = await request.clone().formData();
      return resolveLocalRedirectPath(
        formData.get('redirectTo') ?? formData.get('callbackURL'),
      );
    } catch {
      return '/';
    }
  }

  return '/';
}

export function isProtectedRoute(
  authConfig: AnyDefinedAuthConfig,
  routePath: string,
) {
  const pathname = getRoutePathname(routePath);

  if (authConfig.routes.protectedExactPaths.includes(pathname)) {
    return true;
  }

  return authConfig.routes.protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function isAdminRoute(
  authConfig: AnyDefinedAuthConfig,
  routePath: string,
) {
  const pathname = getRoutePathname(routePath);

  if (authConfig.routes.adminExactPaths.includes(pathname)) {
    return true;
  }

  return authConfig.routes.adminPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function getLoginRedirectPath(
  authConfig: AnyDefinedAuthConfig,
  destination: string,
) {
  return `${getLoginPath(authConfig)}?redirectTo=${encodeURIComponent(
    destination,
  )}`;
}

export function resolveRouteAccess<TConfig extends AnyDefinedAuthConfig>(
  authConfig: TConfig,
  routePath: string,
  auth: boolean | RouteAccessContext,
): RouteAccessDecision {
  const pathname = getRoutePathname(routePath);
  const context =
    typeof auth === 'boolean' ? { isAuthenticated: auth, user: null } : auth;
  const isAuthenticated = context.isAuthenticated;
  const isAdminPath = isAdminRoute(authConfig, pathname);
  const isProtectedPath = isProtectedRoute(authConfig, pathname) || isAdminPath;

  if (!isProtectedPath) {
    return { type: 'allow' };
  }

  if (!isAuthenticated) {
    return {
      type: 'redirect',
      location: getLoginRedirectPath(authConfig, routePath),
    };
  }

  if (isAppBannedUser(authConfig, context.user)) {
    return { type: 'forbidden' };
  }

  if (
    isAdminPath &&
    !userHasAppPermission(
      authConfig,
      context.user,
      {
        app: [...authConfig.routes.adminPermission.app],
      } as AuthPermissionRequest<TConfig>,
    )
  ) {
    return { type: 'forbidden' };
  }

  return { type: 'allow' };
}
