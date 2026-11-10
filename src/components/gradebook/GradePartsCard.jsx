import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchCategories, saveCategories } from '@/lib/assignments/assignments.js';
import { applyStandardParts, fetchUsesStandardParts, fetchWeightsLocked, previewStandardParts, previewWeightsImpact } from '@/lib/gradebook/gradebook.js';
import { formatPercentage } from '@/lib/grading/grading.js';

// The course grade's parts (D12, D13; Phase 10.1, ADR-016; owner decisions of 2026-11-10): Weekly
// assignments 40, Local Assembly practicals 30 and Final examinations 30. Lecturers see them read-only.
// An administrator changes a course's weights only with a reason, after previewing the effect on each
// learner's overall grade, and switches a course that still has its own categories to the three parts
// (same reason and preview). The database checks every rule again.

/** @typedef {Awaited<ReturnType<typeof previewWeightsImpact>>} Impact */

/** @param {{ courseId: string, archived: boolean, admin: boolean }} props */
export function GradePartsCard({ courseId, archived, admin }) {
  const toast = useToast();
  const load = useLoad(async () => {
    const [categories, standard, locked] = await Promise.all([fetchCategories(courseId), fetchUsesStandardParts(courseId), fetchWeightsLocked(courseId)]);
    return { categories, standard, locked };
  }, [courseId]);
  const [dialog, setDialog] = useState(/** @type {'weights' | 'switch' | null} */ (null));
  const rows = load.data?.categories ?? [];
  const standard = load.data?.standard ?? true;
  const total = rows.reduce((sum, c) => sum + c.weight, 0);
  const done = () => {
    setDialog(null);
    toast.show('lecturer.categories-saved');
    load.reload();
  };

  return (
    <Card className="flex flex-col gap-3" aria-labelledby="categories-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="categories-title">Parts of the course grade</CardTitle>
        {load.state === 'ready' ? (
          <span className="flex flex-wrap gap-2">
            {load.data?.locked ? <StatusChip tone="info">Locked</StatusChip> : null}
            <StatusChip tone={total === 100 ? 'success' : 'warning'}>Total {total}%</StatusChip>
          </span>
        ) : null}
      </div>
      <LoadingRegion loading={load.state === 'loading'} skeleton={<ListSkeleton rows={3} columns={2} />} onRetry={load.reload}>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {rows.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center justify-between gap-3 py-1">
              <span className="min-w-0 break-words text-body text-ink">
                {c.name}
                {c.part === 'PRACTICALS' ? <span className="text-ink-secondary"> · marked in person</span> : null}
              </span>
              <span className="tabular-nums text-body text-ink-secondary">{c.weight}%</span>
            </li>
          ))}
        </ul>
      </LoadingRegion>
      <CardDescription>
        {!standard
          ? `This course still uses its own categories. ${admin ? 'Switch it to the three parts of the DDTC course grade.' : 'An administrator will switch it to the three parts of the DDTC course grade.'}`
          : admin
            ? 'Changing the weights needs a reason and is recorded.'
            : 'Only an administrator can change the weights.'}
      </CardDescription>
      {archived || !admin || load.state !== 'ready' ? null : standard ? (
        <Button variant="outline" className="self-start" onClick={() => setDialog('weights')}>
          Change weights
        </Button>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setDialog('switch')}>
          Switch to the three parts
        </Button>
      )}
      {dialog === 'weights' ? <WeightsDialog courseId={courseId} initial={rows} onClose={() => setDialog(null)} onSaved={done} /> : null}
      {dialog === 'switch' ? <SwitchDialog courseId={courseId} onClose={() => setDialog(null)} onSaved={done} /> : null}
    </Card>
  );
}

