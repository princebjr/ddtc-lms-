import { StatusChip } from '@/components/ui/status-chip.jsx';
import { formatScore } from '@/lib/grading/grading.js';
import { cellState } from '@/lib/gradebook/gradebook.js';

// One gradebook cell (D11): every state is distinct in words as well as colour. A released score shows
// the score out of the maximum; a draft shows its score with a Draft chip (staff only: the database
// never sends a learner a draft); counted-as-zero, missing, ungraded and not-yet-due show their chip;
// late work carries a Late chip. The figures are the database's (D30).

/**
 * @param {{ cell: import('@/lib/gradebook/gradebook.js').GradeCell | undefined, audience?: 'staff' | 'learner' }} props
 */
export function GradeCellView({ cell, audience = 'staff' }) {
  if (!cell) return <span className="text-ink-secondary">—</span>;
  const s = cellState(cell.state, audience);
  const scored = cell.state === 'RELEASED' || cell.state === 'DRAFT' || cell.state === 'COUNTED_ZERO';
  return (
    <span className="flex flex-col items-start gap-1" data-state={cell.state}>
      {scored ? <span className="whitespace-nowrap tabular-nums text-ink">{formatScore(cell.score, cell.max_marks)}</span> : null}
      {cell.state === 'RELEASED' ? null : <StatusChip tone={s.tone}>{s.label}</StatusChip>}
      {cell.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
    </span>
  );
}
