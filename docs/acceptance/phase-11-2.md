# Step 11.2 acceptance evidence: examination types, and one type per section

- Request: the owner, 2026-11-11: "the lecturer should be the one to choose the mode of exams, whether MCQs, Short answers or Essay... each section of the exams too should have it own mode of exams." Clarified the same day: the lecturer chooses before writing the questions, and may choose all three types, two, or one. Plan approved the same day with three recommendations. Decision record: ADR-021. Request file: `docs/requests/2026-11-11-examination-types.md`.
- Branch: `step-11-2-exam-modes`.
- Reviewer (O2): Prince Boateng.

## 1. What changed

- **Examination editor, Details:** a "Types of question" group of three checkboxes (Multiple choice, Short answer, Essay). None is ticked on a new examination, and Create refuses until at least one is.
- **Examination editor, sections:**
  - each section has a "Type of question" select listing only the chosen types;
  - one Add button per section, named for its type; the per-question type buttons are gone;
  - the select is fixed once the section has questions (remove them to change it);
  - a new section starts with a type not used yet, when there is one.
- **Examinations set before this step** keep all three types and their sections. A section that mixes types shows a note with **Split into sections**, and the questions cannot be saved until it is split. Nothing is split automatically.
- **Changing the types:** allowed until a learner starts. Taking off a type that still has sections is refused ("Remove the essay sections first"). Nothing is deleted.
- **Learner's examination page:** each section shows its type and number of questions under its title.
- **Database (migration 46, `20261111000900_exam_modes.sql`):** `examinations.modes`, `exam_sections.mode`; `exam_save` and `exam_structure_save` replaced. Who may set an examination is unchanged.
- **Edge Function:** `manage-examinations` takes `modes` on the details and `mode` on each section.
- No new toasts or floating action buttons.

Also in this branch, owed from Step 11.1 (`main` only takes changes through a pull request): Step 11.1 ticked in `docs/PHASES.md`; the final CI run recorded in `docs/acceptance/phase-11-1.md`; migrations 44 and 45 described in `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md`.

## 2. Tests

The database tests were written first and seen to fail without the migration ("column modes does not exist", 0 of 22 run), then pass with it.

| Suite | Local result (2026-11-12) |
|---|---|
| Lint, type check, secret scan (536 files), dependency audit (nothing high), build | Pass |
| Unit | 43 files, **550 passed** (new: a new examination needs a type; one type per section and only that kind is added; an older mixed section is split before saving; a section whose type is no longer included is refused) |
| Database (pgTAP) | 37 files, **1,389 passed** (new file 36, 22 tests: no type, an unknown type and a type twice refused; another course's lecturer and a learner refused; a mixed section and a type not chosen refused; a type with sections cannot be taken off; types locked once a learner starts; earlier sections left as they are) |
| Edge Functions | `examinations.test.js` **11 of 11** (new: the chosen types are kept; a mixed section, a type not chosen and taking off a used type are refused; another lecturer is refused). The first run had 10 of 11: the CSV export test, which this step did not change, got a 503 from the local function runner (the 2.8 GB Docker limit noted in the Step 11.1 evidence); it passed on the next run. |
| End to end, local | `examinations.spec.js`, both tests, on desktop Chrome (light) and iPhone SE (dark): **4 passed**. The editor test now ticks the types, checks that Short answer is not offered, and adds the essay in its own section; the learner test checks "Essay · 1 question". |
| End to end on every device project, light and dark; Lighthouse; gitleaks | CI on the pull request |

Four older database test files (26, 27, 28, 35) set up one section holding two or three kinds of question. Their setup now uses one section per kind, as the rule requires; what each file tests is unchanged.

## 3. Screenshots

`docs/acceptance/phase-11-2/screens/`, 30 images at 375, 768 and 1280 px in light and dark:

- `lecturer-exam-new-choose-types` (a new examination, nothing ticked, "Choose at least one type of question");
- `lecturer-exam-types` (Multiple choice and Essay ticked);
- `lecturer-exam-section-type` (a section's Type of question, fixed while it has questions);
- `lecturer-exam-mixed-section` (an older mixed section with Split into sections);
- `learner-exam-section-type` (the section's type under its title).

Captured with a check for sideways scrolling and console errors. None from the app; one capture round logged the browser's own "no buffer space" network error, which is the development machine running out of sockets (noted in `playwright.config.js`), and its images are complete.

## 4. Owner steps (staging)

1. `npx supabase db push --linked` (migration `20261111000900_exam_modes.sql`, after the three from Step 11.1 if those are not pushed yet).
2. Deploy the Edge Function `manage-examinations`.
3. On the preview, as a lecturer: start a new examination, tick two types, check the third is not offered in a section, and add a section of each type. Then open an examination made before today and check it still opens.

## 5. Manual and real-device checks

- Not yet done by anyone: the editor's checkboxes and the section select on a real phone. The automated runs cover iPhone SE and the other device projects.
