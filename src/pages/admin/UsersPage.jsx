import { FileUp, ShieldPlus, SlidersHorizontal, UserPlus, UserRoundPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { SpeedDial } from '@/components/feedback/Fab.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Sheet, SheetContent } from '@/components/ui/sheet.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useAvatarUrl } from '@/hooks/use-avatar-url.js';
import { DESKTOP_QUERY, TABLET_UP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { fetchUsers, ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/admin/users.js';
import { callFunction } from '@/lib/functions.js';
import { AddPersonDialog } from './AddPersonDialog.jsx';
import { ImportSheet } from './ImportSheet.jsx';
import { UserSheet } from './UserSheet.jsx';

// Administrator user management (Phase 4; prototype `users` and `lect`): search, filters (a bottom
// sheet on phones), ResponsiveTable (cards on phones), the user panel with every account action,
// and Add learner, Provision lecturer and Import CSV (speed dial below 1024 px, header buttons above).

/** @typedef {import('@/lib/admin/users.js').AdminUser} AdminUser */
/** @typedef {import('@/lib/admin/users.js').UsersView} UsersView */

const TITLES = {
  all: { title: 'Users', description: 'Every account: learners, lecturers and administrators' },
  lecturers: { title: 'Lecturers', description: 'Teaching staff and who can create courses' },
  learners: { title: 'Learners', description: 'Learner accounts' },
};

/** @param {{ view: UsersView }} props */
export default function UsersPage({ view }) {
  const auth = useAuth();
  const toast = useToast();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState(/** @type {'' | 'ADMIN' | 'LECTURER' | 'LEARNER'} */ (''));
  const [status, setStatus] = useState(/** @type {'' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'} */ (''));
  const [sort, setSort] = useState(/** @type {'name' | 'newest'} */ ('name'));
  const [rows, setRows] = useState(/** @type {AdminUser[]} */ ([]));
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(/** @type {AdminUser | null} */ (null));
  const [dialog, setDialog] = useState(/** @type {null | 'learner' | 'lecturer' | 'admin' | 'import'} */ (null));
  const [reloadKey, setReloadKey] = useState(0);

  // Debounced search; any filter change starts again from the first page.
  const [searchText, setSearchText] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchText(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Each answer is tagged with the query it belongs to; a newer query shows as loading.
  const queryKey = JSON.stringify([view, searchText, role, status, sort, reloadKey]);
  const [answered, setAnswered] = useState(/** @type {{ key: string, failed: boolean } | null} */ (null));
  const state = answered?.key !== queryKey ? 'loading' : answered.failed ? 'error' : 'ready';

  useEffect(() => {
    let cancelled = false;
    const key = JSON.stringify([view, searchText, role, status, sort, reloadKey]);
    fetchUsers({ view, search: searchText, role, status, sort, page: 0 })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setHasMore(r.hasMore);
        setPage(0);
        setAnswered({ key, failed: false });
      })
      .catch(() => !cancelled && setAnswered({ key, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [view, searchText, role, status, sort, reloadKey]);

  const loadMore = async () => {
    try {
      const r = await fetchUsers({ view, search: searchText, role, status, sort, page: page + 1 });
      setRows((prev) => [...prev, ...r.rows]);
      setHasMore(r.hasMore);
      setPage(page + 1);
    } catch {
      toast.show('request.failed', { onAction: loadMore });
    }
  };

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** @param {AdminUser} user @param {boolean} value */
  const setCourseCreation = async (user, value) => {
    try {
      await callFunction('set-user-role', { userId: user.id, canCreateCourses: value });
      setRows((prev) => prev.map((r) => (r.id === user.id ? { ...r, can_create_courses: value } : r)));
      toast.show('admin.permissions-updated');
    } catch {
      toast.show('request.failed', { onAction: () => setCourseCreation(user, value) });
    }
  };

  const columns = [
    {
      key: 'person',
      header: 'Name',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {AdminUser} */ u) => <Person user={u} />,
    },
    { key: 'role', header: 'Role', card: /** @type {const} */ ('secondary'), cell: (/** @type {AdminUser} */ u) => ROLE_LABEL[u.role] },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {AdminUser} */ u) => <StatusChip tone={STATUS_TONE[u.account_status]}>{STATUS_LABEL[u.account_status]}</StatusChip>,
    },
    ...(view === 'lecturers'
      ? [
          {
            key: 'create',
            header: 'Can create courses',
            card: /** @type {const} */ ('detail'),
            cell: (/** @type {AdminUser} */ u) => (
              <Switch
                checked={u.can_create_courses}
                onCheckedChange={(v) => setCourseCreation(u, v)}
                aria-label={`${u.first_name} ${u.second_name} can create courses`}
                disabled={u.account_status !== 'ACTIVE'}
              />
            ),
          },
        ]
      : []),
    {
      key: 'manage',
      header: 'Actions',
      align: /** @type {const} */ ('end'),
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {AdminUser} */ u) => (
        <Button variant="outline" onClick={() => setSelected(u)} aria-label={`Manage ${u.first_name} ${u.second_name}`}>
          Manage
        </Button>
      ),
    },
  ];

  const actions = [
    { label: 'Add learner', icon: UserPlus, onSelect: () => setDialog('learner') },
    { label: 'Provision lecturer', icon: UserRoundPlus, onSelect: () => setDialog('lecturer') },
    { label: 'Invite administrator', icon: ShieldPlus, onSelect: () => setDialog('admin') },
    { label: 'Import CSV', icon: FileUp, onSelect: () => setDialog('import') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLES[view].title}
        description={TITLES[view].description}
        actions={
          desktop ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a.label} variant={a.label === 'Add learner' ? 'primary' : 'outline'} onClick={a.onSelect}>
                  <a.icon aria-hidden="true" />
                  {a.label}
                </Button>
              ))}
            </div>
          ) : null
        }
      />
      <Filters view={view} search={search} onSearch={setSearch} role={role} onRole={setRole} status={status} onStatus={setStatus} sort={sort} onSort={setSort} />
      {state === 'error' ? (
        <ErrorState title="The list could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<ListSkeleton rows={8} columns={4} />} onRetry={reload}>
          <ResponsiveTable
            caption={TITLES[view].title}
            columns={columns}
            rows={rows}
            getRowKey={(u) => u.id}
            empty={<EmptyState title={searchText || role || status ? 'No one matches these filters' : 'No accounts yet'} />}
          />
          {hasMore ? (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={loadMore}>
                Show more
              </Button>
            </div>
          ) : null}
        </LoadingRegion>
      )}

      <SpeedDial label="Add people" actions={actions} allowed />

      {selected ? (
        <UserSheet
          user={selected}
          isSelf={selected.id === auth.profile?.id}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
            setSelected((s) => (s ? { ...s, ...updated } : s));
          }}
        />
      ) : null}
      {dialog === 'learner' || dialog === 'lecturer' || dialog === 'admin' ? <AddPersonDialog kind={dialog} onClose={() => setDialog(null)} onDone={reload} /> : null}
      {dialog === 'import' ? <ImportSheet onClose={() => setDialog(null)} onDone={reload} /> : null}
    </div>
  );
}

