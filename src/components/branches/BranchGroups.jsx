import { Fragment, useId } from 'react';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { groupByBranch } from '@/lib/branch-groups.js';

// Learner lists grouped by branch (Phase 10.1, ADR-016; D42): the "Group by branch" switch and the
// branch headings with their counts. Used by the practical mark sheet, the gradebook, assignment and
// examination results, the course's Learners tab and To grade.

/** @param {{ on: boolean, onChange: (on: boolean) => void }} props */
export function GroupByBranchSwitch({ on, onChange }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Switch id={id} checked={on} onCheckedChange={onChange} />
      <Label htmlFor={id}>Group by branch</Label>
    </div>
  );
}

/**
 * Renders the rows grouped under branch headings when `on`, otherwise as one run. Each group is passed
 * to `children` with its heading already shown.
 * @template {{ branch_name: string | null }} Row
 * @param {{ rows: Row[], on: boolean, children: (rows: Row[], branch: string | null) => import('react').ReactNode }} props
 */
export function BranchGroups({ rows, on, children }) {
  if (!on) return <>{children(rows, null)}</>;
  return (
    <div className="flex flex-col gap-6" data-slot="branch-groups">
      {groupByBranch(rows).map((g) => (
        <Fragment key={g.branch}>
          <section
            aria-label={`${g.branch}, ${g.rows.length} ${g.rows.length === 1 ? 'learner' : 'learners'}`}
            className="flex flex-col gap-3"
            data-branch={g.branch}
          >
            <h3 className="m-0 flex items-baseline gap-2 text-headline text-ink">
              {g.branch}
              <span className="text-body-sm text-ink-secondary tabular-nums">
                {g.rows.length} {g.rows.length === 1 ? 'learner' : 'learners'}
              </span>
            </h3>
            {children(g.rows, g.branch)}
          </section>
        </Fragment>
      ))}
    </div>
  );
}
