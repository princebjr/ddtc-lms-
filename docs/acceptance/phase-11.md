# Phase 11 acceptance evidence: Notifications, reports, audit viewer and settings

- Phase file: `docs/phases/phase-11-notifications-reports-settings.md`
- Branch and pull request: `phase-11-notifications`, PR_LINK
- Reviewer (O2): Prince Boateng
- Evidence date: 2026-11-11
- Source: the Phase 11 plan, approved by the owner on 2026-11-10 with all six answers kept (no DDTC email domain yet: Resend's test sender on staging). Also the owner requests of 2026-11-11: announcements (`docs/requests/2026-11-11-announcements.md`) and the dashboard welcome with red idle borders (`docs/requests/2026-11-11-dashboard-intro-and-idle-border.md`). Decisions recorded as ADR-019.

## 1. What was built

| Build item | Where |
|---|---|
| Notifications for every D21 event, the examination events, extensions, announcements and administrator alerts; one per event (D31) | Migration 38 `20261111000100_notifications.sql`: triggers on assignments, examinations, enrolments, courses and both extension tables; `private.notify`; `private.alert_admins` |
| Email deliveries with the D31 retry schedule | `notification_deliveries` (queued by a trigger; SUPPRESSED when the person turned email off); `notification_deliveries_claim` (leased for 15 minutes) and `notification_delivery_result` (1, 5, 15, 60, 240 minutes, then FAILED with an alert; permanent failures FAILED at once); Edge Function `send-notification-email` through Resend (`_shared/email.ts`), every minute by `pg_cron` |
| Reminders 24 hours before each learner's own deadline, unsubmitted work only, fired once, replaced on change | `notification_reminders` and `private.schedule_reminders()` every 15 minutes (`reminder:{item}:{learner}:{effective_due_at}`); also raises file-cleanup alerts (Phase 8) |
| The notification centre and the email switch | The header `NotificationBell` (unread count, "New notification arrives" toast with Open; grade notices stay with `GradeNotices`); `NotificationsPage` for every role (newest first, unread marked, Mark all read, Show more, "Email me about my courses") |
| Dashboards | Migration 40 `20261111000300_dashboards.sql` (`admin_dashboard`, `lecturer_dashboard`, `learner_dashboard`); `DashboardPanels.jsx` |
| Reports (D42) and their audited downloads | Migration 39 `report_enrolment`, `report_activity`, `report_completion`, `report_grades` (released grades through `course_grade_summary`); migration 41 `report_export_record`; `ReportsPage` (filters by course, branch and dates; table and phone cards; Download CSV) |
| Audit log viewer with an audited CSV export (owner answer 6) | Migration 39 `audit_log_search`, `audit_log_actions`, `audit_log_export`; `AuditLogsPage` |
| Settings: every editable value checked and audited, including "Count missing work as 0" (D11) and the idle limits (D43) | Migration 39 `system_settings_values_check` (pass mark, minimum class size, files per answer, grade scale, chart bands, file limits); `SettingsPage` |
| Announcements (owner request 2026-11-11) | Migration 42 `20261111000500_announcements.sql` (`announcements`, `announcement_send`, `announcement_archive`; emailed like the other events); `AnnouncementsPage` for lecturers and administrators; `CourseAnnouncements` on the learner's course page; toast "Announcement sent" |
| Dashboard welcome; red borders on the idle warning and the sign-in inactivity notice (owner requests 2026-11-11) | `RoleIntro.jsx` below each dashboard's statistic cards; `IdleWarningDialog` and the Sign In notice use a 2 px border in the error colour |

Docs: ADR-019, the phase file, PHASES (Step 10.3 ticked; owner requests), DATA_MODEL, SECURITY_AND_ACCESS section 8, ARCHITECTURE, DESIGN, RUNBOOK "Written in Phase 11", UI_FEEDBACK (one toast), and the two request files.

## 2. Tests

| Suite | Result |
|---|---|
| Lint, type check, secret scan, dependency audit, build | Pass (2026-11-11) |
| Unit (Vitest) | 41 files, **530 passed**. New: `notifications.test.jsx` 6, `admin-insight.test.jsx` 10, `announcements.test.jsx` 3, `email.test.js` 6, `role-intro.test.jsx` 3; `idle.test.jsx` and `auth-pages.test.jsx` check the red borders |
| Database (pgTAP) | 33 files, **1,312 passed**. New: 29 notifications, email retries and reminders (48), 30 settings, audit viewer and reports (31), 31 dashboards (12), 32 announcements (20) |
| Edge Functions (HTTP) | 11 files, **117 passed** (new: `notifications.test.js` 2). One earlier full run had a single failure in a courses import test that passed when rerun alone and with its whole file; the final full run was clean |
| End to end, local | `notifications.spec.js` (3 tests) on all 24 device projects, light and dark: **72 passed**, run before the welcome card and red borders were added; unit tests cover those. The first run found the email-switch race (section 4), which was then fixed. CI runs every spec on every project |
| Lighthouse (mobile) | Not passing locally on this machine: performance 0.65 to 0.84, against 0.80. The variation is in Total Blocking Time (610 ms on one run, 4.6 to 5 s on the others). `main` without Phase 11 scored 0.71, 0.66 and 0.96 on the same machine, so the low scores come from the machine, not this change. CI's Lighthouse result is the record for this gate |

Earlier tests changed because new events also notify learners: pgTAP 20, 23 and 25 counted every notification of a learner. They now count only the grade notifications they check. No check was removed.

## 3. Exit gate and required tests

| Item | Result |
|---|---|
| Due-date reminder fires once, 24 hours before the effective due date | **Pass.** pgTAP 29 checks five things. The reminder waits while the deadline is more than 24 hours away (fire time = deadline minus 24 hours). Moving the deadline cancels it and makes a new one. An extension replaces it with the learner's own deadline in the key. Within 24 hours it fires. Running the scheduler twice more does not fire it again. |
| Notifications reach only their recipient | **Pass.** pgTAP 29: each event reaches the right learners and lecturers only (withdrawn learners, other courses and the lecturer are excluded); a learner reads only their own and may set `read_at` only. pgTAP 32: announcements reach only their audience. |
| Retry schedule 1, 5, 15, 60, 240 minutes then FAILED with an alert; permanent failures not retried | **Pass.** pgTAP 29 checks each wait, FAILED after the last, the alert to administrators only, and a permanent failure FAILED after one attempt. |
| Duplicate events create one notification | **Pass.** pgTAP 29: publishing again does not notify twice; reminders fire once. |
| Changing a deadline or extension replaces the pending reminder | **Pass.** pgTAP 29. |
| The audit viewer is administrator-only | **Pass.** pgTAP 30: lecturers and administrators without two-step verification are refused, and the export is audited. |
| Changing a setting takes effect and is audited | **Pass.** pgTAP 30: the idle limit changes `idle_settings()`; old and new values are audited; out-of-range values are refused. The e2e test changes a setting and finds it in the audit logs. |

## 4. Found by the tests (fixed)

- The first run on every device project found that turning off "Email me about my courses" and reloading at once could lose the change (desktop Firefox, iPhone SE, iPad). The switch now waits for the save and says "Saved".
- `learner_dashboard` reused one person's temporary list for the next caller within a transaction; it is now emptied on every call (pgTAP 31 caught it).
- The screenshot review found the learner's statistic cards split around the welcome card; they are now one row with the welcome directly below.

## 5. Screenshots

`docs/acceptance/phase-11/screens/`, 60 images at 375, 768 and 1280 px in light and dark:
- `learner-dashboard`, `learner-notifications`, `learner-course-announcements`;
- `lecturer-dashboard`, `lecturer-announcements`;
- `admin-dashboard`, `admin-settings`, `admin-audit-logs`, `admin-reports`, `admin-announcements`.

Each was captured with a check for sideways scrolling and console errors: none found.

## 6. Owner steps (staging)

1. `npx supabase db push --linked` (migrations `20261111000100` to `20261111000500`).
2. Deploy the Edge Function `send-notification-email` (`npx supabase functions deploy send-notification-email`).
3. Create a Resend account (free tier) and an API key, then run `npx supabase secrets set RESEND_API_KEY=<key> APP_URL=<preview or staging address> --project-ref <ref>`. Leave `EMAIL_FROM` unset: Resend's test sender only delivers to the Resend account owner's own address.
4. The Vault secrets from Phase 4 (`project_url`, `service_role_key`) already exist; the two new jobs use them.

## 7. Known issues and deferred items

- **Email to real learners needs a verified domain** (owner answer 5). Until then, staging email reaches only the Resend account owner's own address. Owner: Prince Boateng; before Phase 14.
- **Reminders run as a database function, not an Edge Function.** BUILD_PLAN section 8 names a `schedule-reminders` Edge Function; it is a database function because it calls no outside service (ADR-019). The behaviour and schedule are the same.
- **Live presence** is Step 11.1, as planned.
