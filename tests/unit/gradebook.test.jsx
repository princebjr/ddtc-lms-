// @vitest-environment jsdom
// Phase 10: the gradebook screens (D11 to D16, D30; owner request of 2026-11-10: each course has its own
// gradebook, and a learner sees one course's grades apart from another's). Every figure comes from the
// database (mocked here with fixed values); the screens only show them:
// - Grades and feedback lists the learner's courses, each with its own course grade, opening that
//   course's gradebook; the course gradebook shows only that course's results (released score and
//   feedback, "Awaiting grade" with no score), the course grade and its status, and the chart only
//   when the class is large enough (D15), with the learner's band highlighted;
// - the staff matrix shows every D11 state distinctly, in words;
// - the chart's bars and counts are exactly the data it is given (exit gate);
// - Review and release lists every draft and releases them all; Export sends the chosen kind and format.
// The formulas and access rules are tested in pgTAP 22 and 23; the functions in tests/functions.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DistributionChart } from '@/components/gradebook/DistributionChart.jsx';
import { ExportDialog } from '@/components/gradebook/ExportDialog.jsx';
import { GradebookMatrix } from '@/components/gradebook/GradebookMatrix.jsx';
import { ReviewReleaseDialog } from '@/components/gradebook/ReviewReleaseDialog.jsx';
import { cellState, chartSummary } from '@/lib/gradebook/gradebook.js';
import LearnerCourseGradesPage from '@/pages/learner/LearnerCourseGradesPage.jsx';
import LearnerGradesPage from '@/pages/learner/LearnerGradesPage.jsx';

const api = vi.hoisted(() => ({
  fetchCourseGradebook: vi.fn(),
  fetchMyCourseGrades: vi.fn(),
  fetchReleasePreview: vi.fn(),
  releaseCourseGrades: vi.fn(),
  exportGrades: vi.fn(),
  downloadFile: vi.fn(),
  fetchMyGrades: vi.fn(),
  fetchCourse: vi.fn(),
  rpc: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({ rpc: api.rpc }) }));
vi.mock('@/hooks/use-profile-image.js', () => ({ useProfileImage: () => null }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/gradebook/gradebook.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCourseGradebook: (/** @type {string} */ id) => api.fetchCourseGradebook(id),
  fetchMyCourseGrades: () => api.fetchMyCourseGrades(),
  fetchReleasePreview: (/** @type {string} */ id) => api.fetchReleasePreview(id),
  releaseCourseGrades: (/** @type {string} */ id) => api.releaseCourseGrades(id),
  exportGrades: (/** @type {unknown} */ r) => api.exportGrades(r),
  downloadFile: (/** @type {unknown} */ f) => api.downloadFile(f),
}));
vi.mock('@/lib/grading/grading.js', async (importOriginal) => ({ ...(await importOriginal()), fetchMyGrades: () => api.fetchMyGrades() }));
vi.mock('@/lib/courses/courses.js', async (importOriginal) => ({ ...(await importOriginal()), fetchCourse: (/** @type {string} */ id) => api.fetchCourse(id) }));
// jsdom has no layout: give the chart a width so it draws.
vi.mock('@/components/data/ResponsiveChart.jsx', () => ({
  ResponsiveChart: (/** @type {{ title: string, summary: string, children: (s: { width: number, compact: boolean }) => import('react').ReactNode }} */ p) => (
    <figure>
      <div>{p.title}</div>
      {p.children({ width: 600, compact: false })}
      <figcaption>{p.summary}</figcaption>
    </figure>
  ),
}));

/** @typedef {import('@/lib/gradebook/gradebook.js').GradeCell} GradeCell */
/** @typedef {import('@/lib/gradebook/gradebook.js').LearnerGrades} LearnerGrades */

