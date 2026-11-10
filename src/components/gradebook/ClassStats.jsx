import { formatPercentage } from '@/lib/grading/grading.js';

// An assignment's class figures (Phase 10; D15): class average, highest and lowest from released
// results only (ungraded work is never counted), and the graded, ungraded and missing counts, all from
// assignment_statistics(). Two per row on phones, three from tablet width, six on wide screens.

/** @param {{ stats: import('@/lib/gradebook/gradebook.js').AssignmentStats }} props */
export function ClassStats({ stats }) {
  const items = [
    { label: 'Class average', value: formatPercentage(stats.average) || '—' },
    { label: 'Highest', value: formatPercentage(stats.highest) || '—' },
    { label: 'Lowest', value: formatPercentage(stats.lowest) || '—' },
    { label: 'Graded', value: String(stats.released) },
    { label: 'Ungraded', value: String(stats.ungraded) },
    { label: 'Missing', value: String(stats.missing) },
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6" data-slot="class-stats">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col rounded-md bg-fill px-3 py-2">
          <dt className="text-caption text-ink-secondary">{i.label}</dt>
          <dd className="m-0 text-headline tabular-nums text-ink" data-testid={`stat-${i.label.toLowerCase().replaceAll(' ', '-')}`}>
            {i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