/** @param {{ user: AdminUser }} props */
function Person({ user }) {
  const imageUrl = useAvatarUrl(user.profile_image_file_id);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar firstName={user.first_name} secondName={user.second_name} imageUrl={imageUrl} size={40} decorative />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-label text-ink">
          {user.first_name} {user.second_name}
        </span>
        <span className="truncate text-body-sm text-ink-secondary">{user.email}</span>
      </span>
    </span>
  );
}

/**
 * Search inline; filters inline from 640 px, in a bottom sheet on phones (Phase 4 build list).
 * @param {{ view: UsersView, search: string, onSearch: (v: string) => void, role: string, onRole: (v: any) => void,
 *   status: string, onStatus: (v: any) => void, sort: string, onSort: (v: any) => void }} props
 */
function Filters({ view, search, onSearch, role, onRole, status, onStatus, sort, onSort }) {
  const wide = useMediaQuery(TABLET_UP_QUERY);
  const [open, setOpen] = useState(false);
  const active = Number(Boolean(role)) + Number(Boolean(status)) + Number(sort !== 'name');

  const fields = (
    <>
      {view === 'all' ? (
        <FilterSelect label="Role" value={role} onChange={onRole} options={[['', 'All roles'], ['LEARNER', 'Learners'], ['LECTURER', 'Lecturers'], ['ADMIN', 'Administrators']]} />
      ) : null}
      <FilterSelect label="Status" value={status} onChange={onStatus} options={[['', 'Any status'], ['ACTIVE', 'Active'], ['SUSPENDED', 'Suspended'], ['DEACTIVATED', 'Deactivated']]} />
      <FilterSelect label="Sort" value={sort} onChange={onSort} options={[['name', 'Name'], ['newest', 'Newest first']]} />
    </>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-64">
        <Label htmlFor="user-search">Search</Label>
        <Input id="user-search" type="search" inputMode="search" placeholder="Name or email" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      {wide ? (
        fields
      ) : (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <SlidersHorizontal aria-hidden="true" />
            Filters{active ? ` (${active})` : ''}
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent title="Filters">
              <div className="flex flex-col gap-4">
                {fields}
                <Button onClick={() => setOpen(false)}>Show results</Button>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

/**
 * @param {{ label: string, value: string, onChange: (v: string) => void, options: Array<[string, string]> }} props
 * Radix Select cannot hold an empty value, so "" is stored as "any".
 */
function FilterSelect({ label, value, onChange, options }) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2 sm:w-44">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || 'any'} onValueChange={(v) => onChange(v === 'any' ? '' : v)}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, text]) => (
            <SelectItem key={v || 'any'} value={v || 'any'}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
