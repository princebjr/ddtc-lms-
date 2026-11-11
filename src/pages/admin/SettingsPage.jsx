import { Save } from 'lucide-react';
import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchSettings, saveSetting } from '@/lib/admin/insight.js';
import { formatDue } from '@/lib/assignments/due.js';
import { loadClientSettings } from '@/lib/settings/client-settings.js';

// Settings (Phase 11, ADR-019; BUILD_PLAN: every system setting with validation and audit). Each value is
// saved on its own ("Setting saved"); the database checks it again and records every change in the audit
// log. Only an administrator with two-step verification reaches this page or changes a value. Audio
// retention (Phase 12), the email retry schedule (D31) and the session lifetimes (D32) are shown, not changed.

/** @typedef {import('@/lib/admin/insight.js').Setting} Setting */

const MB = 1024 * 1024;
const FILE_KINDS = /** @type {const} */ ([
  ['lesson_audio', 'Lesson audio'],
  ['instruction_audio', 'Assignment instruction audio'],
  ['submission_audio', 'Learners’ audio answers'],
  ['submission_document', 'Learners’ documents (PDF, Word)'],
  ['lesson_attachment', 'Lesson attachments'],
  ['profile_image', 'Profile photos'],
  ['course_cover', 'Course covers'],
]);

/** A refusal from the database, in plain words. @param {unknown} e */
const reason = (e) => {
  const err = /** @type {{ code?: string, message?: string }} */ (e);
  if (err?.code === '23514') return 'That value is outside what this setting allows.';
  if (err?.code === '22023') return 'That value is not the right kind for this setting.';
  return err?.message ?? 'Could not save. Try again.';
};

export default function SettingsPage() {
  const page = useLoad(fetchSettings, []);
  const settings = page.data ?? [];
  const get = (/** @type {string} */ key) => settings.find((s) => s.key === key);
  const replace = (/** @type {string} */ key, /** @type {any} */ value) =>
    page.setData((list) => list.map((s) => (s.key === key ? { ...s, value, updated_at: new Date().toISOString() } : s)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Institution settings. Each change is saved on its own and recorded in the audit log." />
      <LoadingRegion loading={page.state === 'loading'} skeleton={<FormSkeleton fields={6} />} label="Loading settings">
        {page.state === 'error' ? (
          <ErrorState onRetry={page.reload} />
        ) : (
          <>
            <Group title="Grades" description="How course grades and charts are worked out.">
              <NumberSetting
                setting={get('pass_mark')}
                label="Pass mark"
                unit="%"
                min={0}
                max={100}
                help="The percentage at or above which a grade counts as a pass. New examinations start with this pass mark; each examination keeps its own."
                onSaved={replace}
              />
              <SwitchSetting
                setting={get('missing_as_zero')}
                label="Count missing work as 0"
                help="Off: overdue work with nothing sent shows as Missing and is not counted in the course grade. On: it counts as 0 until a late answer is sent and graded."
                onSaved={replace}
              />
              <GradeScaleSetting setting={get('grade_scale')} onSaved={replace} />
              <BandsSetting setting={get('distribution_bands')} onSaved={replace} />
              <NumberSetting
                setting={get('min_class_size')}
                label="Minimum class size for charts"
                unit="learners"
                min={1}
                max={500}
                help="Learners see the class chart only when at least this many results are graded, so nobody can be identified."
                onSaved={replace}
              />
            </Group>
            <Group title="Sign-in" description="Inactivity sign-out for every role (D43).">
              <NumberSetting
                setting={get('idle_timeout_minutes')}
                label="Sign out after inactivity"
                unit="minutes"
                min={5}
                max={60}
                help="Whole minutes, 5 to 60. People already signed in follow within a few minutes."
                onSaved={replace}
              />
              <NumberSetting
                setting={get('idle_warning_seconds')}
                label="Warn before signing out"
                unit="seconds"
                min={30}
                max={180}
                help="Whole seconds, 30 to 180."
                onSaved={replace}
              />
            </Group>
            <Group title="Courses and answers" description="Publishing and submissions.">
              <SwitchSetting
                setting={get('require_course_approval')}
                label="Courses need approval before publishing"
                help="On: lecturers send courses to an administrator, who approves or returns them."
                onSaved={replace}
              />
              <NumberSetting
                setting={get('max_files_per_submission_version')}
                label="Files per answer"
                unit="files"
                min={1}
                max={20}
                help="The most files a learner can attach to one answer."
                onSaved={replace}
              />
            </Group>
            <Group title="Upload limits" description="The largest file, and the longest recording, for each kind of upload.">
              <FileLimitsSetting setting={get('file_limits')} onSaved={replace} />
            </Group>
            <Group title="Fixed here" description="Shown for reference. These change in a later phase or with the owner's decision.">
              <ReadOnly label="Email retries (minutes after each failure)" value={(get('notification_retry_minutes')?.value ?? []).join(', ')} />
              <ReadOnly
                label="Learner audio retention"
                value={get('retention_enabled')?.value ? `On, ${get('retention_days')?.value} days after release` : 'Off (Phase 12)'}
              />
              <ReadOnly label="Display time zone" value="Ghana time (Africa/Accra)" />
            </Group>
          </>
        )}
      </LoadingRegion>
    </div>
  );
}

/** @param {{ title: string, description: string, children: import('react').ReactNode }} props */
function Group({ title, description, children }) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      <div className="flex flex-col divide-y divide-hairline">{children}</div>
    </Card>
  );
}

