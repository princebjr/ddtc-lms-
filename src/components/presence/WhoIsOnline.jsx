import { Users } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { ListSkeleton } from '@/components/feedback/Skeletons.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet.jsx';
import { useAvatarUrl } from '@/hooks/use-avatar-url.js';
import { usePresence } from './PresenceProvider.jsx';

// "Who's online (N)" (Step 11.1, ADR-020; owner request of 2026-11-06): the course-mates who have the app
// open now, lecturers first then by name, each with photo or initials, full name, role and a green dot.
// Up to 8 on the card; Show all lists everyone in a sheet. Updates by itself. Administrators are never
// shown or counted, and nothing private (email, ID number) is.

const SHOWN = 8;
const ROLE = { LECTURER: 'Lecturer', LEARNER: 'Learner', ADMIN: '' };

/** @param {{ person: import('@/lib/presence.js').OnlinePerson }} props */
function PersonRow({ person }) {
  const imageUrl = useAvatarUrl(person.profile_image_file_id);
  const name = `${person.first_name} ${person.second_name}`;
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2" data-testid="online-person">
      <span className="relative shrink-0">
        <UserAvatar firstName={person.first_name} secondName={person.second_name} imageUrl={imageUrl} size={40} decorative />
        <span aria-hidden="true" className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-success" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-ink">{name}</span>
        <span className="text-body-sm text-ink-secondary">{`${ROLE[person.role]} · online`}</span>
      </span>
    </li>
  );
}

/** @param {{ people: import('@/lib/presence.js').OnlinePerson[], label: string }} props */
function People({ people, label }) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0" aria-label={label}>
      {people.map((p) => (
        <PersonRow key={p.id} person={p} />
      ))}
    </ul>
  );
}

export function WhoIsOnline() {
  const { ready, people } = usePresence();
  return (
    <section aria-labelledby="who-online-heading" className="flex flex-col gap-3" data-slot="who-is-online">
      <div className="flex items-center justify-between gap-3">
        <h2 id="who-online-heading" className="m-0 text-title-3 text-ink">
          {ready ? `Who's online (${people.length})` : "Who's online"}
        </h2>
        {people.length > SHOWN ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost">Show all</Button>
            </SheetTrigger>
            <SheetContent title={`Who's online (${people.length})`} description="Course-mates with DDTC LMS open now.">
              <div className="overflow-y-auto">
                <People people={people} label="Everyone online" />
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
      {!ready ? (
        <ListSkeleton rows={3} columns={2} />
      ) : people.length === 0 ? (
        <Card className="flex items-center gap-3 p-4">
          <Users className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
          <p className="m-0 text-body-sm text-ink-secondary">None of your course-mates are online right now.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-card">
          <People people={people.slice(0, SHOWN)} label="Online now" />
        </div>
      )}
      <p className="m-0 text-caption text-ink-secondary" role="status" aria-live="polite">
        {ready ? `${people.length} ${people.length === 1 ? 'course-mate' : 'course-mates'} online` : ''}
      </p>
    </section>
  );
}
