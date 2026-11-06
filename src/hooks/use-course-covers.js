import { useEffect, useState } from 'react';
import { signedUrl } from '@/lib/storage.js';
import { getSupabase } from '@/lib/supabase.js';

// Signed URLs of course covers. public.course_cover_paths answers only for courses the user may
// see and only for VALIDATED covers; Storage policies check again when the URL is created.

/** @param {readonly string[]} courseIds @returns {Record<string, string>} course id -> URL */
export function useCourseCovers(courseIds) {
  const [urls, setUrls] = useState(/** @type {Record<string, string>} */ ({}));
  const key = [...courseIds].sort().join(',');

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase().rpc('course_cover_paths', { p_courses: key.split(',') });
      /** @type {Record<string, string>} */
      const next = {};
      for (const row of /** @type {Array<{ course_id: string, storage_path: string }>} */ (data ?? [])) {
        const url = await signedUrl('course-covers', row.storage_path);
        if (url) next[row.course_id] = url;
      }
      if (!cancelled) setUrls(next);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
