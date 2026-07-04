import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  jsonFailure,
  jsonSuccess,
  parseJsonRequest,
  parseWithSchema,
} from '../src/http/index.js';

const profileSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1),
});

describe('http helpers', () => {
  it('wraps successful JSON payloads in a data object', async () => {
    const response = jsonSuccess({ ok: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { ok: true } });
  });

  it('wraps JSON failures with optional issues', async () => {
    const response = jsonFailure('Invalid request body', {
      status: 422,
      issues: { fieldErrors: { email: ['Invalid email'] } },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Invalid request body',
      issues: { fieldErrors: { email: ['Invalid email'] } },
    });
  });

  it('returns typed data for valid schema input', () => {
    const result = parseWithSchema(profileSchema, {
      email: 'ada@example.com',
      displayName: ' Ada ',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        email: 'ada@example.com',
        displayName: 'Ada',
      },
    });
  });

  it('returns a standard failure for invalid schema input', () => {
    const result = parseWithSchema(profileSchema, {
      email: 'not-an-email',
      displayName: '',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(result.issues).toMatchObject({
        fieldErrors: {
          email: expect.any(Array),
          displayName: expect.any(Array),
        },
      });
    }
  });

  it('parses JSON request bodies through safeParse', async () => {
    const request = new Request('https://vergekit.dev/api/profile', {
      method: 'POST',
      body: JSON.stringify({
        email: 'ada@example.com',
        displayName: 'Ada',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonRequest(request, profileSchema);

    expect(result).toEqual({
      ok: true,
      data: {
        email: 'ada@example.com',
        displayName: 'Ada',
      },
    });
  });

  it('returns a standard failure for malformed JSON', async () => {
    const request = new Request('https://vergekit.dev/api/profile', {
      method: 'POST',
      body: '{',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseJsonRequest(request, profileSchema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual({
        error: 'Invalid JSON request body',
      });
    }
  });
});
