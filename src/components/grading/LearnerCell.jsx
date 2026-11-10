import { BranchChip } from '@/components/branches/BranchChip.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useProfileImage } from '@/hooks/use-profile-image.js';
import { formatIdNumber } from '@/lib/id-number.js';

/**
 * A learner in a grading list (Phase 9 results, Step 9.1 To grade): photo, name, ID number and the
 * branch chip under them (D42).
 * @param {{ row: { first_name: string, second_name: string, id_number: number | null, branch_name: string | null, profile_image_path: string | null } }} props
 */
export function LearnerCell({ row }) {
  const imageUrl = useProfileImage(row.profile_image_path);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar firstName={row.first_name} secondName={row.second_name} imageUrl={imageUrl} size={40} decorative />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-label text-ink">
          {row.first_name} {row.second_name}
        </span>
        <span className="text-caption text-ink-secondary tabular-nums">ID {formatIdNumber(row.id_number)}</span>
        <span className="mt-1">
          <BranchChip name={row.branch_name} />
        </span>
      </span>
    </span>
  );
}
