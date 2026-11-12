// export-gradebook (Phase 10; D30, D42; owner request 2026-11-06 and decisions 2 and 3 of 2026-11-10):
// the course's lecturers and AAL2 administrators export
//   - the course gradebook (one row per learner: ID number, branch, each assignment, overall %, grade,
//     status), or
//   - one assignment's performance report (name, ID number, branch, assignment, submission date, score,
//     maximum, percentage, status with "Not Submitted", then the totals, class average, highest and lowest),
// as CSV (plain headings, UTF-8 with a byte-order mark so Excel opens it cleanly) or Excel (_shared/xlsx.ts, with
// DDTC's name, the course, the assignment and the export date in the top rows). Every figure comes from
// the database (calculate_course_grades, assignment_results, assignment_report_summary) read with the
// caller's own token, so its checks apply; anyone else is refused first, and each export is audited.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { buildXlsx } from '../_shared/xlsx.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gradebook'), courseId: z.uuid(), format: z.enum(['csv', 'xlsx']) }),
  z.object({ kind: z.literal('assignment'), assignmentId: z.uuid(), format: z.enum(['csv', 'xlsx']) }),
  // Phase 10.1 (ADR-016): one examination's results.
  z.object({ kind: z.literal('examination'), examId: z.uuid(), format: z.enum(['csv', 'xlsx']) }),
]);

type Cell = string | number | null;
const INSTITUTION = 'Dynamic Discipleship Training Centre (HOJ)';
const STATUS: Record<string, string> = { FINAL: 'Final', PROVISIONAL: 'Provisional', NOT_AVAILABLE: 'Not yet available' };
const RESULT: Record<string, string> = { GRADED: 'Graded', UNGRADED: 'Ungraded', MISSING: 'Not Submitted', NOT_YET_DUE: 'Not Submitted' };
const EXAM_STATE: Record<string, string> = { SUBMITTED: 'Submitted', NOT_SUBMITTED: 'Not Submitted', NOT_STARTED: 'Not Submitted', IN_PROGRESS: 'In progress' };
const MARKING: Record<string, string> = { GRADED: 'Marked', PARTLY: 'Partly marked', UNGRADED: 'Not marked' };

/** Rows branch by branch (owner answer of 2026-11-10), "No branch" last; names keep their order within a branch. */
function byBranch(rows: Cell[][], column: number): Cell[][] {
  const key = (r: Cell[]) => String(r[column] ?? '').trim();
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const [x, y] = [key(a.r), key(b.r)];
      if (x === y) return a.i - b.i;
      if (!x) return 1;
      if (!y) return -1;
      return x.localeCompare(y, 'en-GB');
    })
    .map((x) => x.r);
}

/** 15.00 -> 15, 82.50 -> 82.5; null stays empty. */
const num = (n: unknown): Cell => (n === null || n === undefined ? null : Number(n));
const ghanaDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '';
const today = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
const safeName = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export';

/** A gradebook cell as text: a score (released, or a draft marked), or the state. */
function cellText(c: { state: string; score: unknown }): Cell {
  switch (c.state) {
    case 'RELEASED':
      return num(c.score);
    case 'DRAFT':
      return `${num(c.score)} (draft)`;
    case 'COUNTED_ZERO':
      return '0 (counted as 0)';
    case 'UNGRADED':
      return 'Ungraded';
    case 'MISSING':
      return 'Missing';
    default:
      return '';
  }
}

