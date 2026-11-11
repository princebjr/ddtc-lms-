import { Download, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { documentUrl } from '@/lib/exams/exams.js';

/** Whether the browser can show this document itself (PDF); Word files are downloaded. @param {import('@/lib/exams/exams.js').ExamAnswerFile} file */
const isPdf = (file) => file.mime_type === 'application/pdf' || /\.pdf$/i.test(file.original_filename);

/**
 * An examination answer document (Step 10.3; owner request of 2026-11-11, ADR-020 item 10): its name,
 * Open for a PDF (shown by the browser in a new tab) and Download for any document. Links are signed for
 * five minutes and served only for a VALIDATED file to the learner or the course's managers.
 *
 * The new tab is opened at once, inside the click, and sent to the signed link when it arrives: a tab
 * opened after waiting for the link is blocked as a pop-up by phones and Safari, which is why Open did
 * nothing before. If the browser still refuses a new tab, the document is downloaded instead.
 * @param {{ file: import('@/lib/exams/exams.js').ExamAnswerFile }} props
 */
export function ExamDocumentLink({ file }) {
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'open' | 'download'} */ (null));

  const download = async () => {
    setMessage(null);
    setBusy('download');
    try {
      const a = document.createElement('a');
      a.href = await documentUrl(file, { download: true });
      a.download = file.safe_download_filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setMessage('The document could not be downloaded. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    setMessage(null);
    const tab = window.open('about:blank', '_blank');
    if (!tab) return download();
    tab.opener = null;
    setBusy('open');
    try {
      tab.location.replace(await documentUrl(file, { download: false }));
    } catch {
      tab.close();
      setMessage('The document could not be opened. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-testid="exam-document">
      <FileText className="size-4 shrink-0 text-ink-secondary" aria-hidden="true" />
      <span className="min-w-0 break-all text-body-sm text-ink">{file.original_filename}</span>
      {isPdf(file) ? (
        <Button variant="link" onClick={() => void open()} disabled={busy !== null} aria-label={`Open ${file.original_filename}`}>
          <ExternalLink aria-hidden="true" />
          Open
        </Button>
      ) : null}
      <Button variant="link" onClick={() => void download()} disabled={busy !== null} aria-label={`Download ${file.original_filename}`}>
        <Download aria-hidden="true" />
        Download
      </Button>
      {message ? (
        <span role="alert" className="text-body-sm text-error">
          {message}
        </span>
      ) : null}
    </span>
  );
}
