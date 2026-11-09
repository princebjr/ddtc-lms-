import { FileText, Mic, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { clock, fileSize } from '@/lib/audio/format.js';

// Upload row (DESIGN.md 13): icon, file name, size, a progress bar in `link`, a status chip
// (Uploading, Checking, Ready, Rejected with the reason, Stopped) and Cancel, Retry or Remove.

/**
 * @typedef {object} AnswerPart
 * @property {string} key
 * @property {string | null} fileId
 * @property {string} name
 * @property {number} size
 * @property {'AUDIO' | 'PDF' | 'DOCX'} role
 * @property {'uploading' | 'checking' | 'ready' | 'rejected' | 'failed'} status
 * @property {number} progress  0 to 1 while uploading
 * @property {string | null} error
 * @property {number | null} durationSeconds
 */

/**
 * @param {{ part: AnswerPart, onCancel?: () => void, onRetry?: () => void, onRemove?: () => void, disabled?: boolean }} props
 */
export function UploadRow({ part, onCancel, onRetry, onRemove, disabled = false }) {
  const Icon = part.role === 'AUDIO' ? Mic : FileText;
  const facts = [part.durationSeconds ? clock(part.durationSeconds) : null, fileSize(part.size) || null].filter(Boolean).join(' · ');
  return (
    <li data-slot="upload-row" data-status={part.status} className="flex flex-col gap-2 rounded-md border border-hairline bg-card p-3">
      <div className="flex items-center gap-3">
        <Icon className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label text-ink">{part.name}</span>
          {facts ? <span className="text-caption text-ink-secondary tabular-nums">{facts}</span> : null}
        </div>
        <StatusChip tone={TONE[part.status]}>{label(part)}</StatusChip>
        {part.status === 'uploading' && onCancel ? (
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label={`Cancel upload of ${part.name}`} disabled={disabled}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
        {part.status === 'failed' && onRetry ? (
          <Button type="button" variant="ghost" size="icon" onClick={onRetry} aria-label={`Try ${part.name} again`} disabled={disabled}>
            <RotateCcw aria-hidden="true" />
          </Button>
        ) : null}
        {(part.status === 'ready' || part.status === 'rejected' || part.status === 'failed') && onRemove ? (
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${part.name}`} disabled={disabled}>
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {part.status === 'uploading' ? (
        <div
          role="progressbar"
          aria-label={`Uploading ${part.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(part.progress * 100)}
          className="h-1 overflow-hidden rounded-full bg-fill"
        >
          <div className="h-full bg-link transition-[width] duration-fast" style={{ width: `${Math.round(part.progress * 100)}%` }} />
        </div>
      ) : null}
      {part.error && (part.status === 'rejected' || part.status === 'failed') ? <p className="m-0 text-body-sm text-error">{part.error}</p> : null}
    </li>
  );
}

const TONE = /** @type {const} */ ({
  uploading: 'info',
  checking: 'info',
  ready: 'success',
  rejected: 'error',
  failed: 'warning',
});

/** @param {AnswerPart} part */
function label(part) {
  switch (part.status) {
    case 'uploading':
      return `Uploading ${Math.round(part.progress * 100)}%`;
    case 'checking':
      return 'Checking';
    case 'ready':
      return 'Ready';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Stopped';
  }
}
