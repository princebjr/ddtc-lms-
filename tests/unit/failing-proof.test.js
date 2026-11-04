import { expect, it } from 'vitest';
it('deliberately fails to prove CI blocks a failing test', () => {
  expect(1 + 1).toBe(3);
});
