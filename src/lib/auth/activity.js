// D43: what keeps a session awake without anyone touching the screen (lesson audio playing, a
// recording, an upload in progress), and which screens hold unsaved work, so the idle warning can
// say so. Module state, so plain functions (uploads) and components can both use it.

let holds = 0;
let unsaved = 0;

/**
 * @param {() => void} onRelease
 * @returns {() => void} releases once, however often it is called
 */
function once(onRelease) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    onRelease();
  };
}

/**
 * Keeps the session awake until the returned function is called.
 * @returns {() => void}
 */
export function holdAwake() {
  holds += 1;
  return once(() => {
    holds -= 1;
  });
}

/** True while anything holds the session awake. */
export function isHeldAwake() {
  return holds > 0;
}

/**
 * Marks unsaved work on screen until the returned function is called.
 * @returns {() => void}
 */
export function markUnsaved() {
  unsaved += 1;
  return once(() => {
    unsaved -= 1;
  });
}

/** True while any screen has unsaved work. */
export function hasUnsavedWork() {
  return unsaved > 0;
}
