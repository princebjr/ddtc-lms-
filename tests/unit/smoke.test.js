import { describe, expect, it } from 'vitest';
import { productName } from '../../src/main.js';

describe('placeholder app', () => {
  it('uses the product name DDTC LMS', () => {
    expect(productName()).toBe('DDTC LMS');
  });
});
