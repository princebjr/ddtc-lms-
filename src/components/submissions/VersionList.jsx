import { Download, FileText } from 'lucide-react';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { formatDue } from '@/lib/assignments/due.js';
import { fileSize } from '@/lib/audio/format.js';
import { downloadMedia, playbackUrl } from '@/lib/lessons/lessons.js';
import { versionSummary } from '@/lib/submissions/submissions.js';

// Every version of an answer, newest first (prototype `nhis`; D10: the latest is graded, older ones
// are kept): when it was sent (Ghana time), what it holds, late or on time; open one to read the
// text, play the recordings and open the documents. Playback and downloads use the viewer's own
// session (D19); learners see their own, the course's lecturers and administrators everyone's.

/** @typedef {import('@/lib/submissions/submissions.js').AnswerVersion} AnswerVersion */

/**
 * @param {{ versions: AnswerVersion[], title: string, heading?: string, latestLabel?: string }} props
 */
export function VersionList({ versions, title, heading = 'Your answers', latestLabel = 'Awaiting grade' }) {
  if (!versions.length) return null;
  return (
    <section aria-labelledby="versions-title" className="flex flex-col gap-3" data-slot="version-list">
      <h2 id="versions-title" className="m-0 text-title-3 text-ink">
        {heading}
      </h2>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {versions.map((v, i) => (
          <li key={v.id} className="rounded-md border border-hairline bg-card">
            <details open={i === 0} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 p-4 focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                <span className="text-headline text-ink">Version {v.version_number}</span>
                <span className="text-body-sm text-ink-secondary tabular-nums">{formatDue(v.submitted_at)}</span>
                <span className="text-body-sm text-ink-secondary">{versionSummary(v)}</span>
                <span className="flex flex-wrap gap-2">
                  <StatusChip tone={i === 0 ? 'info' : 'neutral'}>{i === 0 ? latestLabel : 'Replaced'}</StatusChip>
                  {v.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t border-hairline p-4">
                {v.text_answer.trim() ? <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{v.text_answer}</p> : null}
                {v.files
                  .filter((f) => f.file_role === 'AUDIO')
                  .map((f, n) => (
                    <AudioPlayer
                      key={f.id}
                      size="compact"
                      title={`${title}: recording ${n + 1}`}
                      getUrl={() => playbackUrl(/** @type {any} */ (f))}
                      durationSeconds={f.duration_seconds}
                      peaks={f.waveform_peaks}
                      fileSize={f.file_size}
                      onDownload={() => void downloadMedia(/** @type {any} */ (f)).catch(() => undefined)}
                    />
                  ))}
                {v.files
                  .filter((f) => f.file_role === 'PDF' || f.file_role === 'DOCX')
                  .map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-3">
                      <FileText className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-label text-ink">{f.original_filename}</span>
                      <span className="text-caption text-ink-secondary tabular-nums">{fileSize(f.file_size)}</span>
                      <Button type="button" variant="outline" onClick={() => void downloadMedia(/** @type {any} */ (f)).catch(() => undefined)}>
                        <Download aria-hidden="true" />
                        Download
                      </Button>
                    </div>
                  ))}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
