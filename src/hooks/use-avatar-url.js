import { useEffect, useState } from 'react';
import { clearOnSignOut } from '@/lib/private-caches.js';
import { signedUrl } from '@/lib/storage.js';
import { getSupabase } from '@/lib/supabase.js';

// The signed URL of a profile photo, or null while loading, when there is no photo, or when the
// file is not VALIDATED (Storage refuses it). UserAvatar then shows the initials.

/** @type {Map<string, string | null>} file id -> storage path */
const paths = new Map();
clearOnSignOut(() => paths.clear());

/** @param {string | null | undefined} fileId @returns {string | null} */
export function useAvatarUrl(fileId) {
  const [result, setResult] = useState(/** @type {{ id: string, url: string | null } | null} */ (null));

  useEffect(() => {
    if (!fileId) return undefined;
    let cancelled = false;
    (async () => {
      let path = paths.get(fileId);
      if (path === undefined) {
        const { data } = await getSupabase().from('file_objects').select('storage_path').eq('id', fileId).maybeSingle();
        path = data?.storage_path ?? null;
        paths.set(fileId, path);
      }
      const url = path ? await signedUrl('profile-images', path) : null;
      if (!cancelled) setResult({ id: fileId, url });
    })().catch(() => {
      if (!cancelled) setResult({ id: fileId, url: null });
    });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return fileId && result?.id === fileId ? result.url : null;
}
