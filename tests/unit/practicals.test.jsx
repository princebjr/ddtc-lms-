// @vitest-environment jsdom
// Phase 10.1, step A screens (ADR-016; owner request and answers of 2026-11-10):
// - learners grouped by branch: alphabetical, "No branch" last, on by default, switchable, remembered;
// - the practical mark sheet: grouped by branch, only changed rows are sent, marks are checked first, and
//   a changed released mark needs a reason;
// - the parts of the course grade: lecturers read-only; an administrator changes weights only after a
//   preview and with a reason, and switches an older course to the three parts;
// - an unmarked practical reads "Not marked", and a learner's practical is marked in person.
// The rules themselves are tested in pgTAP 24 and tests/functions/practicals.test.js.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradePartsCard } from '@/components/gradebook/GradePartsCard.jsx';
import { PracticalMarkSheet } from '@/components/gradebook/PracticalMarkSheet.jsx';
import { groupByBranch, sortByBranch } from '@/lib/branch-groups.js';
import { cellState } from '@/lib/gradebook/gradebook.js';
import LearnerAssignmentsPage from '@/pages/learner/LearnerAssignmentsPage.jsx';

const api = vi.hoisted(() => ({
  savePracticalMarks: vi.fn(),
  fetchCategories: vi.fn(),
  saveCategories: vi.fn(),
  fetchUsesStandardParts: vi.fn(),
  fetchWeightsLocked: vi.fn(),
  previewWeightsImpact: vi.fn(),
  previewStandardParts: vi.fn(),
  applyStandardParts: vi.fn(),
  fetchMyAssignments: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/hooks/use-profile-image.js', () => ({ useProfileImage: () => null }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/grading/grading.js', async (importOriginal) => ({ ...(await importOriginal()), savePracticalMarks: (/** @type {any} */ r) => api.savePracticalMarks(r) }));
vi.mock('@/lib/assignments/assignments.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCategories: (/** @type {string} */ id) => api.fetchCategories(id),
  saveCategories: (/** @type {any[]} */ ...a) => api.saveCategories(...a),
  fetchMyAssignments: () => api.fetchMyAssignments(),
}));
vi.mock('@/lib/gradebook/gradebook.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchUsesStandardParts: (/** @type {string} */ id) => api.fetchUsesStandardParts(id),
  fetchWeightsLocked: (/** @type {string} */ id) => api.fetchWeightsLocked(id),
  previewWeightsImpact: (/** @type {any[]} */ ...a) => api.previewWeightsImpact(...a),
  previewStandardParts: (/** @type {string} */ id) => api.previewStandardParts(id),
  applyStandardParts: (/** @type {any[]} */ ...a) => api.applyStandardParts(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('learners grouped by branch', () => {
  it('orders branches alphabetically with "No branch" last, keeping each group in order', () => {
    const rows = [
      { n: 'Yaw', branch_name: 'Kumasi' },
      { n: 'Esi', branch_name: null },
      { n: 'Abena', branch_name: 'Accra' },
      { n: 'Kwame', branch_name: 'Kumasi' },
    ];
    expect(groupByBranch(rows).map((g) => [g.branch, g.rows.map((r) => r.n)])).toEqual([
      ['Accra', ['Abena']],
      ['Kumasi', ['Yaw', 'Kwame']],
      ['No branch', ['Esi']],
    ]);
    expect(sortByBranch(rows).map((r) => r.n)).toEqual(['Abena', 'Yaw', 'Kwame', 'Esi']);
  });
});

/** @param {Partial<import('@/lib/grading/grading.js').ResultRow>} over @returns {import('@/lib/grading/grading.js').ResultRow} */
const row = (over) => ({
  learner_id: 'l1',
  first_name: 'Kwame',
  second_name: 'Mensah',
  id_number: 123456,
  branch_name: 'Kumasi',
  profile_image_path: null,
  enrolment_status: 'ACTIVE',
  counted: true,
  result: 'UNGRADED',
  submission_id: null,
  status: null,
  current_version: 0,
  submitted_at: null,
  is_late: false,
  extended_due_at: null,
  effective_due_at: '2030-01-20T23:59:00Z',
  score: null,
  max_marks: 30,
  percentage: null,
  letter_grade: null,
  band: null,
  grade_release_status: null,
  released_at: null,
  released_score: null,
  changed_since_release: false,
  graded_at: null,
  ...over,
});

describe('the practical mark sheet', () => {
  const rows = [
    row({}),
    row({ learner_id: 'l2', first_name: 'Abena', second_name: 'Frimpong', branch_name: 'Accra' }),
    row({
      learner_id: 'l3',
      first_name: 'Yaw',
      second_name: 'Darko',
      branch_name: null,
      result: 'GRADED',
      status: 'GRADED',
      score: 20,
      grade_release_status: 'RELEASED',
      released_at: '2030-01-21T10:00:00Z',
      released_score: 20,
    }),
  ];
  const current = [{ learner_id: 'l3', score: 20, feedback: 'Well led.' }];
  /** @param {() => void} [onSaved] */
  const show = (onSaved = vi.fn()) =>
    render(<PracticalMarkSheet assignmentId="p1" maxMarks={30} rows={rows} current={current} readOnly={false} onSaved={onSaved} />);

  it('opens grouped by branch, "No branch" last, with each branch\'s count', () => {
    show();
    const groups = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groups).toEqual(['Accra, 1 learner', 'Kumasi, 1 learner', 'No branch, 1 learner']);
    expect(screen.getByTestId('mark-sheet-summary').textContent).toBe('1 of 3 marked');
    expect(screen.getAllByText('Not marked')).toHaveLength(2);
    expect((/** @type {HTMLTextAreaElement} */ (screen.getAllByLabelText('Comment (optional)')[2])).value).toBe('Well led.');
  });

  it('can be shown ungrouped, and remembers the choice', () => {
    show();
    fireEvent.click(screen.getByRole('switch', { name: 'Group by branch' }));
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(window.localStorage.getItem('ddtc.groupByBranch')).toBe('off');
  });

  it('sends only the marks that changed, after checking them', async () => {
    api.savePracticalMarks.mockResolvedValue({ saved: 2 });
    const onSaved = vi.fn();
    show(onSaved);
    const [accra, kumasi] = screen.getAllByLabelText('Mark out of 30');
    fireEvent.change(kumasi, { target: { value: '31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks (1)' }));
    expect(await screen.findByText('Kwame Mensah: the mark must be between 0 and 30, with up to two decimals')).toBeTruthy();
    expect(api.savePracticalMarks).not.toHaveBeenCalled();
    fireEvent.change(kumasi, { target: { value: '25' } });
    fireEvent.change(accra, { target: { value: '18.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks (2)' }));
    await waitFor(() =>
      expect(api.savePracticalMarks).toHaveBeenCalledWith({
        assignmentId: 'p1',
        marks: [
          { learnerId: 'l1', score: 25, feedback: '' },
          { learnerId: 'l2', score: 18.5, feedback: '' },
        ],
      }),
    );
    expect(toast.show).toHaveBeenCalledWith('lecturer.grade-draft-saved');
    expect(onSaved).toHaveBeenCalled();
  });

  it('asks for a reason before changing a released mark', async () => {
    api.savePracticalMarks.mockResolvedValue({ saved: 1 });
    show();
    fireEvent.change(screen.getAllByLabelText('Mark out of 30')[2], { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks (1)' }));
    expect(await screen.findByText('Give a reason for changing a released mark')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason for changing a released mark'), { target: { value: 'Marked again after review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save marks (1)' }));
    await waitFor(() =>
      expect(api.savePracticalMarks).toHaveBeenCalledWith({
        assignmentId: 'p1',
        marks: [{ learnerId: 'l3', score: 22, feedback: 'Well led.' }],
        reason: 'Marked again after review',
      }),
    );
  });
});

describe('the parts of the course grade', () => {
  const parts = [
    { id: 'k1', name: 'Weekly assignments', weight: 40, position: 1, part: 'ASSIGNMENTS' },
    { id: 'k2', name: 'Local Assembly practicals', weight: 30, position: 2, part: 'PRACTICALS' },
    { id: 'k3', name: 'Final examinations', weight: 30, position: 3, part: 'EXAMINATIONS' },
  ];

  it('are read-only for lecturers', async () => {
    api.fetchCategories.mockResolvedValue(parts);
    api.fetchUsesStandardParts.mockResolvedValue(true);
    api.fetchWeightsLocked.mockResolvedValue(false);
    render(<GradePartsCard courseId="c1" archived={false} admin={false} />);
    expect(await screen.findByText('Only an administrator can change the weights.')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Weekly assignments').length).toBeGreaterThan(0));
    expect(screen.getByText('Total 100%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change weights' })).toBeNull();
  });

  it('an administrator previews the effect and gives a reason before saving', async () => {
    api.fetchCategories.mockResolvedValue(parts);
    api.fetchUsesStandardParts.mockResolvedValue(true);
    api.fetchWeightsLocked.mockResolvedValue(true);
    api.previewWeightsImpact.mockResolvedValue([{ learner_id: 'l1', first_name: 'Kwame', second_name: 'Mensah', current_overall: 80, new_overall: 82.5 }]);
    api.saveCategories.mockResolvedValue({ total: 100, ready: true });
    render(<GradePartsCard courseId="c1" archived={false} admin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change weights' }));
    const dialog = screen.getByRole('dialog', { name: 'Change weights' });
    fireEvent.change(within(dialog).getByLabelText('Weekly assignments'), { target: { value: '50' } });
    fireEvent.change(within(dialog).getByLabelText('Final examinations'), { target: { value: '20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save weights' }));
    expect(await within(dialog).findByText('Give a reason for changing the grade weights')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Fewer examination marks' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save weights' }));
    expect(await within(dialog).findByText('Preview the effect on overall grades first')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preview the effect' }));
    expect(await within(dialog).findByText('80% → 82.5%')).toBeTruthy();
    expect(api.previewWeightsImpact).toHaveBeenCalledWith('c1', [
      { id: 'k1', weight: 50 },
      { id: 'k2', weight: 30 },
      { id: 'k3', weight: 20 },
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save weights' }));
    await waitFor(() =>
      expect(api.saveCategories).toHaveBeenCalledWith(
        'c1',
        [
          { id: 'k1', weight: 50 },
          { id: 'k2', weight: 30 },
          { id: 'k3', weight: 20 },
        ],
        'Fewer examination marks',
      ),
    );
    expect(toast.show).toHaveBeenCalledWith('lecturer.categories-saved');
  });

  it('an administrator switches an older course to the three parts', async () => {
    api.fetchCategories.mockResolvedValue([{ id: 'x1', name: 'Assignments', weight: 100, position: 1, part: 'ASSIGNMENTS' }]);
    api.fetchUsesStandardParts.mockResolvedValue(false);
    api.fetchWeightsLocked.mockResolvedValue(true);
    api.previewStandardParts.mockResolvedValue([]);
    api.applyStandardParts.mockResolvedValue({ applied: true });
    render(<GradePartsCard courseId="c9" archived={false} admin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to the three parts' }));
    const dialog = screen.getByRole('dialog', { name: 'Switch to the three parts' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Moving to the DDTC standard' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preview the effect' }));
    expect(await within(dialog).findByText("No learner's overall grade would change.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch the course' }));
    await waitFor(() => expect(api.applyStandardParts).toHaveBeenCalledWith('c9', 'Moving to the DDTC standard'));
  });
});

describe('practicals elsewhere', () => {
  it('an unmarked practical reads "Not marked"', () => {
    expect(cellState('UNGRADED', 'staff', true).label).toBe('Not marked');
    expect(cellState('UNGRADED', 'learner', true).label).toBe('Not marked yet');
    expect(cellState('UNGRADED', 'staff').label).toBe('Ungraded');
  });

  it("the learner's Assignments list shows a practical as marked in person, not something to send", async () => {
    api.fetchMyAssignments.mockResolvedValue([
      {
        id: 'p1',
        course_id: 'c1',
        title: 'Leading a prayer meeting',
        content_type: 'TEXT',
        due_at: '2099-01-20T23:59:00Z',
        allow_late: false,
        course: { title: 'Introduction to Biblical Studies', course_code: 'BIB101' },
        category: { part: 'PRACTICALS' },
        extended_to: null,
        submission: null,
        grade: null,
      },
    ]);
    render(
      <MemoryRouter>
        <LearnerAssignmentsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Leading a prayer meeting/ });
      expect(within(link).getByText('Marked in person')).toBeTruthy();
      expect(within(link).getByText(/Local Assembly practical/)).toBeTruthy();
    });
  });
});
