# Owner request (2026-11-10): practical marks entered by the lecturer, and learners grouped by branch

Status: **recorded; the three questions answered by the owner on 2026-11-10; to be planned with the examinations phase** (`2026-11-10-examinations.md`), because
practicals are part (B) of the course grade the owner set the same day: weekly assignments 40%, Local
Assembly practicals 30%, final examinations 30%. Received while Phase 10 was waiting for CI.

## The request, verbatim

"create a feature where the lecturer can insert the marks of all leaners (manually) for teh local
assembly practicals. again the admin and lecturer should be able to have their leaners grouped based on
their branches."

## As understood (proposal, to confirm in the plan)

1. **Practical marks entered by hand.** A Local Assembly practical is done in person at the learner's
   local assembly, so learners send nothing in the app. The course's lecturers (and AAL2
   administrators) open the practical and see every learner of the course in one list, each with a
   mark box (0 to the practical's maximum, up to two decimals) and an optional comment. They type the
   marks for everyone, save them as drafts, and release them (Review and release, as built in Phase 10).
   - The marks go through the same grading records as assignments: they enter the grade history, are
     audited, and count in the course grade only once released (D16, D30).
   - Proposal: a practical is an assignment in the "Local Assembly practicals" category marked "marked
     in person" (no learner answer), so the gradebook, statistics, charts, exports and release need no
     second system.
   - ~~Evidence~~ **Answered by the owner on 2026-11-10: marks only.** Learners upload nothing for a practical.
2. **Learners grouped by branch.** On the lists where lecturers and administrators see learners (the
   practical mark sheet, the gradebook, an assignment's results, the course's Learners tab, To grade),
   a "Group by branch" choice shows the learners under branch headings (D42), with "No branch" last
   and a count per branch.
   - Proposal: the branch filter that already exists stays.
   - ~~Default~~ **Answered by the owner on 2026-11-10: yes, grouped automatically.** These lists open grouped by branch, and grouping can be switched off.
   - ~~Exports~~ **Answered by the owner on 2026-11-10: yes.** Exports keep the Branch column, sorted by branch.
