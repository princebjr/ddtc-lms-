# Owner request: in-app Help & Support centre (received 2026-11-13, during Phase 15)

**Status:** built in Phase 15 (ADR-027).

The owner's words: "Create an In-App Help Centre on the dashboard of every learner and lecturer. Imagine a learner or lecturer logging in for the first time. They see a Help & Support section on their dashboard. When they open it, they find: Getting Started. How to Use DDTC. Frequently Asked Questions. Contact Support."

**Owner answers (2026-11-13):**
1. **Contact Support** shows a DDTC support email and a phone/WhatsApp number. Tapping them opens the mail, phone or WhatsApp app; nothing is sent through DDTC LMS itself. The two values are settings administrators change on Settings (they take effect at once, ADR-020 item 7). Until they are set, the section says to ask a lecturer or an administrator.
2. **The help text** (Getting Started, How to Use, FAQ) is drafted by development from how the app works, separately for learners and lecturers, and approved by the owner in the pull request.
3. **Learners and lecturers only;** administrators keep the runbook. Can be extended later.

**Still needed from the owner:** the support email address and the phone/WhatsApp number to set on staging and production.
