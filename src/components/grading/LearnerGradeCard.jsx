import { Award } from 'lucide-react';
import { Card } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { formatDue } from '@/lib/assignments/due.js';
import { formatPercentage, formatScore } from '@/lib/grading/grading.js';

// The learner's released grade (Phase 9; D14, D15, D16; owner decision 2): score out of the maximum,
// percentage and band as the database computed them, the feedback, and when it was released; "Updated"
// when a later release changed it. Only ever a released grade. Since Step 10.2 (owner request
// 2026-11-10) no letter grade on a single piece of work: the letter belongs to the course grade.

/** @param {{ grade: import('@/lib/grading/grading.js').MyGrade }} props */
export function LearnerGradeCard({ grade }) {
  return (
    <Card className="flex flex-col gap-4" aria-labelledby="my-grade-title" data-slot="learner-grade">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-grade-title" className="m-0 flex items-center gap-2 text-headline text-ink">
          <Award className="size-5 text-link" aria-hidden="true" />
          Your grade
        </h2>
        {grade.updated ? <StatusChip tone="info">Updated</StatusChip> : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-large-title tabular-nums text-ink">{formatScore(grade.score, grade.max_marks)}</span>
        <span className="text-headline tabular-nums text-ink">{formatPercentage(grade.percentage)}</span>
      </div>
      {grade.band ? <p className="m-0 text-body-sm text-ink-secondary">Band {grade.band}</p> : null}
      {grade.feedback ? (
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-label text-ink">Feedback</h3>
          <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{grade.feedback}</p>
        </div>
      ) : null}
      <p className="m-0 text-caption text-ink-secondary tabular-nums">Released {formatDue(grade.released_at)} (Ghana time)</p>
    </Card>
  );
}
