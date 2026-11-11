import { ArrowRight, BookOpenText, GraduationCap, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card.jsx';

// The dashboard introduction (owner request of 2026-11-11): a short welcome for the signed-in role only,
// directly below the dashboard's statistic cards. Text only; it repeats none of the dashboard's figures.
// Each point is a list item marked with an arrow (owner request of 2026-11-11, second).

/** @type {Record<'admin' | 'lecturer' | 'learner', { icon: import('lucide-react').LucideIcon, title: string, lead: string, points: string[] }>} */
const INTRO = {
  admin: {
    icon: ShieldCheck,
    title: 'Welcome to DDTC LMS administration',
    lead: 'From here you keep Dynamic Discipleship Training Centre running smoothly.',
    points: [
      'Manage learner, lecturer and administrator accounts.',
      'Oversee courses, approvals and enrolments.',
      'Monitor activity, grading and the audit log.',
      'Open academic records, gradebooks and reports.',
    ],
  },
  lecturer: {
    icon: BookOpenText,
    title: 'Welcome to your teaching space',
    lead: 'Everything you need to teach your courses is here.',
    points: [
      'Create courses and add lessons, materials and audio teachings.',
      'Publish assignments and examinations.',
      'Grade submissions and give feedback.',
      'Follow your learners’ progress.',
    ],
  },
  learner: {
    icon: GraduationCap,
    title: 'Welcome to your learning space',
    lead: 'Grow in your studies at your own pace.',
    points: [
      'Open your courses and study the lessons.',
      'Listen to audio teachings.',
      'Complete assignments and take examinations.',
      'See your results and follow your progress.',
    ],
  },
};

/** @param {{ role: 'admin' | 'lecturer' | 'learner' }} props */
export function RoleIntro({ role }) {
  const intro = INTRO[role];
  return (
    <Card as="section" aria-labelledby="role-intro-heading" className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4" data-slot="role-intro">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-fill text-link" aria-hidden="true">
        <intro.icon className="size-6" />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 id="role-intro-heading" className="m-0 text-title-3 text-ink">
          {intro.title}
        </h2>
        <p className="m-0 text-body text-ink-secondary">{intro.lead}</p>
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 text-body text-ink md:grid-cols-2 md:gap-x-6">
          {intro.points.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <ArrowRight className="mt-1 size-4 shrink-0 text-link" aria-hidden="true" data-slot="intro-arrow" />
              <span className="min-w-0">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
