import { FileUp, GraduationCap, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { BrandBlock } from '@/components/brand/BrandBlock.jsx';
import { GoogleButton } from '@/components/brand/GoogleButton.jsx';
import { LogoMark } from '@/components/brand/LogoMark.jsx';
import { ResponsiveChart } from '@/components/data/ResponsiveChart.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { Fab, SpeedDial } from '@/components/feedback/Fab.jsx';
import { InAppBrowserNotice } from '@/components/feedback/InAppBrowserNotice.jsx';
import { ChartSkeleton, DashboardSkeleton, FormSkeleton, ListSkeleton } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState, OfflineState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { InsetList, InsetListRow } from '@/components/ui/inset-list.jsx';
import { Label } from '@/components/ui/label.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';

// /dev/design (DESIGN.md 17): every shared component in the current theme, for review at phone,
// tablet and desktop widths. Development, CI and Vercel preview builds only.
// The FAB and speed dial appear here only as a component demo; in the product they exist only on
// the screens in the Section 16 FAB table.

const SWATCHES = [
  ['page', 'bg-page'],
  ['sidebar', 'bg-sidebar'],
  ['card', 'bg-card'],
  ['fill', 'bg-fill'],
  ['hairline', 'bg-hairline'],
  ['control-border', 'bg-control'],
  ['primary', 'bg-primary'],
  ['link and focus', 'bg-link'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['error', 'bg-error'],
  ['chart-bar', 'bg-chart-bar'],
];

const TYPE = [
  ['Large title', 'text-large-title'],
  ['Title 1', 'text-title-1'],
  ['Title 2', 'text-title-2'],
  ['Title 3', 'text-title-3'],
  ['Headline', 'text-headline'],
  ['Body', 'text-body'],
  ['Body small', 'text-body-sm'],
  ['Label', 'text-label'],
  ['Caption', 'text-caption'],
];

/** @typedef {{ id: string, first: string, second: string, email: string, status: 'Active' | 'Suspended', course: string }} DemoRow */
/** @type {DemoRow[]} */
const ROWS = [
  { id: '1', first: 'Kwame', second: 'Mensah', email: 'kwame@example.org', status: 'Active', course: 'Biblical Studies' },
  { id: '2', first: 'Abena', second: 'Frimpong', email: 'abena@example.org', status: 'Active', course: 'Discipleship' },
  { id: '3', first: 'John', second: 'Osei', email: 'john@example.org', status: 'Suspended', course: 'Prayer and Growth' },
];

const BANDS = [
  ['0-49', 3],
  ['50-59', 8],
  ['60-69', 14],
  ['70-79', 31],
  ['80-89', 22],
  ['90-100', 13],
];

/** @param {{ title: string, children: import('react').ReactNode }} props */
function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 text-title-2 text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const toast = useToast();
  const [switchOn, setSwitchOn] = useState(true);
  const max = Math.max(...BANDS.map(([, n]) => Number(n)));

  return (
    <div className="min-h-dvh-screen bg-page">
      <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-10 px-4 pt-8 pb-nav-safe sm:px-6 lg:px-8">
        <PageHeader title="Design system" description="DDTC tokens and shared components. Switch the theme to review light and dark." actions={<ThemeSwitch />} />
        <div className="lg:hidden">
          <ThemeSwitch />
        </div>

        <Section title="Colour tokens">
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {SWATCHES.map(([name, cls]) => (
              <li key={name} className="flex items-center gap-3 rounded-md border border-hairline bg-card p-3">
                <span className={`size-10 shrink-0 rounded-sm border border-hairline ${cls}`} aria-hidden="true" />
                <span className="min-w-0 text-body-sm break-words text-ink">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Typography">
          <Card className="flex flex-col gap-2">
            {TYPE.map(([name, cls]) => (
              <p key={name} className={`m-0 break-words text-ink ${cls}`}>
                {name}: Lessons, Courses and Assignments
              </p>
            ))}
            <p className="m-0 text-body-sm text-ink-secondary">Secondary text on card.</p>
            <p className="m-0 text-body-sm text-ink-tertiary">Tertiary text for hints and metadata.</p>
          </Card>
        </Section>

        <Section title="Logos and brand block">
          <Card className="flex flex-wrap items-center gap-8">
            <LogoMark logo="ddtc" size="hero" />
            <LogoMark logo="ddtc" size="hero-phone" />
            <LogoMark logo="ddtc" size="nav" />
            <LogoMark logo="golarae" size="brand" />
          </Card>
          <Card className="mx-auto flex w-full max-w-sm flex-col gap-4">
            <Button size="auth">Sign in</Button>
            <div className="flex items-center gap-3 text-caption text-ink-secondary" aria-hidden="true">
              <span className="h-px flex-1 bg-hairline" />
              or
              <span className="h-px flex-1 bg-hairline" />
            </div>
            <GoogleButton />
            <BrandBlock />
          </Card>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 aria-hidden="true" />
                  Destructive
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Archive this course?</DialogTitle>
                  <DialogDescription>Learners keep their lessons and released grades. Nothing is deleted.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="destructive">Archive</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Form controls">
          <Card className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="demo-email">Email</Label>
              <Input id="demo-email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.org" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="demo-invalid">Course code</Label>
              <Input id="demo-invalid" aria-invalid="true" aria-describedby="demo-invalid-error" defaultValue="BIB" />
              <p id="demo-invalid-error" className="m-0 text-body-sm text-error">
                Enter at least 4 characters.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="demo-select">Course</Label>
              <Select>
                <SelectTrigger id="demo-select" aria-label="Course">
                  <SelectValue placeholder="Choose a course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bib">Biblical Studies</SelectItem>
                  <SelectItem value="dis">Discipleship</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="demo-text">Feedback</Label>
              <Textarea id="demo-text" placeholder="Write clear, kind feedback." />
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Checkbox id="demo-check" defaultChecked />
                <Label htmlFor="demo-check">Allow late work</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="demo-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
                <Label htmlFor="demo-switch">Email notifications</Label>
              </div>
            </div>
            <RadioGroup defaultValue="text" aria-label="Response type">
              {['text', 'audio'].map((v) => (
                <div key={v} className="flex items-center gap-3">
                  <RadioGroupItem value={v} id={`demo-radio-${v}`} />
                  <Label htmlFor={`demo-radio-${v}`}>{v === 'text' ? 'Text' : 'Audio'}</Label>
                </div>
              ))}
            </RadioGroup>
          </Card>
        </Section>

        <Section title="Tabs, chips and avatars">
          <Tabs defaultValue="overview">
            <TabsList aria-label="Course workspace">
              {['Overview', 'Lessons', 'Assignments', 'Learners', 'Gradebook', 'Analytics', 'Settings'].map((t) => (
                <TabsTrigger key={t} value={t.toLowerCase()}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <p className="m-0 text-body text-ink-secondary">The tab bar scrolls inside itself on phones.</p>
            </TabsContent>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="success">Graded</StatusChip>
            <StatusChip tone="info">Submitted</StatusChip>
            <StatusChip tone="warning">Late</StatusChip>
            <StatusChip tone="error">Rejected</StatusChip>
            <StatusChip>Draft</StatusChip>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <UserAvatar firstName="Prince" secondName="Boateng" size={96} />
            <UserAvatar firstName="Prince" secondName="Boateng" size={56} />
            <UserAvatar firstName="Sarah" size={40} />
            <UserAvatar size={32} />
            <UserAvatar firstName="Ama" secondName="Asare" imageUrl="/does-not-exist.webp" size={40} />
            <UserAvatar firstName="Yaw" secondName="Darko" size={24} />
          </div>
        </Section>

        <Section title="Cards and lists">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-2">
              <CardTitle>Introduction to Biblical Studies</CardTitle>
              <CardDescription>BIB101 · 12 lessons · Ama Boateng</CardDescription>
            </Card>
            <InsetList>
              <InsetListRow leading={<UserAvatar firstName="Kwame" secondName="Mensah" size={40} decorative />} title="Kwame Mensah" secondary="kwame@example.org" chevron />
              <InsetListRow leading={<GraduationCap className="size-6" aria-hidden="true" />} title="Lessons" trailing="12" chevron />
            </InsetList>
          </div>
        </Section>

        <Section title="Responsive table">
          <ResponsiveTable
            caption="Learners"
            rows={ROWS}
            getRowKey={(r) => r.id}
            columns={[
              { key: 'avatar', header: 'Learner', card: 'leading', cell: (r) => <UserAvatar firstName={r.first} secondName={r.second} size={40} decorative /> },
              { key: 'name', header: 'Name', card: 'title', cell: (r) => `${r.first} ${r.second}` },
              { key: 'email', header: 'Email', card: 'secondary', cell: (r) => r.email },
              { key: 'course', header: 'Course', card: 'detail', cell: (r) => r.course },
              { key: 'status', header: 'Status', card: 'status', cell: (r) => <StatusChip tone={r.status === 'Active' ? 'success' : 'warning'}>{r.status}</StatusChip> },
            ]}
          />
        </Section>

        <Section title="Responsive chart">
          <Card>
            <ResponsiveChart title="Score distribution" summary="Most learners (31) scored 70-79%. 91 graded, 3 missing.">
              {({ compact }) => (
                <div className="flex h-full items-end gap-2 border-b border-l border-hairline px-2">
                  {BANDS.map(([band, n]) => (
                    <div key={band} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-caption text-ink-secondary">{n}</span>
                      <span className="w-full rounded-t-xs bg-chart-bar" style={{ height: `${(Number(n) / max) * 80}%` }} />
                      <span className="truncate text-caption text-ink-secondary">{compact ? String(band).split('-')[0] : band}</span>
                    </div>
                  ))}
                </div>
              )}
            </ResponsiveChart>
          </Card>
        </Section>

        <Section title="Toasts">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => toast.show('profile.saved')}>
              Success
            </Button>
            <Button variant="outline" onClick={() => toast.show('learner.upload-resumed')}>
              Info
            </Button>
            <Button variant="outline" onClick={() => toast.show('learner.submitted-late')}>
              Warning
            </Button>
            <Button variant="outline" onClick={() => toast.show('request.failed', { onAction: () => toast.show('profile.saved') })}>
              Error with Retry
            </Button>
            <Button variant="outline" onClick={() => toast.show('admin.course-archived', { onAction: () => undefined })}>
              Undo
            </Button>
          </div>
        </Section>

        <Section title="In-app browser notice">
          <p className="m-0 text-body-sm text-ink-secondary">Preview with an Instagram user agent. In the app it appears at the top of every page inside an in-app browser.</p>
          <div className="overflow-hidden rounded-md border border-hairline">
            <InAppBrowserNotice userAgent="Mozilla/5.0 (iPhone) Instagram 300.0" preview />
          </div>
        </Section>

        <Section title="Bottom sheet">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Open filters</Button>
            </SheetTrigger>
            <SheetContent title="Filters">
              <div className="flex flex-col gap-3 px-2">
                <Label htmlFor="sheet-search">Search learners</Label>
                <Input id="sheet-search" type="search" />
              </div>
            </SheetContent>
          </Sheet>
        </Section>

        <Section title="States">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <EmptyState title="No courses yet" description="Courses appear here once an administrator enrols you." />
            <ErrorState onRetry={() => undefined} />
            <OfflineState />
          </div>
        </Section>

        <Section title="Skeletons">
          <DashboardSkeleton />
          <ListSkeleton rows={3} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormSkeleton fields={2} />
            <ChartSkeleton />
          </div>
        </Section>

        <Section title="Floating action buttons">
          <p className="m-0 text-body-sm text-ink-secondary">Below 1024 px a speed dial appears at the bottom right. On desktop the same actions are header buttons.</p>
          <div className="hidden gap-3 lg:flex">
            <Button>
              <UserPlus aria-hidden="true" />
              Add learner
            </Button>
          </div>
        </Section>
      </main>
      <SpeedDial
        label="Add"
        allowed
        actions={[
          { label: 'Add learner', icon: UserPlus, onSelect: () => undefined },
          { label: 'Provision lecturer', icon: GraduationCap, onSelect: () => undefined },
          { label: 'Import CSV', icon: FileUp, onSelect: () => undefined },
        ]}
      />
      <Fab label="Hidden demo" allowed={false} onClick={() => undefined} />
    </div>
  );
}
