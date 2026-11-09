import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';

/**
 * A labelled filter or sort list for list pages (Phase 4 Users, Phase 9 results). Radix Select cannot
 * hold an empty value, so "" is stored as "any".
 * @param {{ label: string, value: string, onChange: (v: string) => void, options: Array<[string, string]>, id?: string }} props
 */
export function FilterSelect({ label, value, onChange, options, id = `filter-${label.toLowerCase()}` }) {
  return (
    <div className="flex flex-col gap-2 sm:w-44">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || 'any'} onValueChange={(v) => onChange(v === 'any' ? '' : v)}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, text]) => (
            <SelectItem key={v || 'any'} value={v || 'any'}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
