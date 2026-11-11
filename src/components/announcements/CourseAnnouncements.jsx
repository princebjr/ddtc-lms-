import { Megaphone } from 'lucide-react';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { fetchAnnouncements } from '@/lib/announcements.js';

// A course's announcements for its learners (Phase 11, ADR-019): newest first, the three latest. Shows
// nothing while there are none, or if they cannot be loaded (they are also in the notification centre).

/** @param {{ courseId: string }} props */
export function CourseAnnouncements({ courseId }) {
  const list = useLoad(() => fetchAnnouncements({ courseId }), [courseId]);
  const rows = (list.data ?? []).slice(0, 3);
  if (list.state !== 'ready' || rows.length === 0) return null;
  return (
    <section aria-labelledby="announcements-heading" className="flex flex-col gap-3" data-slot="course-announcements">
      <h2 id="announcements-heading" className="m-0 flex items-center gap-2 text-title-3 text-ink">
        <Megaphone className="size-5 text-link" aria-hidden="true" />
        Announcements
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((a) => (
          <li key={a.id} className="rounded-md border border-hairline bg-card p-4">
            <p className="m-0 text-label text-ink">{a.title}</p>
            <p className="m-0 mt-1 whitespace-pre-line break-words text-body text-ink">{a.body}</p>
            <p className="m-0 mt-2 text-caption text-ink-secondary">{`${formatDue(a.created_at)} (Ghana time)`}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
