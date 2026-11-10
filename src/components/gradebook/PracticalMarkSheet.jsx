import { Save, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { BranchGroups, GroupByBranchSwitch } from '@/components/branches/BranchGroups.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { LearnerCell } from '@/components/grading/LearnerCell.jsx';
import { ReleaseAllDialog } from '@/components/grading/ReleaseAllDialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useGroupByBranch } from '@/lib/branch-groups.js';
import { gradeState, isSet, savePracticalMarks } from '@/lib/grading/grading.js';

// The practical mark sheet (Phase 10.1, ADR-016; owner request and answers of 2026-11-10): a Local
// Assembly practical is done in person, so learners send nothing; the course's lecturer types every
// learner's mark (0 to the maximum, up to two decimals) and an optional comment, grouped by branch
// unless switched off. Save marks keeps them as drafts (only changed rows are sent); Release marks
// releases every draft after a confirmation. A changed released mark needs a reason. The database
// checks the course, each learner and each mark again.

/** @typedef {import('@/lib/grading/grading.js').ResultRow} Row */
/** @typedef {{ score: string, feedback: string }} Entry */

/** "12", "12.5", "12.25"; anything else is not a mark. @param {string} s */
const parseMark = (s) => (/^\d{1,5}(\.\d{1,2})?$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * @param {{ assignmentId: string, maxMarks: number, rows: Row[], current: Array<{ learner_id: string, score: number | null, feedback: string | null }>,
 *   readOnly: boolean, onSaved: () => void }} props
 */
export function PracticalMarkSheet({ assignmentId, maxMarks, rows, current, readOnly, onSaved }) {
  const toast = useToast();
  const [grouped, setGrouped] = useGroupByBranch();
  const start = useMemo(() => {
    /** @type {Record<string, Entry>} */
    const m = {};
    for (const r of rows) {
      const c = current.find((x) => x.learner_id === r.learner_id);
      m[r.learner_id] = {
        score: isSet(c?.score) ? String(Number(c?.score)) : '',
        feedback: c?.feedback ?? '',
      };
    }
    return m;
  }, [rows, current]);
  const [entries, setEntries] = useState(start);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const counted = rows.filter((r) => r.counted);
  const changed = counted.filter(
    (r) =>
      entries[r.learner_id] && (entries[r.learner_id].score !== start[r.learner_id]?.score || entries[r.learner_id].feedback !== start[r.learner_id]?.feedback),
  );
  const changesReleased = changed.some((r) => r.released_at);
  const marked = counted.filter((r) => r.result === 'GRADED').length;
  const drafts = counted.filter((r) => r.result === 'GRADED' && r.grade_release_status === 'DRAFT').length;
  /** @param {string} id @param {Partial<Entry>} change */
  const update = (id, change) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...change } }));

  const save = async () => {
    setMessage(null);
    for (const r of changed) {
      const s = entries[r.learner_id].score;
      if (s.trim() === '') return setMessage(`Enter a mark for ${r.first_name} ${r.second_name}, or put back the one saved`);
      const n = parseMark(s);
      if (n === null || n > maxMarks)
        return setMessage(`${r.first_name} ${r.second_name}: the mark must be between 0 and ${maxMarks}, with up to two decimals`);
    }
    if (changesReleased && !reason.trim()) return setMessage('Give a reason for changing a released mark');
    setSaving(true);
    try {
      await savePracticalMarks({
        assignmentId,
        marks: changed.map((r) => ({
          learnerId: r.learner_id,
          score: parseMark(entries[r.learner_id].score),
          feedback: entries[r.learner_id].feedback.trim(),
        })),
        ...(changesReleased ? { reason: reason.trim() } : {}),
      });
      toast.show('lecturer.grade-draft-saved');
      setReason('');
      onSaved();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-slot="mark-sheet">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-body text-ink-secondary" data-testid="mark-sheet-summary">
          {marked} of {counted.length} marked
          {drafts ? ` · ${drafts} not released` : ''}
        </p>
        <GroupByBranchSwitch on={grouped} onChange={setGrouped} />
      </div>
      <BranchGroups rows={counted} on={grouped}>
        {(group) => (
          <ul className="m-0 flex list-none flex-col divide-y divide-hairline rounded-md border border-hairline bg-card p-0">
            {group.map((r) => {
              const e = entries[r.learner_id] ?? { score: '', feedback: '' };
              const state =
                r.result === 'GRADED'
                  ? gradeState(r)
                  : {
                      label: 'Not marked',
                      tone: /** @type {const} */ ('neutral'),
                    };
              return (
                <li key={r.learner_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:gap-4" data-slot="mark-row">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <LearnerCell row={r} />
                    <span>
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                    </span>
                  </div>
                  <div className="flex w-full flex-col gap-1 lg:w-32">
                    <Label htmlFor={`mark-${r.learner_id}`}>{`Mark out of ${maxMarks}`}</Label>
                    <Input
                      id={`mark-${r.learner_id}`}
                      value={e.score}
                      onChange={(ev) => update(r.learner_id, { score: ev.target.value })}
                      inputMode="decimal"
                      autoComplete="off"
                      maxLength={8}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="flex w-full flex-col gap-1 lg:flex-1">
                    <Label htmlFor={`comment-${r.learner_id}`}>Comment (optional)</Label>
                    <Textarea
                      id={`comment-${r.learner_id}`}
                      value={e.feedback}
                      onChange={(ev) => update(r.learner_id, { feedback: ev.target.value })}
                      rows={1}
                      maxLength={10000}
                      disabled={readOnly}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </BranchGroups>
      {changesReleased ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="marks-reason">Reason for changing a released mark</Label>
          <Textarea id="marks-reason" value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} maxLength={1000} />
        </div>
      ) : null}
      <FormMessage>{message}</FormMessage>
      {readOnly ? null : (
        <div className="sticky bottom-above-nav z-10 flex flex-wrap gap-2 rounded-md border border-hairline bg-card p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <Button onClick={() => void save()} loading={saving} loadingLabel="Saving" disabled={changed.length === 0}>
            <Save aria-hidden="true" />
            {changed.length ? `Save marks (${changed.length})` : 'Save marks'}
          </Button>
          <Button variant="outline" onClick={() => setReleasing(true)} disabled={drafts === 0 || changed.length > 0}>
            <Send aria-hidden="true" />
            {drafts ? `Release marks (${drafts})` : 'Release marks'}
          </Button>
        </div>
      )}
      {releasing ? <ReleaseAllDialog assignmentId={assignmentId} drafts={drafts} onClose={() => setReleasing(false)} onReleased={onSaved} /> : null}
    </div>
  );
}
