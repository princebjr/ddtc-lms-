# Owner request: announcements to learners (2026-11-11)

**Request (Prince Boateng, during Phase 11):** "i hope the admin or lecturer can pass on an info to learners".

## Answers (2026-11-11)

1. **Who sends:** both. A lecturer sends to the learners of a published course they teach; an
   administrator (with two-step verification) sends to all learners, one course or one branch.
2. **How it arrives:** in the app (the notification centre and its bell count; the course page shows the
   course's latest announcements) and by email, unless the learner turned off "Email me about my courses".
3. **When:** inside Phase 11, recorded in ADR-019, in the Phase 11 pull request.

## As built

Migration 42 (`announcements`, `announcement_send`, `announcement_archive`), pgTAP 32, the
Announcements page (`/lecturer/announcements`, `/admin/announcements`), the course page list, and the
toast "Announcement sent". Archived announcements are kept (hidden from learners), never deleted. Sending
and archiving are audited.
