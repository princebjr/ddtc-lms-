// @vitest-environment jsdom
// Step 11.1 (ADR-020; owner answers of 2026-11-06): live presence.
// - The provider joins one private channel per course, announces only the person's own id, and lists
//   the others online across channels (each once, never the person themselves); names come from
//   presence_people. It leaves the channels when the session ends.
// - The card shows "Who's online (N)", lecturers first, each with a green dot and role; up to 8 then Show all.
// Who may join and who is named is tested in pgTAP 33.
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceProvider } from '@/components/presence/PresenceProvider.jsx';
import { WhoIsOnline } from '@/components/presence/WhoIsOnline.jsx';

const rt = vi.hoisted(() => {
  /** @type {Array<{ topic: string, opts: any, state: Record<string, unknown[]>, handlers: Array<() => void>, tracked: unknown[] }>} */
  const channels = [];
  return {
    channels,
    removed: /** @type {string[]} */ ([]),
    client: {
      channel(/** @type {string} */ topic, /** @type {any} */ opts) {
        const ch = {
          topic,
          opts,
          state: /** @type {Record<string, unknown[]>} */ ({}),
          handlers: /** @type {Array<() => void>} */ ([]),
          tracked: /** @type {unknown[]} */ ([]),
          on(/** @type {string} */ _type, /** @type {any} */ _filter, /** @type {() => void} */ fn) {
            ch.handlers.push(fn);
            return ch;
          },
          subscribe(/** @type {(s: string) => void} */ cb) {
            cb('SUBSCRIBED');
            return ch;
          },
          track: async (/** @type {unknown} */ p) => ch.tracked.push(p),
          presenceState: () => ch.state,
        };
        channels.push(ch);
        return ch;
      },
      removeChannel: async (/** @type {{ topic: string }} */ ch) => rt.removed.push(ch.topic),
    },
  };
});
const api = vi.hoisted(() => ({ fetchPresenceCourses: vi.fn(), fetchPresencePeople: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));
vi.mock('@/hooks/use-avatar-url.js', () => ({ useAvatarUrl: () => null }));
vi.mock('@/lib/presence.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getRealtime: async () => rt.client,
  fetchPresenceCourses: () => api.fetchPresenceCourses(),
  fetchPresencePeople: (/** @type {string[]} */ ids) => api.fetchPresencePeople(ids),
}));

const person = (/** @type {string} */ id, /** @type {string} */ first, /** @type {'LEARNER' | 'LECTURER'} */ role = 'LEARNER') => ({
  id,
  first_name: first,
  second_name: 'Mensah',
  role,
  profile_image_file_id: null,
});
/** Makes people "online" on a channel, as Realtime would, and fires its sync. */
const online = (/** @type {number} */ i, /** @type {string[]} */ keys) =>
  act(() => {
    rt.channels[i].state = Object.fromEntries(keys.map((k) => [k, [{}]]));
    for (const fn of rt.channels[i].handlers) fn();
  });

beforeEach(() => {
  vi.clearAllMocks();
  rt.channels.length = 0;
  rt.removed.length = 0;
});

describe('presence', () => {
  it('joins each course channel privately, announces only itself, and names the others once', async () => {
    api.fetchPresenceCourses.mockResolvedValue(['c1', 'c2']);
    api.fetchPresencePeople.mockImplementation(async (/** @type {string[]} */ ids) =>
      [person('t1', 'Ama', 'LECTURER'), person('l2', 'Abena'), person('l3', 'Esi')].filter((p) => ids.includes(p.id)),
    );
    const view = render(
      <PresenceProvider userId="me">
        <WhoIsOnline />
      </PresenceProvider>,
    );
    await waitFor(() => expect(rt.channels).toHaveLength(2));
    expect(rt.channels.map((c) => c.topic)).toEqual(['presence:course:c1', 'presence:course:c2']);
    expect(rt.channels[0].opts).toEqual({ config: { private: true, presence: { key: 'me' } } });
    expect(rt.channels[0].tracked).toEqual([{ online: true }]);
    expect(await screen.findByRole('heading', { name: "Who's online (0)" })).toBeTruthy();
    expect(screen.getByText('None of your course-mates are online right now.')).toBeTruthy();

    online(0, ['me', 't1', 'l2']);
    online(1, ['l2', 'l3']);
    expect(await screen.findByRole('heading', { name: "Who's online (3)" })).toBeTruthy();
    await waitFor(() => expect(api.fetchPresencePeople).toHaveBeenLastCalledWith(['l2', 'l3', 't1']));
    const rows = await screen.findAllByTestId('online-person');
    expect(rows.map((r) => r.textContent)).toEqual(['AMAma MensahLecturer · online', 'AMAbena MensahLearner · online', 'EMEsi MensahLearner · online']); // initials, name, role

    online(1, []);
    await waitFor(() => expect(screen.getAllByTestId('online-person')).toHaveLength(2));
    expect(screen.getByRole('heading', { name: "Who's online (2)" })).toBeTruthy();

    view.unmount();
    expect(rt.removed).toEqual(['presence:course:c1', 'presence:course:c2']);
  });

  it('shows 8 and offers Show all for more', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `l${i}`);
    api.fetchPresenceCourses.mockResolvedValue(['c1']);
    api.fetchPresencePeople.mockResolvedValue(ids.map((id, i) => person(id, `Learner${i}`)));
    render(
      <PresenceProvider userId="me">
        <WhoIsOnline />
      </PresenceProvider>,
    );
    await waitFor(() => expect(rt.channels).toHaveLength(1));
    online(0, ids);
    expect(await screen.findByRole('heading', { name: "Who's online (10)" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('online-person')).toHaveLength(8));
    expect(screen.getByRole('button', { name: 'Show all' })).toBeTruthy();
  });

  it('with no courses, joins nothing and says nobody is online', async () => {
    api.fetchPresenceCourses.mockResolvedValue([]);
    render(
      <PresenceProvider userId="me">
        <WhoIsOnline />
      </PresenceProvider>,
    );
    expect(await screen.findByRole('heading', { name: "Who's online (0)" })).toBeTruthy();
    expect(rt.channels).toHaveLength(0);
  });

  // Owner request of 2026-11-11: a lecturer has learners, not course-mates.
  it('tells a lecturer that none of their learners are online', async () => {
    const view = render(
      <PresenceProvider userId="me">
        <WhoIsOnline audience="lecturer" />
      </PresenceProvider>,
    );
    expect(await screen.findByText('None of your learners are online right now.')).toBeTruthy();
    expect(screen.queryByText(/course-mates/)).toBeNull();
    view.unmount();
  });
});
