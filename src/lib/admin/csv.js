// CSV for the learner import (D05): parse the file the administrator chooses, and build the error
// report they can download. The server re-validates every row (bulk-import-learners).

export const MAX_IMPORT_ROWS = 500;
// course_code is optional (Phase 5): when filled in, the learner is also enrolled in that course.
export const TEMPLATE = 'first_name,second_name,email,course_code\nAma,Mensah,ama.mensah@example.org,BIB101\n';

/**
 * RFC 4180 parsing: quoted fields, doubled quotes, commas and line breaks inside quotes.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** @param {string} h */
const norm = (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Turns parsed CSV into learner rows. The header must name first name, second name and email
 * (any order; "First name", "first_name" and "First-Name" all work). An optional course_code column
 * enrols each learner in that course.
 * @param {string[][]} table
 * @returns {{ ok: true, rows: Array<{ firstName: string, secondName: string, email: string, courseCode?: string }> } | { ok: false, message: string }}
 */
export function learnerRows(table) {
  if (table.length < 2) return { ok: false, message: 'The file has no learners. Use the template: first_name, second_name, email.' };
  const header = table[0].map(norm);
  const at = (/** @type {string[]} */ names) => header.findIndex((h) => names.includes(h));
  const first = at(['first_name', 'firstname', 'first']);
  const second = at(['second_name', 'secondname', 'last_name', 'surname', 'second']);
  const email = at(['email', 'email_address']);
  const course = at(['course_code', 'course', 'code']);
  if (first < 0 || second < 0 || email < 0) return { ok: false, message: 'The first row must be the headings first_name, second_name, email.' };
  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, message: `Import at most ${MAX_IMPORT_ROWS} learners at a time.` };
  return {
    ok: true,
    rows: body.map((r) => {
      const row = { firstName: (r[first] ?? '').trim(), secondName: (r[second] ?? '').trim(), email: (r[email] ?? '').trim() };
      const code = course >= 0 ? (r[course] ?? '').trim().toUpperCase() : '';
      return code ? { ...row, courseCode: code } : row;
    }),
  };
}

/** @param {string} v */
function cell(v) {
  // Also neutralises spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * @param {Array<{ row: number, email: string, status: string, message?: string }>} results
 * @returns {string}
 */
export function reportCsv(results) {
  const lines = ['row,email,result,message', ...results.map((r) => [String(r.row), r.email, r.status, r.message ?? ''].map(cell).join(','))];
  return `${lines.join('\n')}\n`;
}

/** Starts a download of text as a file. @param {string} name @param {string} text */
export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
