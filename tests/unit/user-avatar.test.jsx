// @vitest-environment jsdom
// Phase 1 "Tests required": UserAvatar. Prince Boateng gives PB; Sarah gives S; no name gives the
// generic icon; a broken image falls back to initials. Exit gate: initials are computed, never stored.
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { fullName, getInitials } from '@/lib/initials.js';

describe('getInitials', () => {
  it('Prince Boateng gives PB', () => expect(getInitials('Prince', 'Boateng')).toBe('PB'));
  it('Sarah gives S', () => expect(getInitials('Sarah', '')).toBe('S'));
  it('no name gives an empty string', () => {
    expect(getInitials('', '')).toBe('');
    expect(getInitials(null, undefined)).toBe('');
    expect(getInitials('   ', '  ')).toBe('');
  });
  it('uppercases and trims', () => expect(getInitials('  ama ', ' asare')).toBe('AA'));
  it('uses only the first letter of a multi-word first name', () => expect(getInitials('Mary Ann', 'Owusu')).toBe('MO'));
  it('keeps accented and Akan letters whole', () => {
    expect(getInitials('Ɛsi', 'ɔsei')).toBe('ƐƆ');
    expect(getInitials('Élodie', 'Ölz')).toBe('ÉÖ');
  });
  it('second name only gives one letter', () => expect(getInitials('', 'Mensah')).toBe('M'));
  it('fullName joins the parts', () => expect(fullName(' Prince ', 'Boateng')).toBe('Prince Boateng'));
});

describe('UserAvatar', () => {
  it('shows PB for Prince Boateng with the full name as its accessible name', () => {
    render(<UserAvatar firstName="Prince" secondName="Boateng" />);
    const avatar = screen.getByRole('img', { name: 'Prince Boateng' });
    expect(avatar).toHaveTextContent('PB');
    expect(avatar).toHaveAttribute('data-state', 'initials');
  });

  it('shows S for Sarah', () => {
    render(<UserAvatar firstName="Sarah" />);
    expect(screen.getByRole('img', { name: 'Sarah' })).toHaveTextContent('S');
  });

  it('shows the generic icon when there is no name', () => {
    render(<UserAvatar />);
    const avatar = screen.getByRole('img', { name: 'User' });
    expect(avatar).toHaveAttribute('data-state', 'icon');
    expect(avatar.textContent).toBe('');
    expect(avatar.querySelector('svg')).not.toBeNull();
  });

  it('shows a grey loading circle, then the image once it loads', () => {
    const { container } = render(<UserAvatar firstName="Ama" secondName="Asare" imageUrl="https://example.org/a.webp" />);
    const avatar = screen.getByRole('img', { name: 'Ama Asare' });
    expect(avatar).toHaveAttribute('data-state', 'loading');
    const img = /** @type {HTMLImageElement} */ (container.querySelector('img'));
    fireEvent.load(img);
    expect(avatar).toHaveAttribute('data-state', 'image');
  });

  it('falls back to initials when the image fails to load', () => {
    const { container } = render(<UserAvatar firstName="Prince" secondName="Boateng" imageUrl="https://example.org/broken.webp" />);
    fireEvent.error(/** @type {HTMLImageElement} */ (container.querySelector('img')));
    const avatar = screen.getByRole('img', { name: 'Prince Boateng' });
    expect(avatar).toHaveAttribute('data-state', 'initials');
    expect(avatar).toHaveTextContent('PB');
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the icon when the image fails and there is no name', () => {
    const { container } = render(<UserAvatar imageUrl="https://example.org/broken.webp" />);
    fireEvent.error(/** @type {HTMLImageElement} */ (container.querySelector('img')));
    expect(screen.getByRole('img', { name: 'User' })).toHaveAttribute('data-state', 'icon');
  });

  it('is hidden from assistive technology when decorative', () => {
    const { container } = render(<UserAvatar firstName="Kwame" secondName="Mensah" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('initials are computed, never stored (exit gate)', () => {
  /** @param {string} dir @returns {string[]} */
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(js|jsx|sql)$/.test(name) ? [path] : [];
    });

  it('no source file writes initials to storage, and no migration has an initials column', () => {
    const offenders = [...files('src'), ...files('supabase')].filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /(localStorage|sessionStorage|indexedDB)[^\n]*initial/i.test(text) || /\binitials\b\s+(text|varchar|char)/i.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
