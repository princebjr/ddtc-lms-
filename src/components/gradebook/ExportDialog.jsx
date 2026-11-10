import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { downloadFile, exportGrades } from '@/lib/gradebook/gradebook.js';
import { getSupabase } from '@/lib/supabase.js';

// Export (Phase 10; owner request 2026-11-06 and decisions 2 and 3 of 2026-11-10): the course gradebook,
// or one assignment's performance report, as CSV or Excel. Pickers for the course (when opened from
// the Gradebooks page), what to export, the assignment and the format. export-gradebook builds the file
// from the database (and audits it); the browser saves it, then "Export ready" offers it again.

/**
 * @param {{ role: 'admin' | 'lecturer', courseId?: string, courses?: Array<{ id: string, title: string, course_code: string }>,
 *   initialAssignmentId?: string, onClose: () => void }} props
 */
export function ExportDialog({ role, courseId: fixedCourse, courses = [], initialAssignmentId, onClose }) {
  const toast = useToast();
  const [courseId, setCourseId] = useState(fixedCourse ?? courses[0]?.id ?? '');
  const [kind, setKind] = useState(/** @type {'gradebook' | 'assignment'} */ (initialAssignmentId ? 'assignment' : 'gradebook'));
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId ?? '');
  const [format, setFormat] = useState(/** @type {'csv' | 'xlsx'} */ ('xlsx'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const assignments = useLoad(async () => {
    if (!courseId) return [];
    const { data, error } = await getSupabase().rpc('gradebook_assignments', { p_course: courseId });
    if (error) throw error;
    return /** @type {Array<{ assignment_id: string, title: string }>} */ (data ?? []);
  }, [courseId]);
  const list = assignments.data ?? [];
  const chosenAssignment = list.some((a) => a.assignment_id === assignmentId) ? assignmentId : (list[0]?.assignment_id ?? '');

  const run = async () => {
    if (!courseId) return setMessage('Choose a course');
    if (kind === 'assignment' && !chosenAssignment) return setMessage('This course has no assignments to report on');
    setBusy(true);
    setMessage(null);
    try {
      const file = await exportGrades(kind === 'gradebook' ? { kind, courseId, format } : { kind, assignmentId: chosenAssignment, format });
      downloadFile(file);
      toast.show(role === 'admin' ? 'admin.export-ready' : 'lecturer.gradebook-export-ready', { onAction: () => downloadFile(file) });
      onClose();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export grades</DialogTitle>
          <DialogDescription>Excel files carry DDTC&apos;s name, the course and the export date at the top. CSV files have plain headings.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {fixedCourse ? null : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="export-course">Course</Label>
              <NativeSelect id="export-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.course_code})
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-label text-ink">What to export</legend>
            <RadioGroup value={kind} onValueChange={(v) => setKind(/** @type {'gradebook' | 'assignment'} */ (v))}>
              <div className="flex min-h-11 items-center gap-2">
                <RadioGroupItem id="export-kind-gradebook" value="gradebook" />
                <Label htmlFor="export-kind-gradebook">The course gradebook</Label>
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <RadioGroupItem id="export-kind-assignment" value="assignment" />
                <Label htmlFor="export-kind-assignment">One assignment&apos;s performance report</Label>
              </div>
            </RadioGroup>
          </fieldset>
          {kind === 'assignment' ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="export-assignment">Assignment</Label>
              <NativeSelect
                id="export-assignment"
                value={chosenAssignment}
                onChange={(e) => setAssignmentId(e.target.value)}
                disabled={assignments.state !== 'ready' || list.length === 0}
              >
                {list.map((a) => (
                  <option key={a.assignment_id} value={a.assignment_id}>
                    {a.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-label text-ink">Format</legend>
            <RadioGroup value={format} onValueChange={(v) => setFormat(/** @type {'csv' | 'xlsx'} */ (v))}>
              <div className="flex min-h-11 items-center gap-2">
                <RadioGroupItem id="export-format-xlsx" value="xlsx" />
                <Label htmlFor="export-format-xlsx">Excel (.xlsx)</Label>
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <RadioGroupItem id="export-format-csv" value="csv" />
                <Label htmlFor="export-format-csv">CSV (.csv)</Label>
              </div>
            </RadioGroup>
          </fieldset>
        </div>
        <FormMessage>{message}</FormMessage>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy} loadingLabel="Exporting">
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
