import { useEffect, useState } from 'react';
import { signedUrl } from '@/lib/storage.js';

// The signed URL of a profile photo whose storage path is already known (course_roster and
// course_teachers return it), or null; UserAvatar then shows the initials.

/** @param {string | null | undefined} path @returns {string | null} */
export function useProfileImage(path) {
  const [result, setResult] = useState(/** @type {{ path: string, url: string | null } | null} */ (null));
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    signedUrl('profile-images', path)
      .then((url) => !cancelled && setResult({ path, url }))
      .catch(() => !cancelled && setResult({ path, url: null }));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return path && result?.path === path ? result.url : null;
}