/** @param {Partial<GradeCell>} over @returns {GradeCell} */
const cell = (over) => ({
  assignment_id: 'a1',
  category_id: 'k1',
  state: 'RELEASED',
  score: 15.5,
  max_marks: 20,
  is_late: false,
  counted: true,
  published: true,
  effective_due_at: '2030-01-20T23:59:00Z',
  percentage: 77.5,
  letter_grade: 'B',
  band: '70-79%',
  ...over,
});

/** @param {Partial<LearnerGrades>} over @returns {LearnerGrades} */
const learner = (over) => ({
  learner_id: 'l1',
  first_name: 'Kwame',
  second_name: 'Mensah',
  id_number: 123456,
  branch_name: 'Kumasi',
  profile_image_path: null,
  enrolment_status: 'ACTIVE',
  overall_percentage: 77.5,
  letter_grade: 'B',
  band: '70-79%',
  status: 'PROVISIONAL',
  categories: [],
  cells: [cell({})],
  ...over,
});

/** @type {import('@/lib/gradebook/gradebook.js').GradebookColumn[]} */
const columns = [
  { assignment_id: 'a1', title: 'Covenant essay', category_id: 'k1', category_name: 'Assignments', max_marks: 20, due_at: '2030-01-20T23:59:00Z', published: true , part: 'ASSIGNMENTS' },
  { assignment_id: 'a2', title: 'Reflection on Genesis 1', category_id: 'k1', category_name: 'Assignments', max_marks: 20, due_at: '2030-02-20T23:59:00Z', published: true , part: 'ASSIGNMENTS' },
];

const DISTRIBUTION = [
  { band: '0-49%', count: 1 },
  { band: '50-59%', count: 0 },
  { band: '60-69%', count: 2 },
  { band: '70-79%', count: 5 },
  { band: '80-89%', count: 3 },
  { band: '90-100%', count: 1 },
];

beforeEach(() => vi.clearAllMocks());

// Phase 13 (WCAG 1.1.1): the drawing is hidden from screen readers; a table they read gives every band.
describe('the distribution chart for screen readers', () => {
  it('lists every band with its count, and marks the learner\'s own band', () => {
    render(
      <DistributionChart
        title="Score distribution"
        summary="2 of 3 learners scored 70-79%, the largest group."
        distribution={[{ band: '60-69%', count: 1 }, { band: '70-79%', count: 2 }]}
        ownBand="70-79%"
      />,
    );
    const table = screen.getByTestId('distribution-table');
    // Hidden visually by its wrapper (a table ignores sr-only's 1 px box and would widen small phones' pages).
    expect(table.parentElement?.className).toMatch(/\bsr-only\b/);
    expect(table.className).not.toMatch(/sr-only/);
    expect(within(table).getByText('Score distribution: learners in each band')).toBeTruthy();
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['60-69%1', '70-79% (your band)2']);
  });
});

describe('Grades and feedback: one card per course (owner request)', () => {
  it('shows each course with its own grade and status, current and completed apart, each opening its own gradebook', async () => {
    api.fetchMyCourseGrades.mockResolvedValue([
      { course: { id: 'c1', title: 'Introduction to Biblical Studies', course_code: 'BIB101' }, enrolment_status: 'ACTIVE', grade: learner({}) },
      {
        course: { id: 'c2', title: 'Principles of Discipleship', course_code: 'DIS201' },
        enrolment_status: 'COMPLETED',
        grade: learner({ overall_percentage: 45, letter_grade: 'F', status: 'FINAL', cells: [cell({ score: 9, percentage: 45 })] }),
      },
      {
        course: { id: 'c3', title: 'Prayer and Worship', course_code: 'PRW110' },
        enrolment_status: 'ACTIVE',
        grade: learner({ overall_percentage: null, letter_grade: null, band: null, status: 'NOT_AVAILABLE', cells: [cell({ state: 'NOT_DUE', score: null })] }),
      },
    ]);
    render(
      <MemoryRouter>
        <LearnerGradesPage />
      </MemoryRouter>,
    );
    const current = await screen.findByRole('list', { name: 'Current courses' });
    const completed = await screen.findByRole('list', { name: 'Completed courses' });
    const bib = within(current).getByRole('link', { name: /Introduction to Biblical Studies/ });
    expect(bib.getAttribute('href')).toBe('/learner/courses/c1/grades');
    expect(within(bib).getByText('77.5% · B')).toBeTruthy();
    expect(within(bib).getByText('Provisional')).toBeTruthy();
    expect(within(bib).getByText('1 of 1 assignment graded')).toBeTruthy();
    const prw = within(current).getByRole('link', { name: /Prayer and Worship/ });
    expect(within(prw).getByText('Not yet available')).toBeTruthy();
    const dis = within(completed).getByRole('link', { name: /Principles of Discipleship/ });
    expect(dis.getAttribute('href')).toBe('/learner/courses/c2/grades');
    expect(within(dis).getByText('45% · F')).toBeTruthy();
    expect(within(dis).getByText('Final')).toBeTruthy();
    // One course's grade never appears on another's card.
    expect(within(bib).queryByText('45% · F')).toBeNull();
  });

  it('says when there are no courses yet', async () => {
    api.fetchMyCourseGrades.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <LearnerGradesPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No courses yet')).toBeTruthy();
  });
});

