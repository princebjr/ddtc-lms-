import { BookOpen, ChevronRight, CircleHelp, LifeBuoy, Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { HELP_SECTIONS } from '@/lib/help/content.js';

// Help & Support on the learner's and lecturer's dashboards (owner request 2026-11-13, ADR-027): the four
// sections of the Help page, each a link straight to it, so someone new finds their way from the first screen.

const ICONS = { 'getting-started': Rocket, 'how-to': BookOpen, faq: CircleHelp, contact: LifeBuoy };

/** @param {{ role: 'learner' | 'lecturer' }} props */
export function HelpCard({ role }) {
  return (
    <Card as="section" aria-labelledby="help-card-heading" className="flex flex-col gap-3" data-slot="help-card">
      <div className="flex flex-col gap-1">
        <CardTitle id="help-card-heading">Help & Support</CardTitle>
        <CardDescription>New to DDTC LMS, or stuck? Start here.</CardDescription>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
        {HELP_SECTIONS.map((s) => {
          const Icon = ICONS[s.id];
          return (
            <li key={s.id}>
              <Link
                to={`/${role}/help#${s.id}`}
                className="flex min-h-12 items-center gap-3 rounded-md border border-hairline px-3 py-2 text-ink hover:bg-fill focus-visible:focus-ring"
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-label">{s.title}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-secondary" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
