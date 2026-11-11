import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchPresenceCourses, fetchPresencePeople, getRealtime, presenceTopic } from '@/lib/presence.js';

// Presence for the whole signed-in session (Step 11.1, ADR-020): while a learner or lecturer has the app
// open, they are announced on each of their courses' channels; when they close it, sign out (including
// the idle sign-out) or lose the connection, Realtime drops them within about a minute. The online
// course-mates are shared with the "Who's online" card. Administrators never use this.

/** @typedef {import('@/lib/presence.js').OnlinePerson} OnlinePerson */
/** @typedef {{ ready: boolean, people: OnlinePerson[] }} PresenceState */

const PresenceContext = createContext(/** @type {PresenceState} */ ({ ready: false, people: [] }));

/** @param {{ userId: string, children: import('react').ReactNode }} props */
export function PresenceProvider({ userId, children }) {
  const [ids, setIds] = useState(/** @type {string[] | null} */ (null));
  const [people, setPeople] = useState(/** @type {OnlinePerson[]} */ ([]));

  useEffect(() => {
    let live = true;
    /** @type {Array<import('@supabase/realtime-js').RealtimeChannel>} */
    const channels = [];
    /** @type {import('@supabase/realtime-js').RealtimeClient | null} */
    let client = null;
    const recompute = () => {
      const online = new Set();
      for (const ch of channels) for (const key of Object.keys(ch.presenceState())) if (key !== userId) online.add(key);
      if (live) setIds([...online].sort());
    };
    (async () => {
      try {
        const courses = await fetchPresenceCourses();
        if (!live) return;
        if (!courses.length) {
          setIds([]);
          return;
        }
        client = await getRealtime();
        if (!live) return;
        for (const courseId of courses) {
          const ch = client.channel(presenceTopic(courseId), { config: { private: true, presence: { key: userId } } });
          ch.on('presence', { event: 'sync' }, recompute);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') void ch.track({ online: true });
          });
          channels.push(ch);
        }
        recompute();
      } catch {
        // Presence is a convenience: if it cannot start, the card simply says nobody is shown.
        if (live) setIds([]);
      }
    })();
    return () => {
      live = false;
      for (const ch of channels) void client?.removeChannel(ch);
    };
  }, [userId]);

  // Names for the announced ids, asked again (after a short pause) whenever the set of ids changes.
  const idsKey = ids === null ? null : ids.join(',');
  useEffect(() => {
    if (idsKey === null) return;
    const list = idsKey ? idsKey.split(',') : [];
    let live = true;
    const timer = setTimeout(() => {
      fetchPresencePeople(list)
        .then((found) => live && setPeople(found))
        .catch(() => live && setPeople([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [idsKey]);

  const value = useMemo(() => ({ ready: ids !== null, people: ids && ids.length ? people.filter((p) => ids.includes(p.id)) : [] }), [ids, people]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/** The online course-mates (never administrators, never the person themselves). */
export const usePresence = () => useContext(PresenceContext);