function csv(rows: Cell[][]): Uint8Array {
  const field = (v: Cell) => {
    const s = v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new TextEncoder().encode(String.fromCharCode(0xfeff) + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n');
}

function xlsx(title: string, heading: string[], header: Cell[], rows: Cell[][], footer: Cell[][]): Uint8Array {
  const widths = header.map((h, i) => {
    let w = String(h ?? '').length;
    for (const r of rows) w = Math.max(w, String(r[i] ?? '').length);
    return Math.min(Math.max(w + 2, 10), 48);
  });
  return buildXlsx(title, [
    { cells: [INSTITUTION], style: 'title' },
    ...heading.map((line) => ({ cells: [line] })),
    { cells: [] },
    { cells: header, style: 'header' },
    ...rows.map((cells) => ({ cells })),
    ...(footer.length ? [{ cells: [] }, ...footer.map((cells) => ({ cells, style: 'bold' as const }))] : []),
  ], widths);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

serve(async (req) => {
  const caller = await requireStaff(req);
  await takeRateLimit(serviceClient(), caller.id, 'export-gradebook');
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const db = caller.client; // the caller's own token: the database checks apply to every read

  // Which course, and is the caller one of its managers?
  let courseId: string;
  let assignment: { id: string; title: string; max_marks: number; due_at: string } | null = null;
  let exam: { id: string; title: string; pass_mark: number } | null = null;
  if (b.kind === 'gradebook') {
    courseId = b.courseId;
  } else if (b.kind === 'examination') {
    const { data } = await serviceClient().from('examinations').select('id, course_id, title, pass_mark').eq('id', b.examId).maybeSingle();
    if (!data) throw new HttpError(404, 'not_found', 'Examination not found');
    courseId = data.course_id;
    exam = data;
  } else {
    const { data } = await serviceClient().from('assignments').select('id, course_id, title, max_marks, due_at').eq('id', b.assignmentId).maybeSingle();
    if (!data) throw new HttpError(404, 'not_found', 'Assignment not found');
    courseId = data.course_id;
    assignment = data;
  }
  const { data: manages, error: manageError } = await db.rpc('i_manage_course', { p_course: courseId });
  if (manageError || manages !== true) throw new HttpError(403, 'forbidden', 'Only the course’s lecturers and administrators can export its grades');
  const { data: course } = await serviceClient().from('courses').select('title, course_code').eq('id', courseId).maybeSingle();
  const courseLine = `${course?.title ?? ''} (${course?.course_code ?? ''})`;

  let header: Cell[];
  let rows: Cell[][];
  let footer: Cell[][] = [];
  let heading: string[];
  let base: string;

  if (b.kind === 'gradebook') {
    const [cols, grades] = await Promise.all([db.rpc('gradebook_assignments', { p_course: courseId }), db.rpc('calculate_course_grades', { p_course: courseId })]);
    if (cols.error || grades.error) throw new HttpError(500, 'server_error', 'The gradebook could not be read');
    const assignments = (cols.data ?? []) as Array<{ assignment_id: string; title: string; max_marks: number }>;
    header = ['Learner', 'ID number', 'Branch', ...assignments.map((a) => `${a.title} (${num(a.max_marks)})`), 'Overall %', 'Grade', 'Status'];
    rows = ((grades.data ?? []) as Array<Record<string, unknown>>).map((g) => {
      const cells = (g.cells ?? []) as Array<{ assignment_id: string; state: string; score: unknown }>;
      return [
        `${g.first_name} ${g.second_name}`,
        num(g.id_number),
        (g.branch_name as string) ?? '',
        ...assignments.map((a) => {
          const c = cells.find((x) => x.assignment_id === a.assignment_id);
          return c ? cellText(c) : '';
        }),
        num(g.overall_percentage),
        (g.letter_grade as string) ?? '',
        STATUS[g.status as string] ?? '',
      ];
    });
    rows = byBranch(rows, 2);
    heading = [courseLine, 'Gradebook', `Exported ${today()} (Ghana time)`];
    base = `gradebook-${safeName(course?.course_code ?? 'course')}`;
  } else if (b.kind === 'examination') {
    const x = exam!;
    const [results, stats] = await Promise.all([db.rpc('exam_results', { p_exam: x.id }), db.rpc('assignment_statistics', { p_course: courseId })]);
    if (results.error || stats.error) throw new HttpError(500, 'server_error', 'The results could not be read');
    const list = (results.data ?? []) as Array<Record<string, unknown>>;
    const total = num(list[0]?.total_marks);
    header = ['Name', 'ID number', 'Branch', 'Examination', 'Submission date', 'Multiple choice', 'Short answer', 'Essay', 'Total', 'Maximum', 'Percentage', 'Result', 'Status', 'Marking', 'Feedback'];
    rows = byBranch(
      list.map((r) => [
        `${r.first_name} ${r.second_name}`,
        num(r.id_number),
        (r.branch_name as string) ?? '',
        x.title,
        ghanaDate(r.submitted_at as string | null),
        num(r.mcq_score),
        num(r.short_score),
        num(r.essay_score),
        num(r.total_score),
        num(r.total_marks),
        num(r.percentage),
        r.passed === true ? 'Pass' : r.passed === false ? 'Fail' : '',
        EXAM_STATE[r.state as string] ?? '',
        `${MARKING[r.grading_state as string] ?? ''}${r.released_at ? ' · released' : ''}`.replace(/^ · /, ''),
        (r.feedback as string) ?? '',
      ]),
      2,
    );
    const s = ((stats.data ?? []) as Array<Record<string, unknown>>).find((r) => r.assignment_id === x.id) ?? {};
    footer = [
      ['Learners', list.length],
      ['Submitted', list.filter((r) => r.state === 'SUBMITTED').length],
      ['Not submitted', list.filter((r) => r.state !== 'SUBMITTED').length],
      ['Released results', num(s.released)],
      ['Class average (%)', num(s.average)],
      ['Highest (%)', num(s.highest)],
      ['Lowest (%)', num(s.lowest)],
    ];
    heading = [courseLine, `Examination: ${x.title} (out of ${total ?? ''}, pass mark ${x.pass_mark}%)`, `Exported ${today()} (Ghana time)`];
    base = `exam-${safeName(x.title)}`;
  } else {
    const a = assignment!;
    const [results, summary] = await Promise.all([
      db.rpc('assignment_results', { p_assignment: a.id }),
      db.rpc('assignment_report_summary', { p_assignment: a.id }),
    ]);
    if (results.error || summary.error) throw new HttpError(500, 'server_error', 'The report could not be read');
    header = ['Name', 'ID number', 'Branch', 'Assignment', 'Submission date', 'Score', 'Maximum', 'Percentage', 'Status'];
    rows = ((results.data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.counted)
      .map((r) => [
        `${r.first_name} ${r.second_name}`,
        num(r.id_number),
        (r.branch_name as string) ?? '',
        a.title,
        ghanaDate(r.submitted_at as string | null),
        num(r.score),
        num(a.max_marks),
        num(r.percentage),
        RESULT[r.result as string] ?? '',
      ]);
    rows = byBranch(rows, 2);
    const s = ((summary.data ?? []) as Array<Record<string, unknown>>)[0] ?? {};
    footer = [
      ['Enrolled', num(s.enrolled)],
      ['Submitted', num(s.submitted)],
      ['Not submitted', num(s.not_submitted)],
      ['Graded', num(s.graded)],
      ['Class average (%)', num(s.average)],
      ['Highest (%)', num(s.highest)],
      ['Lowest (%)', num(s.lowest)],
    ];
    heading = [courseLine, `Assignment: ${a.title} (out of ${num(a.max_marks)})`, `Exported ${today()} (Ghana time)`];
    base = `report-${safeName(a.title)}`;
  }

  const bytes = b.format === 'csv' ? csv([header, ...rows, ...(footer.length ? [[], ...footer] : [])]) : xlsx(b.kind === 'gradebook' ? 'Gradebook' : b.kind === 'examination' ? 'Examination' : 'Report', heading, header, rows, footer);
  const { error: auditError } = await serviceClient().rpc('record_export', {
    p_actor: caller.id,
    p_kind: b.kind === 'gradebook' ? 'gradebook' : b.kind === 'examination' ? 'exam_results' : 'assignment_report',
    p_entity_type: b.kind === 'gradebook' ? 'course' : b.kind === 'examination' ? 'examination' : 'assignment',
    p_entity_id: b.kind === 'gradebook' ? courseId : b.kind === 'examination' ? exam!.id : assignment!.id,
    p_metadata: { course_id: courseId, format: b.format, rows: rows.length },
  });
  if (auditError) throw new HttpError(500, 'server_error', 'The export could not be recorded');
  return json(req, 200, {
    filename: `${base}.${b.format}`,
    contentType: b.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: base64(bytes),
  });
});
