# Owner requests: dashboard introduction and red idle borders (2026-11-11)

**Requests (Prince Boateng, during Phase 11):**

1. A personalised welcome and introduction on each role's dashboard, directly below the statistic cards, showing only the signed-in role's text (administrator: managing users, overseeing courses, monitoring activity, academic records, the smooth running of the institution; lecturer: creating courses, lessons and audio teachings, publishing assignments and examinations, grading and feedback, following progress; learner: courses, lessons, audio teachings, assignments, examinations, results and progress). Responsive, light and dark, no duplicated objects.
2. The idle sign-out warning gets a clearly visible red border around the whole dialog, in light and dark; message, countdown, timing and sign-out unchanged; no new notifications.
3. The sign-in page notice "You were signed out after N minutes of inactivity" also gets a red border.

## As built (Phase 11, ADR-019 item 10)

`RoleIntro.jsx` on the three dashboards; `IdleWarningDialog` and the sign-in notice use a 2 px border in the error colour token. Unit tests: `role-intro.test.jsx`, `idle.test.jsx`, `auth-pages.test.jsx`.
