// D42: administrators filter Users, Learners and Enrolments by branch: one branch, or learners
// without one ("No branch" means learners only: staff never have a branch). The lists read the
// branch name with each person. RLS decides what each role may read; these tests check the queries.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUsers, NO_BRANCH } from '@/lib/admin/users.js';
import { fetchEnrolments } from '@/lib/courses/enrolments.js';

/** @type {Array<[string, ...unknown[]]>} */
let calls = [];

/** A query builder that records every call and answers with no rows. */
function recorder() {
  /** @type {any} */
  const builder = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'then') return (/** @type {(v: unknown) => void} */ resolve) => resolve({ data: [], error: null });
        return (/** @type {unknown[]} */ ...args) => {
          calls.push([String(prop), ...args]);
          return builder;
        };
      },
    },
  );
  return builder;
}

vi.mock('@/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: (/** @type {string} */ table) => {
      calls.push(['from', table]);
      return recorder();
    },
  }),
}));

beforeEach(() => {
  calls = [];
});

/** @param {string} name */
const named = (name) => calls.filter((c) => c[0] === name);

describe('people lists', () => {
  const base = { view: /** @type {const} */ ('all'), search: '', role: /** @type {const} */ (''), status: /** @type {const} */ (''), sort: /** @type {const} */ ('name'), page: 0 };

  it('read each person\'s branch name', async () => {
    await fetchUsers(base);
    expect(String(named('select')[0][1])).toContain('branch_id, branch:branches(name)');
    expect(named('is')).toEqual([]);
    expect(named('eq').some((c) => c[1] === 'branch_id')).toBe(false);
  });

  it('filter by one branch', async () => {
    await fetchUsers({ ...base, view: 'learners', branch: 'b5' });
    expect(named('eq')).toEqual([
      ['eq', 'role', 'LEARNER'],
      ['eq', 'branch_id', 'b5'],
    ]);
  });

  it('"No branch" finds learners without one, never staff', async () => {
    await fetchUsers({ ...base, branch: NO_BRANCH });
    expect(named('eq')).toEqual([['eq', 'role', 'LEARNER']]);
    expect(named('is')).toEqual([['is', 'branch_id', null]]);
  });
});

describe('enrolments', () => {
  it('read the learner\'s branch name, and keep every enrolment when nothing filters on the learner', async () => {
    await fetchEnrolments({});
    const select = String(named('select')[0][1]);
    expect(select).toContain('learner:profiles!course_enrollments_learner_id_fkey(');
    expect(select).toContain('branch:branches(name)');
  });

  it('filter by the learner\'s branch, keeping only enrolments whose learner matches', async () => {
    await fetchEnrolments({ branch: 'b2' });
    expect(String(named('select')[0][1])).toContain('learner:profiles!course_enrollments_learner_id_fkey!inner(');
    expect(named('eq')).toEqual([['eq', 'learner.branch_id', 'b2']]);
  });

  it('"No branch" finds learners without one', async () => {
    await fetchEnrolments({ branch: NO_BRANCH, status: 'ACTIVE' });
    expect(named('eq')).toEqual([['eq', 'enrolment_status', 'ACTIVE']]);
    expect(named('is')).toEqual([['is', 'learner.branch_id', null]]);
  });
});
