import { ChevronRight, ClipboardCheck, Inbox, Send, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { Card } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchDashboard } from '@/lib/admin/insight.js';
import { formatDueShort } from '@/lib/assignments/due.js';
import { formatPercentage } from '@/lib/grading/grading.js';

// Dashboard panels (Phase 11, BUILD_PLAN Phase 11; ADR-019), one database call each (migration 40):
// - administrators: answers sent and grade releases in the last 7 days, the grading backlog, the latest
//   releases and the latest administrative and security events;
// - lecturers: deadlines in the next 14 days (with how many have sent their work) and course performance;
// - learners: answers sent, missing work, what is due next, recently released grades and lesson progress.

/** @param {{ title: string, id: string, children: import('react').ReactNode, action?: import('react').ReactNode }} props */
function Section({ title, id, children, action }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-slot={id}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="m-0 text-title-3 text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** @typedef {{ label: string, value: number | string, icon: import('lucide-react').LucideIcon, to?: string }} Tile */
/** @param {{ tiles: Tile[], wide?: boolean }} props */
function Tiles({ tiles, wide = false }) {
  return (
    <ul className={`m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 ${wide ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {tiles.map((t) => {
        const body = (
          <Card className="flex items-center gap-4 hover:bg-fill">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-fill text-link">
              <t.icon className="size-6" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-title-2 text-ink">{t.value}</span>
              <span className="text-body-sm text-ink-secondary">{t.label}</span>
            </span>
          </Card>
        );
        return (
          <li key={t.label}>
            {t.to ? (
              <Link to={t.to} className="block rounded-lg focus-visible:focus-ring">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** @param {{ rows: Array<{ key: string, title: string, secondary: string, trailing?: import('react').ReactNode, to?: string }>, empty: string, label: string }} props */
function Rows({ rows, empty, label }) {
  if (!rows.length) return <p className="m-0 text-body-sm text-ink-secondary">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-card p-0" aria-label={label}>
      {rows.map((r) => {
        const inner = (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body text-ink">{r.title}</span>
              <span className="truncate text-body-sm text-ink-secondary">{r.secondary}</span>
            </span>
            {r.trailing ? <span className="shrink-0 text-body-sm text-ink-secondary">{r.trailing}</span> : null}
            {r.to ? <ChevronRight className="size-5 shrink-0 text-ink-tertiary" aria-hidden="true" /> : null}
          </>
        );
        return (
          <li key={r.key}>
            {r.to ? (
              <Link to={r.to} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-fill focus-visible:focus-ring">
                {inner}
              </Link>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-4 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Pretty names for audit actions on the dashboard. @param {string} action */
const ACTION_LABEL = (action) =>
  ({
    'grade.released': 'Grades released',
    'grades.released_course': 'Course grades released',
    'exam.released': 'Examination results released',
    'setting.updated': 'Setting changed',
    'profile.role_changed': 'Role changed',
    'profile.status_changed': 'Account status changed',
    'admin.mfa_reset': 'Two-step verification reset',
    'admin.sessions_revoked': 'Sessions signed out',
    'audit_log.exported': 'Audit log downloaded',
    'course.returned': 'Course returned',
    'course.archived': 'Course archived',
  })[action] ?? action;

export function AdminActivity() {
  const page = useLoad(() => fetchDashboard('admin_dashboard'), []);
  const d = page.data ?? {};
  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<ListSkeleton rows={3} columns={3} />} label="Loading activity">
      {page.state === 'error' ? (
        <ErrorState title="Activity could not be loaded" onRetry={page.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Activity" id="admin-activity">
            <Tiles
              tiles={[
                { label: 'Answers sent in the last 7 days', value: d.answers_sent_7d ?? 0, icon: Send },
                { label: 'Waiting for marks', value: d.grading_backlog ?? 0, icon: Inbox, to: '/admin/gradebooks' },
                { label: 'Grade releases in the last 7 days', value: d.releases_7d ?? 0, icon: ClipboardCheck },
              ]}
            />
          </Section>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="Recent grade releases" id="admin-releases">
              <Rows
                label="Recent grade releases"
                empty="No grades released yet."
                rows={(d.recent_releases ?? []).map((/** @type {any} */ r, /** @type {number} */ i) => ({
                  key: `${r.at}-${i}`,
                  title: r.course_title ?? ACTION_LABEL(r.action),
                  secondary: `${ACTION_LABEL(r.action)} by ${r.actor_name ?? 'System'}`,
                  trailing: formatDueShort(r.at),
                }))}
              />
            </Section>
            <Section
              title="Recent administrative events"
              id="admin-events"
              action={
                <Link to="/admin/audit-logs" className="inline-flex min-h-11 items-center text-label text-link hover:underline focus-visible:focus-ring">
                  Audit logs
                </Link>
              }
            >
              <Rows
                label="Recent administrative events"
                empty="Nothing recorded yet."
                rows={(d.recent_events ?? []).map((/** @type {any} */ r, /** @type {number} */ i) => ({
                  key: `${r.at}-${i}`,
                  title: ACTION_LABEL(r.action),
                  secondary: r.actor_name,
                  trailing: formatDueShort(r.at),
                }))}
              />
            </Section>
          </div>
        </div>
      )}
    </LoadingRegion>
  );
}

export function LecturerOverview() {
  const page = useLoad(() => fetchDashboard('lecturer_dashboard'), []);
  const d = page.data ?? {};
  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<ListSkeleton rows={3} columns={3} />} label="Loading deadlines and performance">
      {page.state === 'error' ? (
        <ErrorState title="Deadlines could not be loaded" onRetry={page.reload} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Upcoming deadlines" id="lecturer-deadlines">
            <Rows
              label="Upcoming deadlines"
              empty="Nothing due in the next 14 days."
              rows={(d.upcoming ?? []).map((/** @type {any} */ u) => ({
                key: u.id,
                title: u.title,
                secondary: `${u.course_title} · ${u.kind === 'EXAMINATION' ? 'closes' : 'due'} ${formatDueShort(u.due)}`,
                trailing: `${u.sent} of ${u.learners} sent`,
                to:
                  u.kind === 'EXAMINATION'
                    ? `/lecturer/courses/${u.course_id}/exams/${u.id}/results`
                    : `/lecturer/courses/${u.course_id}/assignments/${u.id}/submissions`,
              }))}
            />
          </Section>
          <Section title="Course performance" id="lecturer-performance">
            <Rows
              label="Course performance"
              empty="No published courses yet."
              rows={(d.performance ?? []).map((/** @type {any} */ p) => ({
                key: p.course_id,
                title: p.course_title,
                secondary: `${p.graded} of ${p.learners} learners with a released course grade`,
                trailing: p.average === null ? 'No grades yet' : `Average ${formatPercentage(Number(p.average))}`,
                to: `/lecturer/courses/${p.course_id}/gradebook`,
              }))}
            />
          </Section>
        </div>
      )}
    </LoadingRegion>
  );
}

/**
 * The learner's work. `leadTiles` (the dashboard's course counts) join the same row of statistic cards,
 * and `after` (the welcome, owner request 2026-11-11) comes directly below that row.
 * @param {{ leadTiles?: Tile[], after?: import('react').ReactNode }} props
 */
export function LearnerOverview({ leadTiles = [], after = null }) {
  const page = useLoad(() => fetchDashboard('learner_dashboard'), []);
  const d = page.data ?? {};
  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<ListSkeleton rows={3} columns={3} />} label="Loading your work">
      {page.state === 'error' ? (
        <ErrorState title="Your work could not be loaded" onRetry={page.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <Tiles
            wide={leadTiles.length + 2 === 4}
            tiles={[
              ...leadTiles,
              { label: 'Answers sent', value: d.sent ?? 0, icon: Send, to: '/learner/assignments' },
              { label: 'Missing work', value: d.missing ?? 0, icon: TriangleAlert, to: '/learner/assignments' },
            ]}
          />
          {after ? <div className="-mt-6">{after}</div> : null}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="Due next" id="learner-due">
              <Rows
                label="Due next"
                empty="Nothing waiting for you. Well done."
                rows={(d.due_next ?? []).map((/** @type {any} */ w) => ({
                  key: w.id,
                  title: w.title,
                  secondary: w.course_title,
                  trailing: `Due ${formatDueShort(w.due)}`,
                  to: `/learner/courses/${w.course_id}/assignments/${w.id}`,
                }))}
              />
            </Section>
            <Section title="Recent grades" id="learner-grades">
              <Rows
                label="Recent grades"
                empty="No grades released yet."
                rows={(d.recent_grades ?? []).map((/** @type {any} */ g) => ({
                  key: g.id,
                  title: g.title,
                  secondary: g.course_title,
                  trailing: `${Number(g.score)} / ${Number(g.max_marks)} · ${formatPercentage(Number(g.percentage))}`,
                  to: `/learner/courses/${g.course_id}/assignments/${g.id}`,
                }))}
              />
            </Section>
          </div>
          {(d.progress ?? []).length ? (
            <Section title="Lesson progress" id="learner-progress">
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {(d.progress ?? []).map((/** @type {any} */ p) => {
                  const pct = p.lessons ? Math.round((p.completed * 100) / p.lessons) : 0;
                  return (
                    <li key={p.course_id} className="rounded-md border border-hairline bg-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Link to={`/learner/courses/${p.course_id}`} className="min-w-0 truncate text-body text-link hover:underline focus-visible:focus-ring">
                          {p.course_title}
                        </Link>
                        <StatusChip tone={pct === 100 ? 'success' : 'neutral'}>{`${p.completed} of ${p.lessons} lessons`}</StatusChip>
                      </div>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-fill"
                        role="progressbar"
                        aria-label={`${p.course_title}: lesson progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </LoadingRegion>
  );
}
