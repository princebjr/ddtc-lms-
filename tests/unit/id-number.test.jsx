// @vitest-environment jsdom
// Step 6.1, ADR-008: six-digit ID numbers. Reading an ID from what a person types (spaces allowed,
// never a leading 0), searching people by ID as well as name and email, the profile card that shows
// a person's own number with Copy, and ID numbers in the CSV import report.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportCsv } from '@/lib/admin/csv.js';
import { userSearchFilter } from '@/lib/admin/users.js';
import { formatIdNumber, parseIdNumber } from '@/lib/id-number.js';
import { IdNumberCard } from '@/pages/account/ProfilePage.jsx';

describe('reading an ID number', () => {
  it('takes six digits, with or without spaces, and nothing else', () => {
    expect(parseIdNumber('482913')).toBe(482913);
    expect(parseIdNumber(' 482 913 ')).toBe(482913);
    expect(parseIdNumber('082913')).toBeNull(); // numbers start at 100000
    expect(parseIdNumber('48291')).toBeNull();
    expect(parseIdNumber('4829130')).toBeNull();
    expect(parseIdNumber('Kwame')).toBeNull();
    expect(formatIdNumber(482913)).toBe('482913');
    expect(formatIdNumber(null)).toBe('');
  });
});

describe('searching people', () => {
  it('finds a person by ID number as well as by name and email', () => {
    expect(userSearchFilter('482913')).toBe('id_number.eq.482913,first_name.ilike.*482913*,second_name.ilike.*482913*,email.ilike.*482913*');
  });

  it('searches names and email only when the text is not an ID number', () => {
    expect(userSearchFilter('Kwame')).toBe('first_name.ilike.*Kwame*,second_name.ilike.*Kwame*,email.ilike.*Kwame*');
    expect(userSearchFilter('   ')).toBeNull();
  });

  it('keeps characters that mean something to the filter out of it', () => {
    expect(userSearchFilter('a,b(c)*')).toBe('first_name.ilike.*a b c*,second_name.ilike.*a b c*,email.ilike.*a b c*');
  });
});

describe('the profile card', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the person's own number and copies just the digits", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<IdNumberCard idNumber={482913} />);
    expect(screen.getByText('482913')).toBeInTheDocument();
    expect(screen.getByText(/never changes/i)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy ID number' })));
    expect(writeText).toHaveBeenCalledWith('482913');
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('says so when copying is not possible, so the number can be selected instead', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } });
    render(<IdNumberCard idNumber={482913} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy ID number' })));
    expect(screen.getByRole('status')).toHaveTextContent('Copying is not available here. Select the number to copy it.');
  });
});

describe('the CSV import report', () => {
  it('lists the ID number given to each new learner', () => {
    const csv = reportCsv([
      { row: 2, email: 'a@example.org', status: 'created', idNumber: 482913 },
      { row: 3, email: 'b@example.org', status: 'error', message: 'Email address is not valid' },
    ]);
    expect(csv).toBe('row,email,id_number,result,message\n2,a@example.org,482913,created,\n3,b@example.org,,error,Email address is not valid\n');
  });
});
