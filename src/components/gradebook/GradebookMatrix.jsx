import { LearnerCell } from '@/components/grading/LearnerCell.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { formatPercentage } from '@/lib/grading/grading.js';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/gradebook/gradebook.js';
import { GradeCellView } from './GradeCellView.jsx';

// The course gradebook for its lecturers and administrators (Phase 10; D11, D13, D42; RESPONSIVE.md
// "Gradebook"): from tablet width a matrix that scrolls inside its own frame, with the learner column
// (photo, name, ID number, branch chip) and the header row sticky; on phones one card per learner with
// the overall grade and status, and the assignments behind "Assignments (N)". Every figure is from
// calculate_course_grades (D30).

/** @typedef {import('@/lib/gradebook/gradebook.js').LearnerGrades} LearnerGrades */
/** @typedef {import('@/lib/gradebook/gradebook.js').GradebookColumn} Column */

/** @param {{ row: LearnerGrades }} props */
function Overall({ row }) {
  return (
    <span className="flex flex-col items-start gap-1">
      {row.overall_percentage === null ? null : (
        <span className="whitespace-nowrap tabular-nums text-label text-ink">
          {formatPercentage(row.overall_percentage)}
          {row.letter_grade ? ` · ${row.letter_grade}` : ''}
        </span>
      )}
      <StatusChip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusChip>
    </span>
  );
}

/** @param {{ columns: Column[], learners: LearnerGrades[] }} props */
export function GradebookMatrix({ columns, learners }) {
  const cellOf = (/** @type {LearnerGrades} */ l, /** @type {string} */ id) => l.cells.find((c) => c.assignment_id === id);
  return (
    <div data-slot="gradebook">
      {/* Phones: one card per learner. */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 sm:hidden" aria-label="Gradebook">
        {learners.map((l) => (
          <li key={l.learner_id} className="flex flex-col gap-3 rounded-md border border-hairline bg-card p-4" data-slot="gradebook-card">
            {/* Stacked, so a long name is never cut short by the grade beside it on a narrow phone. */}
            <div className="flex flex-col gap-3">
              <LearnerCell row={l} />
              <Overall row={l} />
            </div>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer items-center text-label text-link focus-visible:focus-ring">
                Assignments ({columns.length})
              </summary>
              <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
                {columns.map((c) => (
                  <li key={c.assignment_id} className="flex min-h-11 items-start justify-between gap-3 py-2">
                    <span className="min-w-0 break-words text-body text-ink">{c.title}</span>
                    <GradeCellView cell={cellOf(l, c.assignment_id)} practical={c.part === 'PRACTICALS'} />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      {/* Tablets and desktops: the matrix. */}
      <div className="hidden max-h-gradebook overflow-auto rounded-md border border-hairline bg-card sm:block" tabIndex={0} role="region" aria-label="Gradebook, scrolls both ways">
        <table className="w-full border-separate border-spacing-0 text-left">
          <caption className="sr-only">Gradebook: each learner&apos;s result for every assignment, overall grade and status</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 min-w-gradebook-learner border-b border-hairline bg-card px-4 py-3 text-label text-ink-secondary">
                Learner
              </th>
              {columns.map((c) => (
                <th key={c.assignment_id} scope="col" className="sticky top-0 z-10 min-w-gradebook-cell border-b border-hairline bg-card px-3 py-3 align-bottom">
                  <span className="flex flex-col">
                    <span className="line-clamp-2 text-label text-ink">{c.title}</span>
                    <span className="text-caption text-ink-secondary">
                      out of {Number(c.max_marks)} · {c.category_name}
                      {c.published ? '' : ' · unpublished'}
                    </span>
                  </span>
                </th>
              ))}
              <th scope="col" className="sticky top-0 z-10 min-w-gradebook-cell border-b border-hairline bg-card px-3 py-3 text-label text-ink-secondary">
                Overall
              </th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.learner_id} data-slot="gradebook-row">
                <th scope="row" className="sticky left-0 z-10 border-b border-hairline bg-card px-4 py-3 text-left font-normal">
                  <LearnerCell row={l} />
                </th>
                {columns.map((c) => (
                  <td key={c.assignment_id} className="border-b border-hairline px-3 py-3 align-top">
                    <GradeCellView cell={cellOf(l, c.assignment_id)} practical={c.part === 'PRACTICALS'} />
                  </td>
                ))}
                <td className="border-b border-hairline px-3 py-3 align-top">
                  <Overall row={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
