import { CircleX } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { TABLET_UP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { branchChoices, branchLabel, fetchBranches } from '@/lib/branches.js';

// The Branch drop-down (D42): a learner's single, optional branch, chosen from the branches in the
// database (never a list in the code). Label above, 16 px text; the phone's own picker below 640 px
// and the shadcn Select from tablet width up. While the list loads it shows a field-shaped skeleton;
// if the list cannot be loaded it says so with Retry.

export const BRANCH_PLACEHOLDER = 'Select your branch';

/**
 * @param {{ value: string, onChange: (branchId: string) => void, currentId?: string | null, label?: string,
 *   hint?: string, placeholder?: string, error?: string, disabled?: boolean }} props
 *   `value` is the chosen branch id ('' for none); `currentId` is the saved one, kept as a choice even
 *   if that branch has closed since.
 */
export function BranchField({ value, onChange, currentId, label = 'Branch', hint, placeholder = BRANCH_PLACEHOLDER, error, disabled }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const tabletUp = useMediaQuery(TABLET_UP_QUERY);
  const { state, data, reload } = useLoad(fetchBranches, []);
  const choices = data ? branchChoices(data, currentId) : [];
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;
  const fieldProps = { id, disabled, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-slot="branch-field">
      <Label htmlFor={state === 'ready' ? id : undefined}>{label}</Label>
      {state === 'loading' ? <Skeleton shape="field" data-testid="branch-skeleton" /> : null}
      {state === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-hairline bg-card px-4 py-2">
          <span className="flex min-w-0 items-center gap-2 text-body-sm text-ink-secondary">
            <CircleX className="size-5 shrink-0 text-error" aria-hidden="true" />
            The branches could not be loaded.
          </span>
          <Button variant="outline" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}
      {state === 'ready' && tabletUp ? (
        <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger {...fieldProps}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {branchLabel(b)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {state === 'ready' && !tabletUp ? (
        <NativeSelect {...fieldProps} value={value} onChange={(e) => onChange(e.target.value)} data-placeholder={value ? undefined : ''}>
          <option value="" disabled>
            {placeholder}
          </option>
          {choices.map((b) => (
            <option key={b.id} value={b.id} className="text-ink">
              {branchLabel(b)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {hint && !error ? (
        <p id={hintId} className="m-0 text-body-sm text-ink-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="m-0 text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