describe("The learner's gradebook for one course", () => {
  /** @param {{ chartVisible?: boolean }} [o] */
  const setUp = ({ chartVisible = true } = {}) => {
    api.fetchCourse.mockResolvedValue({ id: 'c1', title: 'Introduction to Biblical Studies', course_code: 'BIB101' });
    api.fetchCourseGradebook.mockResolvedValue({
      columns,
      learners: [
        learner({
          categories: [
            { category_id: 'k1', name: 'Assignments', weight: 70, earned: 15.5, possible: 20, counted_items: 1, percentage: 77.5 },
            { category_id: 'k2', name: 'Practical', weight: 30, earned: 0, possible: 0, counted_items: 0, percentage: null },
          ],
          cells: [cell({}), cell({ assignment_id: 'a2', state: 'UNGRADED', score: null, percentage: null, letter_grade: null, band: null, counted: false })],
        }),
      ],
      stats: [
        { assignment_id: 'a1', released: 12, ungraded: 1, missing: 2, average: 72, highest: 95, lowest: 40, distribution: DISTRIBUTION, chart_visible: chartVisible, my_band: chartVisible ? '70-79%' : null },
      ],
    });
    api.fetchMyGrades.mockResolvedValue([
      { course_id: 'c1', assignment_id: 'a1', state: 'RELEASED', feedback: 'Good reading of the text.' },
      // Another course's feedback must not appear on this course's page.
      { course_id: 'c2', assignment_id: 'a9', state: 'RELEASED', feedback: 'From another course.' },
    ]);
    render(
      <MemoryRouter initialEntries={['/learner/courses/c1/grades']}>
        <Routes>
          <Route path="/learner/courses/:courseId/grades" element={<LearnerCourseGradesPage />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('shows the course grade, its categories, and each assignment: released score and feedback, or Awaiting grade with no score', async () => {
    setUp();
    // Retried until the content has settled (the skeleton may hold its 300 ms after a first paint).
    await waitFor(() => {
      expect(screen.getAllByTestId('course-grade')[0].textContent).toBe('77.5% · B');
      expect(api.fetchCourseGradebook).toHaveBeenCalledWith('c1');
      expect(screen.getAllByText('Provisional').length).toBeGreaterThan(0);
      expect(screen.getByText('Band 70-79%')).toBeTruthy();
      const categories = screen.getByRole('list', { name: 'Categories' });
      expect(within(categories).getByText('77.5%')).toBeTruthy();
      expect(within(categories).getByText('—')).toBeTruthy();
      expect(screen.getAllByText('15.5 / 20').length).toBeGreaterThan(0);
      // Step 10.2: no letter grade on an assignment; the letter is on the course grade above.
      expect(screen.getAllByText('Graded').length).toBeGreaterThan(0);
      expect(screen.queryByText('Graded · B')).toBeNull();
      expect(screen.getAllByText('Good reading of the text.').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Awaiting grade').length).toBeGreaterThan(0);
      expect(screen.getAllByText('— / 20').length).toBeGreaterThan(0);
      expect(screen.queryByText('From another course.')).toBeNull();
      expect(screen.getByRole('link', { name: 'All my courses' }).getAttribute('href')).toBe('/learner/grades');
    });
  });

  it('shows the class chart with the learner\'s own band when the class is large enough, and none when it is not (D15)', async () => {
    setUp();
    await waitFor(() => {
      expect(screen.getByText('How the class scored')).toBeTruthy();
      expect(screen.getByText('Your score')).toBeTruthy();
      expect(screen.getByText(/Your score \(77.5%\) is in band 70-79%, highlighted. A band is not a rank./)).toBeTruthy();
    });
  });

  it('hides the chart below the minimum class size', async () => {
    setUp({ chartVisible: false });
    await waitFor(() => {
      expect(screen.getAllByTestId('course-grade').length).toBeGreaterThan(0);
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });
    expect(screen.queryByText('How the class scored')).toBeNull();
    expect(screen.queryByText('Your score')).toBeNull();
  });
});

describe('The staff gradebook matrix (D11 states)', () => {
  it('shows every state in words, the overall grade and its status, and the learner with ID and branch', () => {
    const states = /** @type {const} */ (['RELEASED', 'DRAFT', 'UNGRADED', 'COUNTED_ZERO', 'MISSING', 'NOT_DUE']);
    const cols = states.map((s, i) => ({ ...columns[0], assignment_id: `a${i}`, title: `Work ${s}` }));
    const row = learner({
      cells: states.map((s, i) =>
        cell({
          assignment_id: `a${i}`,
          state: s,
          score: s === 'RELEASED' ? 18 : s === 'DRAFT' ? 12 : s === 'COUNTED_ZERO' ? 0 : null,
          is_late: s === 'RELEASED',
        }),
      ),
    });
    render(<GradebookMatrix columns={cols} learners={[row]} />);
    const card = screen.getByRole('list', { name: 'Gradebook' });
    for (const label of ['Draft', 'Ungraded', 'Counted as 0', 'Missing', 'Not yet due', 'Late', 'Provisional']) {
      expect(within(card).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(card).getByText('18 / 20')).toBeTruthy();
    expect(within(card).getByText('12 / 20')).toBeTruthy();
    expect(within(card).getByText('0 / 20')).toBeTruthy();
    expect(within(card).getByText('77.5% · B')).toBeTruthy();
    expect(within(card).getByText('Kumasi')).toBeTruthy();
    // The matrix has the learner as a row header, so the learner column can stay in view.
    expect(screen.getAllByRole('rowheader').length).toBe(1);
  });

  it('labels a state for learners without staff words', () => {
    expect(cellState('RELEASED', 'learner').label).toBe('Graded');
    expect(cellState('UNGRADED', 'learner').label).toBe('Awaiting grade');
    expect(cellState('RELEASED').label).toBe('Released');
  });
});

describe('Score distribution chart (exit gate: counts equal the data)', () => {
  it('draws one bar per band with exactly the given count, and highlights the learner\'s band', () => {
    const { container } = render(<DistributionChart title="Score distribution" summary="summary" distribution={DISTRIBUTION} ownBand="70-79%" />);
    const bars = [...container.querySelectorAll('[data-band]')];
    expect(bars.map((b) => [b.getAttribute('data-band'), Number(b.getAttribute('data-count'))])).toEqual(DISTRIBUTION.map((d) => [d.band, d.count]));
    for (const d of DISTRIBUTION) expect(within(/** @type {HTMLElement} */ (container.querySelector(`[data-band="${d.band}"]`))).getByText(String(d.count))).toBeTruthy();
    expect(screen.getByText('Percentage scored')).toBeTruthy();
    expect(screen.getByText('Number of learners')).toBeTruthy();
    expect(screen.getByText('Your score')).toBeTruthy();
    // Tap a bar to see its value.
    fireEvent.click(/** @type {Element} */ (container.querySelector('[data-band="80-89%"]')));
    expect(screen.getByText('80-89%: 3 learners')).toBeTruthy();
  });

  it('summarises the chart in words', () => {
    const s = { assignment_id: 'a1', released: 12, ungraded: 1, missing: 2, average: 72, highest: 95, lowest: 40, distribution: DISTRIBUTION, chart_visible: true, my_band: null };
    expect(chartSummary(s)).toBe('5 of 12 learners scored 70-79%, the largest group. 12 graded, 1 ungraded, 2 missing.');
    expect(chartSummary({ ...s, distribution: DISTRIBUTION.map((d) => ({ ...d, count: 0 })) })).toBe('No released grades yet.');
  });
});

describe('Review and release (owner decision 1)', () => {
  it('lists every draft by assignment, marks changed grades, and releases them all', async () => {
    api.fetchReleasePreview.mockResolvedValue([
      { assignment_id: 'a1', assignment_title: 'Covenant essay', learner_id: 'l1', first_name: 'Kwame', second_name: 'Mensah', id_number: 123456, branch_name: 'Kumasi', score: 15, max_marks: 20, percentage: 75, letter_grade: 'B', changed: false, released_score: null },
      { assignment_id: 'a1', assignment_title: 'Covenant essay', learner_id: 'l2', first_name: 'Abena', second_name: 'Frimpong', id_number: 234567, branch_name: null, score: 17, max_marks: 20, percentage: 85, letter_grade: 'A', changed: true, released_score: 14 },
      { assignment_id: 'a2', assignment_title: 'Prayer journal', learner_id: 'l1', first_name: 'Kwame', second_name: 'Mensah', id_number: 123456, branch_name: 'Kumasi', score: 18, max_marks: 20, percentage: 90, letter_grade: 'A', changed: false, released_score: null },
    ]);
    api.releaseCourseGrades.mockResolvedValue({ released: 3 });
    const onReleased = vi.fn();
    const onClose = vi.fn();
    render(<ReviewReleaseDialog courseId="c1" onClose={onClose} onReleased={onReleased} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Covenant essay (2)' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Prayer journal (1)' })).toBeTruthy();
      expect(screen.getByText('Changed, was 14 / 20')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Release all (3)' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Release all (3)' }));
    await waitFor(() => expect(api.releaseCourseGrades).toHaveBeenCalledWith('c1'));
    // Two learners receive grades.
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('lecturer.grades-released', { params: { n: '2' } }));
    expect(onReleased).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server\'s refusal (weights not totalling 100) and keeps the dialog open', async () => {
    api.fetchReleasePreview.mockResolvedValue([
      { assignment_id: 'a1', assignment_title: 'Covenant essay', learner_id: 'l1', first_name: 'Kwame', second_name: 'Mensah', id_number: 123456, branch_name: null, score: 15, max_marks: 20, percentage: 75, letter_grade: 'B', changed: false, released_score: null },
    ]);
    api.releaseCourseGrades.mockRejectedValue(new Error('The category weights must total 100% before grades are released'));
    const onClose = vi.fn();
    render(<ReviewReleaseDialog courseId="c1" onClose={onClose} onReleased={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Release all (1)' }));
    expect(await screen.findByText('The category weights must total 100% before grades are released')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Export (owner request 2026-11-06)', () => {
  it('exports the gradebook or an assignment report in the chosen format, then offers it again', async () => {
    api.rpc.mockResolvedValue({ data: [{ assignment_id: 'a1', title: 'Covenant essay' }, { assignment_id: 'a2', title: 'Prayer journal' }], error: null });
    const file = { filename: 'gradebook-BIB101.xlsx', contentType: 'x', content: 'UEs=' };
    api.exportGrades.mockResolvedValue(file);
    const onClose = vi.fn();
    render(<ExportDialog role="lecturer" courseId="c1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(api.exportGrades).toHaveBeenCalledWith({ kind: 'gradebook', courseId: 'c1', format: 'xlsx' }));
    expect(api.downloadFile).toHaveBeenCalledWith(file);
    expect(toast.show).toHaveBeenCalledWith('lecturer.gradebook-export-ready', expect.objectContaining({ onAction: expect.any(Function) }));
    expect(onClose).toHaveBeenCalled();
  });

  it('picks the course, the assignment and CSV for a report', async () => {
    api.rpc.mockResolvedValue({ data: [{ assignment_id: 'a1', title: 'Covenant essay' }, { assignment_id: 'a2', title: 'Prayer journal' }], error: null });
    api.exportGrades.mockResolvedValue({ filename: 'r.csv', contentType: 'text/csv', content: '' });
    const courses = [
      { id: 'c1', title: 'Introduction to Biblical Studies', course_code: 'BIB101' },
      { id: 'c2', title: 'Principles of Discipleship', course_code: 'DIS201' },
    ];
    render(<ExportDialog role="admin" courses={courses} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'c2' } });
    await waitFor(() => expect(api.rpc).toHaveBeenCalledWith('gradebook_assignments', { p_course: 'c2' }));
    fireEvent.click(screen.getByLabelText("One assignment's performance report"));
    fireEvent.click(screen.getByLabelText('CSV (.csv)'));
    const select = await screen.findByLabelText('Assignment');
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(2));
    fireEvent.change(select, { target: { value: 'a2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(api.exportGrades).toHaveBeenCalledWith({ kind: 'assignment', assignmentId: 'a2', format: 'csv' }));
    expect(toast.show).toHaveBeenCalledWith('admin.export-ready', expect.anything());
  });
});

describe('the gradebook grouped by branch (Phase 10.1; owner answer of 2026-11-10)', () => {
  it('puts each branch under its heading, "No branch" last, on phones and in the matrix', () => {
    const learners = [
      learner({ learner_id: 'l1', first_name: 'Kwame', branch_name: 'Sampa' }),
      learner({ learner_id: 'l2', first_name: 'Abena', branch_name: null }),
      learner({ learner_id: 'l3', first_name: 'Yaw', branch_name: 'Kasoa C.P' }),
    ];
    const { container } = render(<GradebookMatrix columns={columns} learners={learners} grouped />);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')).filter((l) => l && / learners?$/.test(l))).toEqual([
      'Kasoa C.P, 1 learner',
      'Sampa, 1 learner',
      'No branch, 1 learner',
    ]);
    expect([...container.querySelectorAll('tbody[data-branch]')].map((b) => b.getAttribute('data-branch'))).toEqual(['Kasoa C.P', 'Sampa', 'No branch']);
    expect(screen.getAllByRole('columnheader').some((h) => h.getAttribute('scope') === 'colgroup')).toBe(true);
  });
});

describe('the course grade tag (Step 10.2; owner request 2026-11-10)', () => {
  it('carries the letter grade for the course, provisional or final, and nothing before a grade counts', async () => {
    const { courseGradeTag } = await import('@/lib/gradebook/gradebook.js');
    expect(courseGradeTag(learner({ status: 'FINAL', overall_percentage: 77.5, letter_grade: 'B' }))).toEqual({ label: 'Course grade 77.5% · B', tone: 'success' });
    expect(courseGradeTag(learner({ status: 'PROVISIONAL', overall_percentage: 81.4, letter_grade: 'A' }))).toEqual({
      label: 'Course grade 81.4% · A (provisional)',
      tone: 'warning',
    });
    expect(courseGradeTag(learner({ status: 'NOT_AVAILABLE', overall_percentage: null, letter_grade: null }))).toBeNull();
    expect(courseGradeTag(null)).toBeNull();
  });
});
