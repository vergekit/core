import { describe, expect, it } from 'vitest';
import { cn } from '../src/utilities/index.js';

describe('utilities', () => {
  it('merges conditional class values with Tailwind conflict resolution', () => {
    expect(cn('px-2', false && 'hidden', ['text-sm', 'px-4'])).toBe(
      'text-sm px-4',
    );
  });
});
