import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { Fab } from '@/components/feedback/Fab.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { CONTENT_TYPE_LABEL, fetchCategories, fetchCourseAssignments, saveCategories } from '@/lib/assignments/assignments.js';
import { categoriesProblem, weightTotal } from '@/lib/assignments/categories.js';
import { formatDue } from '@/lib/assignments/due.js';

// The course's Assignments tab for its lecturers and administrators (prototype `lasg`; Phase 7):
// the assignments by due date with their instruction type and status, New assignment (a FAB on
// phones for the course's lecturers, UI_FEEDBACK), and the grade categories with their weights
// (D12: they must total 100 before grades are released). An archived course is read-only.

/** @typedef {Awaited<ReturnType<typeof fetchCourseAssignments>>[number]} Row */

/** @param {Row} a */
function statusOf(a) {
  if (a.archived_at) return /** @type {const} */ ({ label: 'Archived', tone: 'neutral' });
  return a.publication_status === 'PUBLISHED' ? /** @type {const} */ ({ label: 'Published', tone: 'success' }) : /** @type {const} */ ({ label: 'Draft', tone: 'neutral' });
}

/** @param {{ role: 'admin' | 'lecturer', courseId: string, archived: boolean, isLecturer: boolean }} props */
export function AssignmentsTab({ role, courseId, archived, isLecturer }) {
  const navigate = useNavigate();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const list = useLoad(() => fetchCourseAssignments(courseId), [courseId]);
  const base = `/${role}/courses/${courseId}/assignments`;
  // Desktop: a header button. Phones and tablets: the FAB for the course's lecturers (UI_FEEDBACK
  // FAB table); administrators keep the button.
  const showButton = !archived && (desktop || !isLecturer);

  const columns = [
    {
      key: 'title',
      header: 'Assignment',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {Row} */ a) => (
        <span className="flex min-w-0 flex-col">
          <Link to={`${base}/${a.id}`} className="truncate text-label text-link hover:underline focus-visible:focus-ring">
            {a.title}
          </Link>
          <span className="truncate text-caption text-ink-secondary">{a.lesson ? a.lesson.title : 'Course assignment'}</span>
        </span>
      ),
    },
    { key: 'type', header: 'Instructions', card: /** @type {const} */ ('secondary'), cell: (/** @type {Row} */ a) => CONTENT_TYPE_LABEL[a.content_type] },
    { key: 'due', header: 'Due (Ghana time)', card: /** @type {const} */ ('detail'), cell: (/** @type {Row} */ a) => <span className="tabular-nums">{formatDue(a.due_at)}</span> },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ a) => {
        const s = statusOf(a);
        return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-body-sm text-ink-secondary">
          {archived ? 'This course is archived; its assignments are read-only.' : 'Learners see published assignments. Every assignment accepts text and audio answers.'}
        </p>
        {showButton ? (
          <Button onClick={() => navigate(`${base}/new`)}>
            <Plus aria-hidden="true" />
            New assignment
          </Button>
        ) : null}
      </div>
      {list.state === 'error' ? (
        <ErrorState title="The assignments could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={4} />} onRetry={list.reload}>
          <ResponsiveTable
            caption="Assignments"
            columns={columns}
            rows={list.data ?? []}
            getRowKey={(a) => a.id}
            empty={<EmptyState icon={ClipboardList} title="No assignments yet" description={archived ? undefined : 'Create the first assignment. It stays a draft until you publish it.'} />}
          />
        </LoadingRegion>
      )}
      <CategoriesCard courseId={courseId} archived={archived} />
      <Fab label="New assignment" onClick={() => navigate(`${base}/new`)} allowed={isLecturer} archived={archived} />
    </div>
  );
}

/**
 * The course's grade categories and their weights (D12), with Edit.
 * @param {{ courseId: string, archived: boolean }} props
 */
function CategoriesCard({ courseId, archived }) {
  const toast = useToast();
  const categories = useLoad(() => fetchCategories(courseId), [courseId]);
  const [editing, setEditing] = useState(false);
  const rows = categories.data ?? [];
  const total = rows.reduce((sum, c) => sum + c.weight, 0);

  return (
    <Card className="flex flex-col gap-3" aria-labelledby="categories-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="categories-title">Grade categories</CardTitle>
        {categories.state === 'ready' ? <StatusChip tone={total === 100 ? 'success' : 'warning'}>Total {total}%</StatusChip> : null}
      </div>
      <LoadingRegion loading={categories.state === 'loading'} skeleton={<ListSkeleton rows={2} columns={2} />} onRetry={categories.reload}>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {rows.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center justify-between gap-3 py-1">
              <span className="truncate text-body text-ink">{c.name}</span>
              <span className="tabular-nums text-body text-ink-secondary">{c.weight}%</span>
            </li>
          ))}
        </ul>
      </LoadingRegion>
      <CardDescription>
        {total === 100 ? 'Each assignment counts within its category.' : 'The weights must total 100% before any grade can be released.'}
      </CardDescription>
      {archived ? null : (
        <Button variant="outline" className="self-start" onClick={() => setEditing(true)} disabled={categories.state !== 'ready'}>
          Edit categories
        </Button>
      )}
      {editing ? (
        <CategoriesDialog
          courseId={courseId}
          initial={rows}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.show('lecturer.categories-saved');
            categories.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * @param {{ courseId: string, initial: import('@/lib/assignments/assignments.js').Category[], onClose: () => void, onSaved: () => void }} props
 */
function CategoriesDialog({ courseId, initial, onClose, onSaved }) {
  const [rows, setRows] = useState(() => initial.map((c) => /** @type {{ id?: string, name: string, weight: string }} */ ({ id: c.id, name: c.name, weight: String(c.weight) })));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [saving, setSaving] = useState(false);
  const total = weightTotal(rows);

  /** @param {number} index @param {Partial<{ name: string, weight: string }>} change */
  const update = (index, change) => setRows((r) => r.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const save = async () => {
    const problem = categoriesProblem(rows);
    if (problem) return setMessage(problem);
    setSaving(true);
    setMessage(null);
    try {
      await saveCategories(courseId, rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim(), weight: Number(r.weight) })));
      onSaved();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grade categories</DialogTitle>
          <DialogDescription>Each assignment belongs to one category. The weights must total 100% before grades are released.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row, i) => (
            <li key={row.id ?? `new-${i}`} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor={`category-name-${i}`}>Category {i + 1}</Label>
                <Input id={`category-name-${i}`} value={row.name} onChange={(e) => update(i, { name: e.target.value })} autoComplete="off" maxLength={80} />
              </div>
              <div className="flex w-24 shrink-0 flex-col gap-1">
                <Label htmlFor={`category-weight-${i}`}>Weight %</Label>
                <Input id={`category-weight-${i}`} value={row.weight} onChange={(e) => update(i, { weight: e.target.value })} inputMode="numeric" autoComplete="off" maxLength={3} />
              </div>
              <Button variant="ghost" size="icon" className="text-error" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove ${row.name || `category ${i + 1}`}`}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={() => setRows((r) => [...r, { id: undefined, name: '', weight: '0' }])} disabled={rows.length >= 10}>
            <Plus aria-hidden="true" />
            Add category
          </Button>
          <span role="status" className={total === 100 ? 'text-label text-success' : 'text-label text-warning'}>
            Total {total}%
          </span>
        </div>
        <FormMessage>{message}</FormMessage>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} loadingLabel="Saving">
            Save categories
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