/** Saves one setting with the toast; returns an error message or null. @param {string} key @param {any} value @param {(k: string, v: any) => void} onSaved @param {ReturnType<typeof useToast>} toast */
async function persist(key, value, onSaved, toast) {
  try {
    await saveSetting(key, value);
    void loadClientSettings({ force: true }); // this administrator's own screens follow at once
    onSaved(key, value);
    toast.show('admin.setting-saved');
    return null;
  } catch (e) {
    return reason(e);
  }
}

/** @param {{ id: string, label: string, help: string, updatedAt?: string, children: import('react').ReactNode, message?: string | null }} props */
function Row({ id, label, help, updatedAt, children, message }) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0" data-setting={id}>
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-help`} className="m-0 text-body-sm text-ink-secondary">
          {help}
          {updatedAt ? ` Last changed ${formatDue(updatedAt)} (Ghana time).` : ''}
        </p>
      </div>
      {children}
      <FormMessage>{message ?? null}</FormMessage>
    </div>
  );
}

/** @param {{ setting?: Setting, label: string, unit: string, min: number, max: number, help: string, onSaved: (k: string, v: any) => void }} props */
function NumberSetting({ setting, label, unit, min, max, help, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  if (!setting) return null;
  const value = draft ?? String(setting.value);
  const save = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      setMessage(`Enter a whole number from ${min} to ${max}.`);
      return;
    }
    setBusy(true);
    setMessage(await persist(setting.key, n, onSaved, toast));
    setDraft(null);
    setBusy(false);
  };
  return (
    <Row id={`s-${setting.key}`} label={label} help={help} updatedAt={setting.updated_at} message={message}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`s-${setting.key}`}
          aria-describedby={`s-${setting.key}-help`}
          inputMode="numeric"
          className="w-28"
          value={value}
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
        />
        <span className="text-body-sm text-ink-secondary">{unit}</span>
        <Button variant="outline" onClick={() => void save()} loading={busy} loadingLabel="Saving" disabled={draft === null || draft === String(setting.value)}>
          <Save aria-hidden="true" />
          Save
        </Button>
      </div>
    </Row>
  );
}

/** @param {{ setting?: Setting, label: string, help: string, onSaved: (k: string, v: any) => void }} props */
function SwitchSetting({ setting, label, help, onSaved }) {
  const toast = useToast();
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  if (!setting) return null;
  return (
    <Row id={`s-${setting.key}`} label={label} help={help} updatedAt={setting.updated_at} message={message}>
      <Switch
        id={`s-${setting.key}`}
        aria-describedby={`s-${setting.key}-help`}
        checked={Boolean(setting.value)}
        disabled={busy}
        onCheckedChange={async (on) => {
          setBusy(true);
          setMessage(await persist(setting.key, on, onSaved, toast));
          setBusy(false);
        }}
      />
    </Row>
  );
}

/** @param {{ setting?: Setting, onSaved: (k: string, v: any) => void }} props */
function GradeScaleSetting({ setting, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(/** @type {Array<{ grade: string, min: string, max: string }> | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  if (!setting) return null;
  const rows =
    draft ??
    /** @type {Array<{ grade: string, min: number, max: number }>} */ (setting.value).map((r) => ({ grade: r.grade, min: String(r.min), max: String(r.max) }));
  const edit = (/** @type {number} */ i, /** @type {'grade' | 'min' | 'max'} */ field, /** @type {string} */ v) => {
    setDraft(rows.map((r, j) => (j === i ? { ...r, [field]: v } : r)));
    setMessage(null);
  };
  const save = async () => {
    const value = rows.map((r) => ({ grade: r.grade.trim(), min: Number(r.min), max: Number(r.max) }));
    setBusy(true);
    const err = await persist(setting.key, value, onSaved, toast);
    setMessage(err ? 'Each letter needs whole-number limits that cover 0 to 100 without gaps or overlaps.' : null);
    if (!err) setDraft(null);
    setBusy(false);
  };
  return (
    <Row
      id="s-grade_scale"
      label="Letter grades"
      help="Applied to course grades only. The ranges must cover 0 to 100 with no gaps."
      updatedAt={setting.updated_at}
      message={message}
    >
      <table className="w-full max-w-md border-collapse text-body-sm">
        <thead>
          <tr className="text-left text-ink-secondary">
            <th scope="col" className="pb-1 font-medium">
              Letter
            </th>
            <th scope="col" className="pb-1 font-medium">
              From %
            </th>
            <th scope="col" className="pb-1 font-medium">
              To %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                <Input aria-label={`Letter ${i + 1}`} value={r.grade} maxLength={3} className="w-20" onChange={(e) => edit(i, 'grade', e.target.value)} />
              </td>
              <td className="py-1 pr-2">
                <Input
                  aria-label={`${r.grade || 'Letter'} from`}
                  inputMode="numeric"
                  value={r.min}
                  className="w-20"
                  onChange={(e) => edit(i, 'min', e.target.value)}
                />
              </td>
              <td className="py-1">
                <Input
                  aria-label={`${r.grade || 'Letter'} to`}
                  inputMode="numeric"
                  value={r.max}
                  className="w-20"
                  onChange={(e) => edit(i, 'max', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button variant="outline" className="self-start" onClick={() => void save()} loading={busy} loadingLabel="Saving" disabled={draft === null}>
        <Save aria-hidden="true" />
        Save letter grades
      </Button>
    </Row>
  );
}

/** Chart bands as their boundaries: "0, 50, 60, 70, 80, 90, 100". @param {{ setting?: Setting, onSaved: (k: string, v: any) => void }} props */
function BandsSetting({ setting, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  if (!setting) return null;
  const bands = /** @type {Array<[number, number]>} */ (setting.value);
  const current = [bands[0]?.[0], ...bands.map((b) => b[1])].join(', ');
  const value = draft ?? current;
  const save = async () => {
    const edges = value.split(',').map((x) => Number(x.trim()));
    if (edges.some((n) => !Number.isInteger(n)) || edges[0] !== 0 || edges[edges.length - 1] !== 100 || edges.some((n, i) => i && n <= edges[i - 1])) {
      setMessage('Enter whole numbers from 0 to 100, each larger than the one before, separated by commas.');
      return;
    }
    setBusy(true);
    setMessage(
      await persist(
        setting.key,
        edges.slice(1).map((n, i) => [edges[i], n]),
        onSaved,
        toast,
      ),
    );
    setDraft(null);
    setBusy(false);
  };
  return (
    <Row
      id="s-distribution_bands"
      label="Chart bands"
      help="Where the bars of the grade charts start and end, as percentages, for example 0, 50, 60, 70, 80, 90, 100."
      updatedAt={setting.updated_at}
      message={message}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="s-distribution_bands"
          aria-describedby="s-distribution_bands-help"
          className="w-full max-w-sm"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button variant="outline" onClick={() => void save()} loading={busy} loadingLabel="Saving" disabled={draft === null || draft === current}>
          <Save aria-hidden="true" />
          Save
        </Button>
      </div>
    </Row>
  );
}

/** @param {{ setting?: Setting, onSaved: (k: string, v: any) => void }} props */
function FileLimitsSetting({ setting, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(/** @type {Record<string, { mb: string, minutes?: string }> | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  if (!setting) return null;
  const limits = /** @type {Record<string, any>} */ (setting.value);
  const view =
    draft ??
    Object.fromEntries(
      FILE_KINDS.filter(([k]) => limits[k]).map(([k]) => [
        k,
        {
          mb: String(Math.round((limits[k].max_bytes / MB) * 10) / 10),
          ...(limits[k].max_seconds ? { minutes: String(Math.round(limits[k].max_seconds / 60)) } : {}),
        },
      ]),
    );
  const edit = (/** @type {string} */ k, /** @type {'mb' | 'minutes'} */ f, /** @type {string} */ v) => {
    setDraft({ ...view, [k]: { ...view[k], [f]: v } });
    setMessage(null);
  };
  const save = async () => {
    const next = { ...limits };
    for (const [k, v] of Object.entries(view)) {
      const mb = Number(v.mb);
      const minutes = v.minutes === undefined ? null : Number(v.minutes);
      if (!(mb > 0) || (minutes !== null && !(Number.isInteger(minutes) && minutes > 0))) {
        setMessage('Enter a size in MB above 0 and whole minutes above 0.');
        return;
      }
      next[k] = { ...limits[k], max_bytes: Math.round(mb * MB), ...(minutes !== null ? { max_seconds: minutes * 60 } : {}) };
    }
    setBusy(true);
    setMessage(await persist(setting.key, next, onSaved, toast));
    setDraft(null);
    setBusy(false);
  };
  return (
    <Row
      id="s-file_limits"
      label="Largest file and longest recording"
      help="Sizes in MB; recordings in minutes. The file store takes the new sizes at once. Recording in the app stops at 30 minutes for lesson audio."
      updatedAt={setting.updated_at}
      message={message}
    >
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {FILE_KINDS.filter(([k]) => view[k]).map(([k, label]) => (
          <li key={k} className="flex flex-wrap items-center gap-2">
            <span className="w-full text-body-sm text-ink sm:w-64">{label}</span>
            <Input
              aria-label={`${label}: largest file in MB`}
              inputMode="decimal"
              className="w-24"
              value={view[k].mb}
              onChange={(e) => edit(k, 'mb', e.target.value)}
            />
            <span className="text-body-sm text-ink-secondary">MB</span>
            {view[k].minutes !== undefined ? (
              <>
                <Input
                  aria-label={`${label}: longest recording in minutes`}
                  inputMode="numeric"
                  className="w-20"
                  value={view[k].minutes}
                  onChange={(e) => edit(k, 'minutes', e.target.value)}
                />
                <span className="text-body-sm text-ink-secondary">minutes</span>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <Button variant="outline" className="self-start" onClick={() => void save()} loading={busy} loadingLabel="Saving" disabled={draft === null}>
        <Save aria-hidden="true" />
        Save upload limits
      </Button>
    </Row>
  );
}

/** @param {{ label: string, value: string }} props */
function ReadOnly({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
      <span className="text-body-sm text-ink-secondary">{label}</span>
      <span className="text-body-sm text-ink">{value}</span>
    </div>
  );
}
