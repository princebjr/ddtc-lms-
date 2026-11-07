# Owner request (2026-11-07): lesson media management and lecturer recording

Status: **plan approved by the owner on 2026-11-07; recorded as ADR-007 in `docs/DECISIONS.md`.**
Media management is built in Phase 6 (PR #10; evidence in `docs/acceptance/phase-06.md`). Lecturer
recording is scheduled in the Phase 8 file. BUILD_PLAN D09 and D25 and the Phase 6, 8 and 12 files
carry the change.

## What the owner asked for

1. **Lecturers record lesson audio in the app**, not only upload it, and can record and upload
   **more than one audio** per lesson.
2. **Delete uploaded media** (lecturers on their courses, administrators on any course):
   - remove a course cover image (the course falls back to the placeholder everywhere, and the
     file is deleted from Storage);
   - delete any lesson audio or attachment in the lesson editor (Trash2 button), with a
     confirmation dialog ("Delete this audio? This cannot be undone.", Cancel and a destructive
     Delete), a loading state, a success toast, and an error toast that leaves the item in place;
   - learners never see delete controls and cannot delete through direct API calls;
   - one reusable service or hook (for example `useMediaDelete`), "file already missing" handled,
     no orphaned files, deletions audited;
   - tests: delete visibility per role, confirmation, success and failure (Vitest and React
     Testing Library), and a Playwright lecturer flow (upload, delete, confirm it is gone).

The full text of item 2 was pasted by the owner on 2026-11-07 in the Claude Code session.

## Owner decisions (2026-11-07)

| Question | Decision |
|---|---|
| When is lecturer recording built? | **Phase 8**, with the learners' recorder (same component). Each in-app lesson recording is at most **30 minutes**; longer lessons are recorded with the phone's own recorder and uploaded. Several recordings per lesson are allowed. |
| How many audio files per lesson? | **Up to 10**, each with a title and an order chosen by the lecturer; learners see one player per audio. Each upload stays within 100 MB and 90 minutes (D17). |
| What does Delete do to lesson audio and attachments? | **The file is deleted from Storage for good; the database keeps a small record** (title, uploader, who deleted it and when) so history and the audit log stay intact. This replaces the "never delete lesson audio or attachments" rule (D09, D25, Phase 12) for these two resources only. |
| How are delete permissions enforced? | **Server function only.** Nobody (administrators and lecturers included) can delete from the browser directly; an Edge Function checks administrator or course lecturer in the database, updates the record, deletes the file and writes the audit log. Tests prove direct deletes are refused for every role. |
| When is the media work built? | **Now, in Phase 6** (added to PR #10). Phase 6 closes after it, and the owner's real-device check covers the new screens. |

Recommendations accepted as part of the answers above (they differ from the pasted text):
- **Order of deletion:** the item leaves the lesson first (one database step; if that fails, the
  item stays in place with an error toast), then the file is deleted. If the file deletion fails,
  the hourly `cleanup-files` job retries it. This avoids broken players and orphaned files.
- **No Storage or table DELETE policies** for any role (the pasted text asked for them); the
  server function does the work with the file registry and audit log.
- New toasts are added to `docs/UI_FEEDBACK.md` (the only toasts that may exist).
