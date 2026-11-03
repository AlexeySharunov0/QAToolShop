import { expect } from '@playwright/test';

/**
 * Small shared matchers. Besides readability, they produce a message that
 * states what was actually observed, which is what turns a red run into a
 * usable bug report.
 */
expect.extend({
  toBeWithin(received: number, min: number, max: number) {
    const pass = typeof received === 'number' && received >= min && received <= max;
    return {
      pass,
      message: () => `expected ${received} to be within ${min}..${max}`,
    };
  },

  toBeOneOf(received: unknown, allowed: unknown[]) {
    const pass = allowed.includes(received);
    return {
      pass,
      message: () =>
        `expected ${JSON.stringify(received)} to be one of ${allowed
          .map((value) => JSON.stringify(value))
          .join(', ')}`,
    };
  },
});

declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      toBeWithin(min: number, max: number): R;
      toBeOneOf(allowed: unknown[]): R;
    }
  }
}

export {};
