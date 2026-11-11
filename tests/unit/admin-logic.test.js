// Phase 4 pure logic: CSV import parsing and report, the search escaping for the user list, and
// the profile and photo rules (the server checks the same rules again).
import { describe, expect, it } from 'vitest';
import { learnerRows, MAX_IMPORT_ROWS, parseCsv, reportCsv } from '@/lib/admin/csv.js';
import { likeTerm } from '@/lib/admin/users.js';
import { photoProblem, profileSchema, validate } from '@/lib/auth/schemas.js';

describe('CSV parsing', () => {
  it('reads quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM', () => {
    const text = '﻿first_name,second_name,email\r\n"Ama, Jnr","O""Brien",ama@example.org\r\n"Line\nbreak",B,b@example.org\n\n';
    expect(parseCsv(text)).toEqual([
      ['first_name', 'second_name', 'email'],
      ['Ama, Jnr', 'O"Brien', 'ama@example.org'],
      ['Line\nbreak', 'B', 'b@example.org'],
    ]);
  });

  it('accepts the headings in any order and common spellings', () => {
    const r = learnerRows(parseCsv('Email,First Name,Surname\nx@example.org, Kofi , Owusu \n'));
    expect(r).toEqual({ ok: true, rows: [{ firstName: 'Kofi', secondName: 'Owusu', email: 'x@example.org' }] });
  });

  it('explains a missing heading row or an empty file', () => {
    expect(learnerRows(parseCsv('a,b,c\n1,2,3\n'))).toMatchObject({ ok: false });
    expect(learnerRows(parseCsv('first_name,second_name,email\n'))).toMatchObject({ ok: false });
  });

  it(`limits an import to ${MAX_IMPORT_ROWS} learners`, () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `A,B,a${i}@example.org`).join('\n');
    expect(learnerRows(parseCsv(`first_name,second_name,email\n${body}`))).toMatchObject({ ok: false });
  });

  it('the error report quotes safely and neutralises spreadsheet formulas', () => {
    const csv = reportCsv([
      { row: 2, email: 'a@example.org', status: 'created' },
      { row: 3, email: '=HYPERLINK("x")', status: 'error', message: 'Email address is not valid' },
    ]);
    // ADR-008 added the id_number column (empty where no account was created).
    expect(csv).toBe('row,email,id_number,result,message\n2,a@example.org,,created,\n3,"\'=HYPERLINK(""x"")",,error,Email address is not valid\n');
  });
});

describe('user search', () => {
  it('removes characters that would change the database filter', () => {
    expect(likeTerm(' ama,role.eq.ADMIN) ')).toBe('ama role.eq.ADMIN');
    expect(likeTerm('50%_off*')).toBe('50 off');
  });
});

describe('profile rules', () => {
  it('needs both names; the contact number is optional but must look like a phone number', () => {
    expect(validate(profileSchema, { firstName: 'Ama', secondName: 'Mensah', contactNumber: '' }).ok).toBe(true);
    expect(validate(profileSchema, { firstName: 'Ama', secondName: 'Mensah', contactNumber: '+233 20 123 4567' }).ok).toBe(true);
    const bad = validate(profileSchema, { firstName: '', secondName: 'Mensah', contactNumber: 'call me' });
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(['contactNumber', 'firstName']);
  });

  it('a profile photo must be JPG, PNG or WebP and at most 2 MB', () => {
    expect(photoProblem({ type: 'image/png', size: 1000 }, 2 * 1024 * 1024)).toBeNull();
    expect(photoProblem({ type: 'image/gif', size: 1000 }, 2 * 1024 * 1024)).toBe('use a JPG, PNG or WebP image');
    expect(photoProblem({ type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 }, 2 * 1024 * 1024)).toBe('the image is larger than 2 MB');
    // The limit is the administrator's setting (ADR-020 item 7): 5 MB accepts what 2 MB refused.
    expect(photoProblem({ type: 'image/jpeg', size: 4 * 1024 * 1024 }, 5 * 1024 * 1024)).toBeNull();
    expect(photoProblem({ type: 'image/jpeg', size: 6 * 1024 * 1024 }, 5 * 1024 * 1024)).toBe('the image is larger than 5 MB');
    expect(photoProblem({ type: 'image/jpeg', size: 6 * 1024 * 1024 }, null)).toBeNull();
    expect(photoProblem({ type: 'image/webp', size: 0 }, 2 * 1024 * 1024)).toBe('the file is empty');
  });
});
