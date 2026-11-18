// Sign Up typo suggestions (owner, 2026-11-17): common mistakes in a provider's name or in ".com" are caught;
// correct addresses, real look-alike domains and school or church domains are left alone.
import { describe, expect, it } from 'vitest';
import { distance, suggestEmail } from '@/lib/auth/email-typos.js';

describe('suggestEmail', () => {
  it.each([
    ['abena@gmial.com', 'abena@gmail.com'],
    ['abena@gmai.com', 'abena@gmail.com'],
    ['abena@gamil.com', 'abena@gmail.com'],
    ['abena@gmail.con', 'abena@gmail.com'],
    ['abena@gmail.co', 'abena@gmail.com'],
    ['abena@gmail.cm', 'abena@gmail.com'],
    ['Kwame.Mensah@Gmail.Comm', 'Kwame.Mensah@gmail.com'],
    ['esi@yaho.com', 'esi@yahoo.com'],
    ['esi@yahoo.con', 'esi@yahoo.com'],
    ['yaw@hotmal.com', 'yaw@hotmail.com'],
    ['yaw@outlok.com', 'yaw@outlook.com'],
    ['ama@icloud.co', 'ama@icloud.com'],
    ['  ama@gmail.cpm ', 'ama@gmail.com'],
  ])('%s -> %s', (typed, meant) => {
    expect(suggestEmail(typed)).toBe(meant);
  });

  it.each([
    'abena@gmail.com',
    'esi@yahoo.co.uk',
    'yaw@hotmail.fr',
    'kofi@mail.com',
    'kofi@gmx.com',
    'pastor@ddtc.org',
    'student@ug.edu.gh',
    'staff@knust.edu.gh',
    'ama@example.org',
    'not-an-email',
    'ama@',
    '',
  ])('leaves %s alone', (typed) => {
    expect(suggestEmail(typed)).toBeNull();
  });
});

describe('distance', () => {
  it('counts a swap of neighbouring letters as one edit', () => {
    expect(distance('gmial.com', 'gmail.com')).toBe(1);
    expect(distance('gmail.com', 'gmail.com')).toBe(0);
    expect(distance('yaho.com', 'yahoo.com')).toBe(1);
  });
});
