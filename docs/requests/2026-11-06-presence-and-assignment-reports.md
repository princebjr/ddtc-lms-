# Owner request (2026-11-06): live presence and assignment performance reports

Status: **recorded; the six-digit ID numbers (question 6) are built (step 6.1, ADR-008)**; the reports (Phase 10) and presence (Phase 11) are not yet scheduled in detail. Received during Phase 6. Nothing is built until the owner
answers the open questions below and approves where it goes (an ADR in `docs/DECISIONS.md` when it
is scheduled, as for any change to the build plan).

## Where it will be built

| Feature (as understood) | Phase | Why there |
|---|---|---|
| **Assignment performance reports**, generated and exported by lecturers (own courses) and administrators (all courses) | **Phase 10** (Gradebook, distribution charts and exports) | Needs assignments (Phase 7), submissions (Phase 8) and released grades (Phase 9). Reuses the planned `export-gradebook` Edge Function and `calculate_course_grades` (grades are computed only there, CLAUDE.md section 3). |
| **Live presence directory**: who is currently active, and a count of active, visible learners and lecturers, with administrators never shown | **Phase 11** (Notifications, reports, audit viewer and settings) | It is a communication and community feature like notifications; needs owner decisions on privacy first. Uses Supabase Realtime Presence (part of the existing Supabase stack; no third-party service). |

## Open questions for the owner (to answer before scheduling)

1. ~~Sections 1 and 2 missing~~ **Received 2026-11-06** (verbatim below).
2. ~~Who sees whom~~ **Answered by the owner on 2026-11-06: people see only their course-mates** (the learners and lecturers who share a course with them). Administrators are never shown.
3. ~~Privacy: may a person hide their presence?~~ **Answered by the owner on 2026-11-06: no. There is no "Appear offline" option.** (Recorded as an owner decision; no presence history is stored.)
4. ~~What "active" means~~ **Answered by the owner on 2026-11-06: people on the app at that moment are online; people not on the app are offline. No other states.** (A person leaving or losing their connection drops off within about a minute: Realtime Presence heartbeat.)
5. ~~Report contents~~ Given in section 1: name, student ID, assignment title, submission date, score, maximum, percentage, "Not Submitted" for learners without a submission, plus totals, class average, highest, lowest and submission statistics; CSV and XLSX, one export per assignment, with DDTC branding.
6. ~~Student ID~~ **Answered by the owner on 2026-11-06: every account (administrators, lecturers and learners) has a unique ID number of exactly six digits.** Proposed design, to confirm when scheduled: assigned automatically when an account is created (existing accounts get one too), never reused or changed, not editable by the person, shown on their profile, in user management and in reports; numbers 100000 to 999999 so none starts with 0. **Built as step 6.1 (ADR-008, 2026-11-07) as proposed; lecturers see the numbers of their own courses' learners.**
7. ~~Visibility scope~~ **Answered by the owner on 2026-11-06: people who are online see the course-mates and lecturers who are online at that same moment.** Read as: a learner sees online learners and lecturers who share a course with them; a lecturer sees online learners of their courses and other lecturers (section 2). Administrators are never shown or counted.

## Notes from the codebase (for whoever implements it)

- Supabase Realtime is **not used yet**; local `npm run db:start` excludes it (`-x realtime,...`). Presence would enable it, with channel authorization by RLS (private channels) so roles cannot be spoofed and administrators are filtered on the server side, not only in the browser.
- Roles come only from `profiles` (D02); no client-supplied role or user id may be trusted (CLAUDE.md section 3).
- Presence must not write to the database on every heartbeat (Realtime Presence keeps state in memory).

## The request as received (verbatim)

Sections 1 and 2 (sent separately, after the rest):

