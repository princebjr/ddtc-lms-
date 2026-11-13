// The class-name helper (cn) must treat DDTC's safe-area and sheet paddings as paddings, so a later padding
// replaces them. Owner, 2026-11-13: the idle warning asked for pb-4, kept the bottom sheet's pb-safe (0 on most
// phones), and its Continue Session button touched the card's edge.
import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils.js';

describe('cn', () => {
  it('a later bottom padding replaces the safe-area and sheet paddings', () => {
    expect(cn('p-4 pb-safe', 'pb-4')).toBe('p-4 pb-4');
    expect(cn('p-4 pb-sheet', 'pb-4')).toBe('p-4 pb-4');
    expect(cn('pt-sheet', 'pt-2')).toBe('pt-2');
  });

  it('keeps the sheet padding when nothing replaces it, and the type scale still merges', () => {
    expect(cn('p-4 pb-sheet', 'gap-4')).toBe('p-4 pb-sheet gap-4');
    expect(cn('text-body', 'text-title-3')).toBe('text-title-3');
  });
});
