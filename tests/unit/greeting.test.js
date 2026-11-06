// Dashboard greeting: time of day in Ghana (Africa/Accra, UTC+0 all year) and the first name.
import { describe, expect, it } from 'vitest';
import { greeting } from '@/lib/greeting.js';

describe('greeting', () => {
  it('greets by the time of day in Ghana, followed by the first name', () => {
    expect(greeting('Ama', new Date('2026-11-06T06:30:00Z'))).toBe('Good morning, Ama');
    expect(greeting('Ama', new Date('2026-11-06T11:59:00Z'))).toBe('Good morning, Ama');
    expect(greeting('Ama', new Date('2026-11-06T12:00:00Z'))).toBe('Good afternoon, Ama');
    expect(greeting('Ama', new Date('2026-11-06T16:59:00Z'))).toBe('Good afternoon, Ama');
    expect(greeting('Ama', new Date('2026-11-06T17:00:00Z'))).toBe('Good evening, Ama');
    expect(greeting('Ama', new Date('2026-11-06T00:30:00Z'))).toBe('Good morning, Ama');
    expect(greeting('Ama', new Date('2026-11-06T23:59:00Z'))).toBe('Good evening, Ama');
    expect(greeting('Ama', new Date('2026-11-06T05:00:00Z'))).toBe('Good morning, Ama');
  });

  it('never shows a stray comma when the name is missing', () => {
    expect(greeting('', new Date('2026-11-06T06:30:00Z'))).toBe('Good morning');
    expect(greeting(null, new Date('2026-11-06T13:00:00Z'))).toBe('Good afternoon');
  });
});
