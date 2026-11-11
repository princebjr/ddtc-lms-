import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { documentUrl } from '@/lib/exams/exams.js';

/**
 * An examination answer document (Step 10.3): its name and an Open link (a signed link of five minutes,
 * served only for a VALIDATED file to the learner or the course's managers).
 * @param {{ file: import('@/lib/exams/exams.js').ExamAnswerFile }} props
 */
export function ExamDocumentLink({ file }) {
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const open = async () => {
    setMessage(null);
    try {
      window.open(await documentUrl(file), '_blank', 'noopener');
    } catch {
      setMessage('The document could not be opened. Try again.');
    }
  };
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2" data-testid="exam-document">
      <FileText className="size-4 shrink-0 text-ink-secondary" aria-hidden="true" />
      <span className="min-w-0 break-all text-body-sm text-ink">{file.original_filename}</span>
      <Button variant="link" onClick={() => void open()} aria-label={`Open ${file.original_filename}`}>
        Open
      </Button>
      {message ? <span className="text-body-sm text-error">{message}</span> : null}
    </span>
  );
}
