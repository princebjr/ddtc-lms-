# Owner request (2026-11-06): live presence and assignment performance reports

Status: **recorded, not yet scheduled** (question 2 answered; 1, 3, 4 and 5 open). Received during Phase 6. Nothing is built until the owner
answers the open questions below and approves where it goes (an ADR in `docs/DECISIONS.md` when it
is scheduled, as for any change to the build plan).

## Where it will be built

| Feature (as understood) | Phase | Why there |
|---|---|---|
| **Assignment performance reports**, generated and exported by lecturers (own courses) and administrators (all courses) | **Phase 10** (Gradebook, distribution charts and exports) | Needs assignments (Phase 7), submissions (Phase 8) and released grades (Phase 9). Reuses the planned `export-gradebook` Edge Function and `calculate_course_grades` (grades are computed only there, CLAUDE.md section 3). |
| **Live presence directory**: who is currently active, and a count of active, visible learners and lecturers, with administrators never shown | **Phase 11** (Notifications, reports, audit viewer and settings) | It is a communication and community feature like notifications; needs owner decisions on privacy first. Uses Supabase Realtime Presence (part of the existing Supabase stack; no third-party service). |

## Open questions for the owner (to answer before scheduling)

1. **Sections 1 and 2 of the request are missing**: the pasted text starts at the end of section 2 ("The number should represent..."). Please send the full text so nothing is missed.
2. ~~Who sees whom~~ **Answered by the owner on 2026-11-06: people see only their course-mates** (the learners and lecturers who share a course with them). Administrators are never shown.
3. **Privacy (CLAUDE.md section 8: legal and privacy questions go to the owner):** may a person hide their own presence ("Appear offline")? Recommended: yes, a switch in Profile settings, and no presence history is stored.
4. **What "active" means**: signed in with the app open in a tab (Realtime Presence), dropping off within about a minute of leaving. Recommended.
5. **Report contents**: per assignment, which columns (learner, submitted on time or late, score, percentage, band, released date)? Which formats (CSV and XLSX are already planned for exports)?

## Notes from the codebase (for whoever implements it)

- Supabase Realtime is **not used yet**; local `npm run db:start` excludes it (`-x realtime,...`). Presence would enable it, with channel authorization by RLS (private channels) so roles cannot be spoofed and administrators are filtered on the server side, not only in the browser.
- Roles come only from `profiles` (D02); no client-supplied role or user id may be trusted (CLAUDE.md section 3).
- Presence must not write to the database on every heartbeat (Realtime Presence keeps state in memory).

## The request as received (verbatim)

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
