import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Sheet, SheetContent } from '@/components/ui/sheet.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { downloadText, learnerRows, parseCsv, reportCsv, TEMPLATE } from '@/lib/admin/csv.js';
import { callFunction } from '@/lib/functions.js';

// Bulk learner import (D05, Phase 4): choose a CSV, see a preview with a result for every row
// (the server validates), then import. The error report downloads as CSV ("View report").

/** @typedef {{ row: number, email: string, status: 'ready' | 'created' | 'enrolled' | 'error', message?: string }} RowResult */

const TONE = /** @type {const} */ ({ ready: 'info', created: 'success', enrolled: 'success', error: 'error' });
const TEXT = { ready: 'Ready', created: 'Invited', enrolled: 'Enrolled', error: 'Error' };

/** @param {{ onClose: () => void, onDone: () => void }} props */
export function ImportSheet({ onClose, onDone }) {
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [rows, setRows] = useState(/** @type {Array<{ firstName: string, secondName: string, email: string, courseCode?: string }>} */ ([]));
  const [results, setResults] = useState(/** @type {RowResult[]} */ ([]));
  const [summary, setSummary] = useState(/** @type {null | { total: number, ready: number, created: number, enrolled?: number, errors: number }} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'preview' | 'import'} */ (null));
  const [committed, setCommitted] = useState(false);

  /** @param {File} file */
  const choose = async (file) => {
    setMessage(null);
    setResults([]);
    setSummary(null);
    setCommitted(false);
    const parsed = learnerRows(parseCsv(await file.text()));
    if (!parsed.ok) return setMessage(parsed.message);
    setRows(parsed.rows);
    setBusy('preview');
    try {
      const res = /** @type {{ summary: NonNullable<typeof summary>, results: RowResult[] }} */ (
        await callFunction('bulk-import-learners', { rows: parsed.rows, commit: false })
      );
      setResults(res.results);
      setSummary(res.summary);
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    setBusy('import');
    try {
      const res = /** @type {{ summary: NonNullable<typeof summary>, results: RowResult[] }} */ (
        await callFunction('bulk-import-learners', { rows, commit: true })
      );
      setResults(res.results);
      setSummary(res.summary);
      setCommitted(true);
      const report = () => downloadText('learner-import-report.csv', reportCsv(res.results));
      const params = { n: String(res.summary.created + (res.summary.enrolled ?? 0)), m: String(res.summary.errors) };
      toast.show(res.summary.errors ? 'admin.csv-imported-with-errors' : 'admin.csv-imported', { params, onAction: report });
      onDone();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Import learners" description="A CSV file with the headings first_name, second_name, email, and optionally course_code to enrol each learner in a course. Up to 500 learners.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) choose(file);
                e.target.value = '';
              }}
            />
            <Button onClick={() => input.current?.click()} loading={busy === 'preview'} loadingLabel="Checking the file">
              <FileUp aria-hidden="true" />
              Choose CSV file
            </Button>
            <Button variant="ghost" onClick={() => downloadText('learner-import-template.csv', TEMPLATE)}>
              <Download aria-hidden="true" />
              Template
            </Button>
          </div>
          <FormMessage>{message}</FormMessage>
          {summary ? (
            <p className="m-0 text-body-sm text-ink-secondary" role="status">
              {committed
                ? `${summary.created} invited${summary.enrolled ? `, ${summary.enrolled} existing learners enrolled` : ''}, ${summary.errors} with errors.`
                : `${summary.ready} ready to import, ${summary.errors} with errors. Rows with errors are skipped.`}
            </p>
          ) : null}
          {results.length ? (
            <ResponsiveTable
              caption="Import preview"
              getRowKey={(r) => String(r.row)}
              rows={results}
              columns={[
                { key: 'row', header: 'Row', card: 'secondary', cell: (r) => `Row ${r.row}` },
                { key: 'email', header: 'Email', card: 'title', cell: (r) => r.email || '(no email)' },
                { key: 'status', header: 'Result', card: 'status', cell: (r) => <StatusChip tone={TONE[r.status]}>{TEXT[r.status]}</StatusChip> },
                { key: 'message', header: 'Message', card: 'detail', cell: (r) => r.message ?? '' },
              ]}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {summary && !committed ? (
              <Button onClick={commit} disabled={!summary.ready} loading={busy === 'import'} loadingLabel="Importing">
                Import {summary.ready} learners
              </Button>
            ) : null}
            {results.length ? (
              <Button variant="outline" onClick={() => downloadText('learner-import-report.csv', reportCsv(results))}>
                Download report
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              {committed ? 'Done' : 'Cancel'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