> I want to introduce two important features to the existing Dynamic Discipleship Training Centre (DDTC) Learning Management System (LMS).
>
> Please examine the existing codebase, database structure, authentication system, and application architecture before implementing anything. Maintain the existing design system, branding, functionality, and technology stack. Do not break or remove any existing features.
>
> 1. Assignment Performance Export and Reporting
>
> The system should allow lecturers and administrators to export students’ assignment performance records.
>
> Required functionality:
>
> • Lecturers and administrators should be able to view the complete list of students who have participated in a particular assignment.
> • Display each student’s name, student ID, assignment title, submission date, score, maximum possible score, and percentage.
> • Include students who have not submitted the assignment, clearly indicating their status as “Not Submitted”.
> • Allow lecturers and administrators to export the complete assignment performance records.
> • Support Excel (.xlsx) and CSV (.csv) export formats.
> • Each assignment should have its own export option.
> • Allow administrators to access performance records across all courses and lecturers.
> • Lecturers should only be able to export records for assignments and courses they are authorised to manage.
> • Include assignment totals, class averages, highest score, lowest score, and submission statistics where applicable.
>
> Export experience:
>
> Provide a clean export interface with:
>
> • Assignment selection.
> • Course selection where applicable.
> • Export format selection.
> • Download button.
>
> The exported documents should have professional formatting, clear column headings, and appropriate DDTC branding.
>
> 2. Real-Time User Presence and Activity Monitoring
>
> Introduce a real-time presence system that allows users to see other active members of the learning platform.
>
> The purpose is to make the LMS feel more interactive and connected, similar to modern collaborative learning platforms.
>
> Core requirement:
>
> Every learner and lecturer who is currently active on the application should be visible to other learners and lecturers in real time.
>
> However, administrators must be completely excluded from the visible presence list.
>
> Required functionality:
>
> 1. Display a live list of currently active learners and lecturers.
> 2. Show users who are currently logged in and actively using the application.
> 3. Update the presence list automatically without requiring users to refresh the page.
> 4. Display each person’s:
>  • Profile picture or profile initials.
>  • Full name.
>  • Role (Learner or Lecturer).
>  • Online status indicator.
> 5. Clearly distinguish active users using a green online indicator.
> 6. When a user logs out, closes the application, or becomes inactive, their status should automatically update.
> 7. Implement a heartbeat or presence mechanism to detect users who unexpectedly disconnect.
> 8. Prevent users from appearing online indefinitely after closing their browser or losing their internet connection.
>
> Visibility and privacy rules:
>
> • Learners can see active learners and lecturers.
> • Lecturers can see active learners and other lecturers.
> • Administrators must not appear in the live presence directory.
> • Administrators should not be counted or displayed as active members in the public presence list.
> • Only authenticated users should access the presence information.
> • Do not expose email addresses, passwords, private account information, or other sensitive user data.
>
> User interface:
>
> Introduce a dedicated section called “Who’s Online” or “Active Members”.
>
> It should:
>
> • Display the total number of currently active members.
> • Show active users in a clean list or compact profile layout.
> • Update automatically as people come online or go offline.
> • Work seamlessly on desktop, tablets, and mobile devices.
>
> For example:
>
> Who’s Online (12)
>
> 🟢 John Mensah — Learner
> 🟢 Grace Asante — Learner
> 🟢 Michael Ofori — Lecturer
> 🟢 Esther Boateng — Learner
>

Section 2 ends and sections 3 to 5 follow (sent first):

> The number should represent the currently active, visible learners and lecturers, excluding administrators.
>
> 3. Technical and Implementation Requirements
>
> Before implementing these features:
>
> • Inspect the existing application architecture.
> • Identify the existing authentication and role-management mechanisms.
> • Reuse the existing database and backend infrastructure.
> • If Supabase Realtime is already being used, leverage it for live presence rather than introducing an unnecessary third-party service.
> • Ensure presence updates are efficient and do not generate excessive database requests.
> • Implement appropriate cleanup for disconnected sessions.
> • Enforce role-based access control on the backend, not just in the frontend.
> • Ensure that users cannot manipulate their roles or impersonate other users.
> • Maintain compatibility with the existing light and dark themes.
>
> 4. Design and User Experience
>
> The new features must integrate naturally into the existing DDTC LMS interface.
>
> Maintain:
>
> • Existing DDTC branding.
> • Existing typography and colour system.
> • Existing navigation structure.
> • Consistent spacing, icons, buttons, and cards.
> • Responsive layouts.
> • Smooth and subtle transitions.
>
> Do not redesign the entire application.
>
> 5. Important Development Instructions
>
> • Do not duplicate existing functionality.
> • Do not introduce unnecessary dependencies.
> • Do not replace working components without a valid reason.
> • Do not modify unrelated backend functionality.
> • Maintain existing database relationships and data integrity.
> • Handle loading states, empty states, and errors properly.
> • Test all role-based permissions.
> • Test real-time updates across multiple browser sessions.
> • Verify that administrators never appear in the visible presence directory.
> • Verify that exported assignment records are accurate and complete.
>
> Expected outcome:
>
> The DDTC LMS should provide lecturers and administrators with an efficient way to generate assignment performance reports while creating a more connected learning environment where learners and lecturers can see who is currently active on the platform.
>
> Implement these features professionally, following production-level security, performance, maintainability, and user-experience standards.
