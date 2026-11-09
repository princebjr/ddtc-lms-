import { History } from 'lucide-react';
import { formatDue } from '@/lib/assignments/due.js';
import { isSet } from '@/lib/grading/grading.js';

// The grade history (Phase 9; D30): every grade saved or changed, every release and every reopening,
// newest first, with who did it, when (Ghana time) and the reason. Read-only: the database refuses any
// change to it. Collapsed by default behind its summary so the grading panel stays short.

/**
 * @typedef {object} HistoryEntry
 * @property {'SAVED' | 'RELEASED' | 'REOPENED'} event
 * @property {number | null} previous_score
 * @property {number | null} new_score
 * @property {string | null} previous_feedback
 * @property {string | null} new_feedback
 * @property {string | null} reason
 * @property {string} changed_at
 * @property {string | null} changed_by_name
 */

/** @param {number | null} n */
const num = (n) => (!isSet(n) ? '—' : String(Number(n)));

/** @param {HistoryEntry} h */
function describe(h) {
  if (h.event === 'RELEASED') return !isSet(h.previous_score) ? `Released ${num(h.new_score)}` : `Released ${num(h.new_score)} (was ${num(h.previous_score)})`;
  if (h.event === 'REOPENED') return 'Reopened';
  if (!isSet(h.previous_score)) return `Graded ${num(h.new_score)}`;
  if (Number(h.previous_score) === Number(h.new_score)) return 'Feedback changed';
  return `Changed ${num(h.previous_score)} to ${num(h.new_score)}`;
}

/** @param {{ entries: HistoryEntry[], maxMarks: number }} props */
export function GradeHistory({ entries, maxMarks }) {
  if (!entries.length) return null;
  return (
    <details className="group rounded-lg border border-hairline bg-card" data-slot="grade-history">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-label text-ink focus-visible:focus-ring">
        <History className="size-4 text-ink-secondary" aria-hidden="true" />
        Grade history: {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </summary>
      <ol className="m-0 flex list-none flex-col gap-3 border-t border-hairline p-4">
        {entries.map((h, i) => (
          <li key={`${h.changed_at}-${i}`} className="flex flex-col gap-1">
            <span className="text-body text-ink">
              {describe(h)}
              {h.event !== 'REOPENED' && isSet(h.new_score) ? <span className="text-ink-secondary"> out of {num(maxMarks)}</span> : null}
            </span>
            <span className="text-caption text-ink-secondary tabular-nums">
              {h.changed_by_name ?? 'Someone'}, {formatDue(h.changed_at)}
            </span>
            {h.reason ? <span className="text-body-sm text-ink">Reason: {h.reason}</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
