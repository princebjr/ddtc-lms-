import { useEffect, useState } from 'react';

/**
 * 'down' while the user scrolls down, 'up' when scrolling up or near the top.
 * @param {number} [threshold] minimum movement in px before the direction changes
 * @returns {'up' | 'down'}
 */
export function useScrollDirection(threshold = 8) {
  const [direction, setDirection] = useState(/** @type {'up' | 'down'} */ ('up'));

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 0) {
        setDirection('up');
      } else if (Math.abs(y - last) >= threshold) {
        setDirection(y > last ? 'down' : 'up');
      } else {
        return;
      }
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return direction;
}
