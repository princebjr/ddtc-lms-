import {
  Bell,
  BookOpen,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';

// Navigation per role (D40, DESIGN.md 12.4, prototype in docs/prototype/).
// Phone: exactly three destination icons plus a permanent More button. Destinations that are not
// in the pill live either under a pill item (`under`) or under More. The sidebar groups follow the
// prototype. Course-scoped pages (lessons, grading, results) live inside the course workspace,
// not in global navigation. `phase` says which build phase delivers the page.

/** @typedef {'admin' | 'lecturer' | 'learner'} RoleKey */

/**
 * @typedef {object} Destination
 * @property {string} slug        path segment under the role's base path
 * @property {string} label
 * @property {string} title       page title
 * @property {string} description page subtitle
 * @property {import('lucide-react').LucideIcon} icon
 * @property {string} group       sidebar group
 * @property {string} under       pill item this page lives under ('more' for the More sheet)
 * @property {number} phase       build phase that delivers this page
 */

/**
 * @typedef {object} RoleNavigation
 * @property {string} roleLabel
 * @property {readonly [string, string, string]} pill  slugs of the three pill destinations
 * @property {readonly Destination[]} destinations
 */

/** @type {Readonly<Record<RoleKey, RoleNavigation>>} */
export const NAVIGATION = Object.freeze({
  admin: {
    roleLabel: 'Administrator',
    pill: ['dashboard', 'users', 'courses'],
    destinations: [
      { slug: 'dashboard', label: 'Dashboard', title: 'Dashboard', description: 'What is happening across DDTC today.', icon: LayoutDashboard, group: 'Overview', under: 'dashboard', phase: 4 },
      { slug: 'users', label: 'Users', title: 'Users', description: 'All accounts.', icon: Users, group: 'People', under: 'users', phase: 4 },
      { slug: 'lecturers', label: 'Lecturers', title: 'Lecturer management', description: 'Provision and manage lecturers.', icon: GraduationCap, group: 'People', under: 'users', phase: 4 },
      { slug: 'learners', label: 'Learners', title: 'Learner management', description: 'Manage learner accounts.', icon: UsersRound, group: 'People', under: 'users', phase: 4 },
      { slug: 'courses', label: 'Courses', title: 'Course oversight', description: 'All courses.', icon: BookOpen, group: 'Learning', under: 'courses', phase: 5 },
      { slug: 'approvals', label: 'Approvals', title: 'Course approval', description: 'Review courses before they publish.', icon: ShieldCheck, group: 'Learning', under: 'courses', phase: 5 },
      { slug: 'enrolments', label: 'Enrolments', title: 'Enrolment management', description: 'Enrol and manage learners.', icon: ClipboardCheck, group: 'Learning', under: 'courses', phase: 5 },
      { slug: 'assignments', label: 'Assignments', title: 'Assignment oversight', description: 'All assignments.', icon: ClipboardList, group: 'Learning', under: 'courses', phase: 7 },
      { slug: 'gradebooks', label: 'Gradebooks', title: 'Gradebook oversight', description: 'Results by course.', icon: ClipboardCheck, group: 'Learning', under: 'more', phase: 10 },
      { slug: 'reports', label: 'Reports', title: 'Reports and analytics', description: 'Learning activity.', icon: ChartColumn, group: 'Insight', under: 'more', phase: 11 },
      { slug: 'notifications', label: 'Notifications', title: 'Notifications', description: 'Latest alerts.', icon: Bell, group: 'System', under: 'more', phase: 11 },
      { slug: 'audit-logs', label: 'Audit logs', title: 'Audit logs', description: 'Who did what, and when.', icon: ScrollText, group: 'System', under: 'more', phase: 11 },
      { slug: 'settings', label: 'Settings', title: 'Settings', description: 'Institution settings.', icon: Settings, group: 'System', under: 'more', phase: 11 },
      { slug: 'profile', label: 'Profile', title: 'Profile settings', description: 'Your account.', icon: UserRound, group: 'Account', under: 'more', phase: 4 },
    ],
  },
  lecturer: {
    roleLabel: 'Lecturer',
    pill: ['dashboard', 'my-courses', 'to-grade'],
    destinations: [
      { slug: 'dashboard', label: 'Dashboard', title: 'Dashboard', description: 'What is happening across your courses.', icon: LayoutDashboard, group: 'Overview', under: 'dashboard', phase: 5 },
      { slug: 'my-courses', label: 'My Courses', title: 'My Courses', description: 'Courses you teach.', icon: BookOpen, group: 'Teaching', under: 'my-courses', phase: 5 },
      { slug: 'to-grade', label: 'To grade', title: 'To grade', description: 'Submissions waiting for marks and feedback.', icon: ClipboardList, group: 'Assessment', under: 'to-grade', phase: 9 },
      { slug: 'notifications', label: 'Notifications', title: 'Notifications', description: 'Latest alerts.', icon: Bell, group: 'Account', under: 'more', phase: 11 },
      { slug: 'profile', label: 'Profile', title: 'Profile settings', description: 'Your account.', icon: UserRound, group: 'Account', under: 'more', phase: 4 },
    ],
  },
  learner: {
    roleLabel: 'Learner',
    pill: ['dashboard', 'my-courses', 'assignments'],
    destinations: [
      { slug: 'dashboard', label: 'Dashboard', title: 'Dashboard', description: 'What is happening with your learning.', icon: LayoutDashboard, group: 'Learn', under: 'dashboard', phase: 5 },
      { slug: 'my-courses', label: 'My Courses', title: 'My Courses', description: 'Courses you are enrolled in.', icon: BookOpen, group: 'Learn', under: 'my-courses', phase: 5 },
      { slug: 'assignments', label: 'Assignments', title: 'Assignments', description: 'Due soon and recent.', icon: ClipboardList, group: 'Work', under: 'assignments', phase: 7 },
      { slug: 'grades', label: 'Grades', title: 'Grades and feedback', description: 'Your released results.', icon: ClipboardCheck, group: 'Results', under: 'more', phase: 9 },
      { slug: 'notifications', label: 'Notifications', title: 'Notifications', description: 'Latest alerts.', icon: Bell, group: 'Account', under: 'more', phase: 11 },
      { slug: 'profile', label: 'Profile', title: 'Profile settings', description: 'Your account.', icon: UserRound, group: 'Account', under: 'more', phase: 4 },
    ],
  },
});

/** @type {readonly RoleKey[]} */
export const ROLE_KEYS = Object.freeze(/** @type {RoleKey[]} */ (['admin', 'lecturer', 'learner']));

/**
 * @param {RoleKey} role
 * @param {string} slug
 * @returns {Destination | undefined}
 */
export function findDestination(role, slug) {
  return NAVIGATION[role].destinations.find((d) => d.slug === slug);
}

/**
 * The pill item to highlight for a page: one of the three pill slugs, or 'more'.
 * @param {RoleKey} role
 * @param {string} slug
 * @returns {string}
 */
export function activePillItem(role, slug) {
  return findDestination(role, slug)?.under ?? 'more';
}

/**
 * Destinations listed in the More sheet: every destination that is not one of the three pill items.
 * @param {RoleKey} role
 * @returns {Destination[]}
 */
export function moreSheetDestinations(role) {
  const nav = NAVIGATION[role];
  return nav.destinations.filter((d) => !nav.pill.includes(d.slug));
}

/**
 * Sidebar groups in order.
 * @param {RoleKey} role
 * @returns {Array<{ group: string, items: Destination[] }>}
 */
export function sidebarGroups(role) {
  /** @type {Map<string, Destination[]>} */
  const groups = new Map();
  for (const d of NAVIGATION[role].destinations) {
    if (d.slug === 'profile') continue; // Profile is in the account menu
    const list = groups.get(d.group) ?? [];
    list.push(d);
    groups.set(d.group, list);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}