/** Overall grades that would change, "current → new". @param {{ impact: Impact | null }} props */
function ImpactList({ impact }) {
  if (!impact) return null;
  const changes = impact.filter((l) => l.current_overall !== l.new_overall);
  return changes.length ? (
    <ul
      className="m-0 flex max-h-48 list-none flex-col divide-y divide-hairline overflow-y-auto p-0 focus-visible:focus-ring"
      aria-label="Overall grades that would change"
      tabIndex={0}
    >
      {changes.map((l) => (
        <li key={l.learner_id} className="flex min-h-11 items-center justify-between gap-3 py-1 text-body-sm">
          <span className="min-w-0 truncate text-ink">
            {l.first_name} {l.second_name}
          </span>
          <span className="whitespace-nowrap tabular-nums text-ink">
            {formatPercentage(l.current_overall) || '—'} → {formatPercentage(l.new_overall) || '—'}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p role="status" className="m-0 text-body-sm text-ink-secondary">
      No learner&apos;s overall grade would change.
    </p>
  );
}

/** @param {{ reason: string, setReason: (s: string) => void, onPreview: () => void, previewing: boolean, impact: Impact | null }} props */
function ReasonAndPreview({ reason, setReason, onPreview, previewing, impact }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-fill p-3" data-slot="weights-locked">
      <div className="flex flex-col gap-1">
        <Label htmlFor="weights-reason">Reason</Label>
        <Textarea id="weights-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} />
      </div>
      <Button variant="outline" className="self-start" onClick={onPreview} loading={previewing} loadingLabel="Working it out">
        Preview the effect
      </Button>
      <ImpactList impact={impact} />
    </div>
  );
}

/** @param {{ courseId: string, initial: import('@/lib/assignments/assignments.js').Category[], onClose: () => void, onSaved: () => void }} props */
function WeightsDialog({ courseId, initial, onClose, onSaved }) {
  const [weights, setWeights] = useState(() => initial.map((c) => String(c.weight)));
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState(/** @type {Impact | null} */ (null));
  const [busy, setBusy] = useState(/** @type {'preview' | 'save' | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const numbers = weights.map((w) => Number(w));
  const total = numbers.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const problem = numbers.some((n) => !Number.isInteger(n) || n < 0 || n > 100)
    ? 'Each weight is a whole number from 0 to 100'
    : total !== 100
      ? 'The weights must total 100'
      : null;
  const payload = initial.map((c, i) => ({ id: c.id, weight: numbers[i] }));

  const preview = async () => {
    if (problem) return setMessage(problem);
    setBusy('preview');
    setMessage(null);
    try {
      setImpact(await previewWeightsImpact(courseId, payload));
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (problem) return setMessage(problem);
    if (!reason.trim()) return setMessage('Give a reason for changing the grade weights');
    if (!impact) return setMessage('Preview the effect on overall grades first');
    setBusy('save');
    setMessage(null);
    try {
      await saveCategories(courseId, payload, reason.trim());
      onSaved();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change weights</DialogTitle>
          <DialogDescription>The three parts stay; their weights must total 100%. The change is recorded with your reason.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {initial.map((c, i) => (
            <li key={c.id} className="flex items-end justify-between gap-3">
              <Label htmlFor={`weight-${c.id}`} className="min-w-0 flex-1 pb-3">
                {c.name}
              </Label>
              <div className="flex w-24 shrink-0 flex-col gap-1">
                <Input
                  id={`weight-${c.id}`}
                  value={weights[i]}
                  onChange={(e) => {
                    setImpact(null);
                    setWeights((w) => w.map((x, j) => (j === i ? e.target.value : x)));
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={3}
                  aria-describedby="weights-total"
                />
              </div>
            </li>
          ))}
        </ul>
        <span id="weights-total" role="status" className={total === 100 ? 'text-label text-success' : 'text-label text-warning'}>
          Total {total}%
        </span>
        <ReasonAndPreview reason={reason} setReason={setReason} onPreview={() => void preview()} previewing={busy === 'preview'} impact={impact} />
        <FormMessage>{message}</FormMessage>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy === 'save'} loadingLabel="Saving">
            Save weights
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** @param {{ courseId: string, onClose: () => void, onSaved: () => void }} props */
function SwitchDialog({ courseId, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState(/** @type {Impact | null} */ (null));
  const [busy, setBusy] = useState(/** @type {'preview' | 'save' | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const preview = async () => {
    setBusy('preview');
    setMessage(null);
    try {
      setImpact(await previewStandardParts(courseId));
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };
  const apply = async () => {
    if (!reason.trim()) return setMessage('Give a reason for changing the grade weights');
    if (!impact) return setMessage('Preview the effect on overall grades first');
    setBusy('save');
    setMessage(null);
    try {
      await applyStandardParts(courseId, reason.trim());
      onSaved();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to the three parts</DialogTitle>
          <DialogDescription>
            Weekly assignments 40%, Local Assembly practicals 30% and Final examinations 30%. Work in a category named for practicals moves to practicals;
            everything else moves to weekly assignments. The old categories are kept in the record.
          </DialogDescription>
        </DialogHeader>
        <ReasonAndPreview reason={reason} setReason={setReason} onPreview={() => void preview()} previewing={busy === 'preview'} impact={impact} />
        <FormMessage>{message}</FormMessage>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} loading={busy === 'save'} loadingLabel="Switching">
            Switch the course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
