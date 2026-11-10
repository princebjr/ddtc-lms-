import { CircleCheck, CircleDashed, Clock, FileText, UserRoundX, Users } from 'lucide-react';
import { Card } from '@/components/ui/card.jsx';

// The assignment's counts (Phase 9; owner decisions 4 and 5): Enrolled, Submitted, Graded (with how
// many are released), Ungraded, Missing and Not yet due, from assignment_result_counts() so they
// always agree with the list and add up (enrolled = submitted + not yet due + missing; submitted =
// graded + ungraded). Two tiles per row on phones, three from tablet width, six on very wide screens.

/** @param {{ counts: import('@/lib/grading/grading.js').ResultCounts }} props */
export function ResultCounts({ counts }) {
  const tiles = [
    { label: 'Enrolled', value: counts.enrolled, detail: 'learners', icon: Users },
    { label: 'Submitted', value: counts.submitted, detail: `of ${counts.enrolled}`, icon: FileText },
    { label: 'Graded', value: counts.graded, detail: `${counts.released} released`, icon: CircleCheck },
    { label: 'Ungraded', value: counts.ungraded, detail: 'to review', icon: CircleDashed },
    { label: 'Missing', value: counts.missing, detail: 'past due, nothing sent', icon: UserRoundX },
    { label: 'Not yet due', value: counts.not_yet_due, detail: 'nothing sent yet', icon: Clock },
  ];
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 2xl:grid-cols-6" aria-label="Counts" data-slot="result-counts">
      {tiles.map((t) => (
        <li key={t.label}>
          <Card className="flex h-full items-start gap-3 p-4">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-fill text-link">
              <t.icon className="size-5" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm text-ink-secondary">{t.label}</span>
              <span className="text-title-2 tabular-nums text-ink" data-testid={`count-${t.label.toLowerCase().replaceAll(' ', '-')}`}>
                {t.value}
              </span>
              <span className="text-caption text-ink-secondary">{t.detail}</span>
            </span>
          </Card>
        </li>
      ))}
    </ul>
  );
}
