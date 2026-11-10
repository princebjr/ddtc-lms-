import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// A course cover (DESIGN.md 13: 16:9): whatever the photo's shape, it fills a 16:9 frame and is cropped
// to it (object-cover), never stretching the card or page. The frame clips its content, which also
// stops a tall photo from making the frame taller (an aspect-ratio box otherwise grows to fit what it
// holds). Without a photo, the tinted emblem tile.

/** @param {{ url?: string | null, alt?: string, className?: string }} props */
export function CourseCover({ url, alt = '', className }) {
  return (
    <div data-slot="course-cover" className={cn('relative aspect-video w-full overflow-hidden bg-fill', className)}>
      {url ? (
        <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-hero-soft text-link">
          <BookOpen className="size-10" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
