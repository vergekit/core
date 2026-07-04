import type {
  JsonFailureBody,
  JsonFailureInit,
  JsonSuccessBody,
} from './types.js';

export function jsonSuccess<T>(data: T, init?: ResponseInit) {
  return Response.json({ data } satisfies JsonSuccessBody<T>, {
    status: 200,
    ...init,
  });
}

export function jsonFailure(error: string, init: JsonFailureInit = {}) {
  const { issues, ...responseInit } = init;
  const body: JsonFailureBody =
    issues === undefined ? { error } : { error, issues };

  return Response.json(body, {
    status: 400,
    ...responseInit,
  });
}
