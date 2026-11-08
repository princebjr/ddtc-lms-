// Caches of private data (signed file URLs, file paths, lists read for the signed-in user) register
// here and are emptied on every sign-out, so nothing of the last session stays in memory (D43).

/** @type {Set<() => void>} */
const clearers = new Set();

/** @param {() => void} clear */
export function clearOnSignOut(clear) {
  clearers.add(clear);
}

export function clearPrivateCaches() {
  for (const clear of clearers) {
    try {
      clear();
    } catch {
      // Keep clearing the rest.
    }
  }
}
