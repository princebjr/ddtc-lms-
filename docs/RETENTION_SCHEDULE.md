# DDTC LMS: Retention schedule (DRAFT)

**Status: draft for approval** by DDTC's privacy and incident contact, Prince Boateng (ADR-023 item 5; INPUTS 7 and 8, O21). Nothing here is a legal conclusion: DDTC's legal or privacy adviser decides what Ghanaian and other law requires (BUILD_PLAN section 13, D25). Until approved, the system keeps everything as it does today ("As built" below), which is the safe default: nothing educational is lost.

Rules that apply to every row (D25): academic and audit records are never hard-deleted by the app; courses and content are archived and accounts deactivated; any legally required erasure is done by a documented, audited administrator procedure that anonymises personal fields and keeps the academic rows; a hold (Retention page) stops any automatic removal.

| Data class | What it holds | As built today | Proposed period | Notes |
|---|---|---|---|---|
| Account and profile | Name, email, phone (if given), branch, ID number, role, status, profile picture | Kept while the account exists; deactivated, never deleted | While the person is a learner or staff member, then 7 years after deactivation; then anonymise on DDTC's instruction | Profile pictures replaced are removed by the hourly cleanup. |
| Authentication | Password hash, Google identity link, MFA factor, sessions and refresh tokens | Held by Supabase Auth; sessions expire (idle 10 minutes, D43) | Same as the account; sessions and tokens per Supabase | Revoked when an account is suspended or deactivated. |
| Academic records | Courses, lessons, enrolments, assignments, answers (text), grades, feedback, examination scripts and results, grade history | Kept indefinitely | Permanently (transcripts may be requested years later) | DDTC to confirm. |
| Learner audio answers | Recorded or uploaded audio on assignment and examination answers | Kept; D20 job runs as a dry run (off at launch) | 180 days after the grade or result is released (D20, ADR-022), once DDTC switches live deletion on after 30 days of dry runs | The grade, feedback and history stay. |
| Learner documents | PDF and Word answers | Kept indefinitely | Same as academic records | Never auto-deleted (D20). |
| Lesson and instruction media | Lesson audio, attachments, instruction audio, course covers | Kept while in use; removed media kept as history unless deleted by staff | While the course exists, then with the course archive | Course covers replaced are removed by cleanup. |
| Temporary uploads | Uploads never finished, rejected files | Removed after 24 hours by the hourly cleanup (D18) | 24 hours | Already in force. |
| Audit and security logs | Who did what and when (`audit_logs`), grade and exam history | Kept indefinitely; no one can change or delete them | At least 7 years | DDTC to confirm; never shorter than academic disputes may need. |
| Server logs | Supabase and Vercel request and function logs | Kept by the providers for their plan's period (days) | Provider default | No learner content or secrets are logged. |
| Notifications and emails | In-app notifications, email delivery records, reminders, announcements | Kept; a cleared notification is only hidden (ADR-024) | 2 years, then remove | Would need a small scheduled job; not built until approved. |
| Rate-limit counts | Per-person counts of heavy actions | Removed after 1 day | 1 day | Already in force. |
| Backups | Encrypted database dumps and Storage copies in R2 | 30 days (R2 lifecycle rules, D34) | 30 days | A deleted file may survive in backups for up to 30 days; the privacy notice should say so. |

**Requests from a person** (access, correction, erasure): the privacy contact receives them, an administrator acts through the normal screens (correction) or the anonymisation procedure (erasure, when the adviser confirms it is required), and the action is audited. Answer within the period the adviser sets.

**Approval.** Approved by: ____________________  Date: ____________  Changes from this draft: ____________________
