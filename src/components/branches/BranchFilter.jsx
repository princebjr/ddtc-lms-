import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { NO_BRANCH } from '@/lib/admin/users.js';
import { branchLabel, fetchBranches } from '@/lib/branches.js';
import { cn } from '@/lib/utils.js';
import { BranchesUnavailable } from './BranchField.jsx';

// The Branch filter on administrator lists (D42): any branch, one branch (closed ones too, as
// learners may still belong to them), or learners without a branch. It sits with the list's other
// filters (inline, or in the Filters sheet on phones) and looks like them.

/**
 * @param {{ id: string, value: string, onChange: (value: string) => void, className?: string }} props
 *   `value` is '' for any branch, NO_BRANCH, or a branch id.
 */
export function BranchFilter({ id, value, onChange, className }) {
  const { state, data, reload } = useLoad(fetchBranches, []);
  return (
    <div className={cn('flex flex-col gap-2 sm:w-52', className)} data-slot="branch-filter">
      <Label htmlFor={state === 'ready' ? id : undefined}>Branch</Label>
      {state === 'loading' ? <Skeleton shape="field" /> : null}
      {state === 'error' ? <BranchesUnavailable onRetry={reload} /> : null}
      {state === 'ready' ? (
        <Select value={value || 'any'} onValueChange={(v) => onChange(v === 'any' ? '' : v)}>
          <SelectTrigger id={id} aria-label="Branch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any branch</SelectItem>
            {(data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {branchLabel(b)}
              </SelectItem>
            ))}
            <SelectItem value={NO_BRANCH}>No branch</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
