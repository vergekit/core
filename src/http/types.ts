import type { z, ZodType } from 'zod';

export interface JsonFailureInit extends ResponseInit {
  issues?: unknown;
}

export type JsonSuccessBody<T> = {
  data: T;
};

export type JsonFailureBody = {
  error: string;
  issues?: unknown;
};

export type AnySchema = ZodType;

export type ParseResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      issues?: unknown;
      response: Response;
    };

export type SchemaOutput<TSchema extends AnySchema> = z.output<TSchema>;
