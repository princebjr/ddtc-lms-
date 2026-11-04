# DDTC LMS: Responsive and device support standard

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## 15. Responsive and device support standard

This section applies to every screen in every phase. A screen is not finished until it passes the checklist at the end.

### 15.1 Breakpoints and layout

| Class | Width | Layout |
|---|---|---|
| Phone | below 640 px | One column. Floating pill bar with three destination icons plus More (D40); the active item shows its name. Top bar with page title and avatar menu. Forms and filters in full-screen sheets or bottom sheets. |
| Tablet | 640 to 1023 px | One or two columns. Collapsible side rail. Tables allowed when all columns fit; otherwise cards. |
| Desktop | 1024 px and above | Persistent sidebar, multi-column content, full tables, two-pane grading. Content width capped at 1280 px for reading. |

- Tailwind default breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280) are used. Styles are written mobile-first, then enlarged.
- Minimum supported width is 320 px. Portrait and landscape both work; rotating must not lose form input or interrupt audio playback.
- Use relative units (`rem`, `%`, `dvh`). Never use `100vh` for full-height layouts; use `100dvh`. Respect safe areas with `env(safe-area-inset-*)` for notches, rounded corners and the home indicator, especially for the bottom tab bar and sticky action bars.
- Browser text zoom to 200% and page reflow at 320 px wide must not break any screen.

### 15.2 Screen patterns

| Screen | Phone | Tablet and desktop |
|---|---|---|
| Sign In, Sign Up, recovery | Single column, full-width buttons, brand line directly below the form | Centred card, same order, brand line directly below the form |
| Dashboards | Stacked summary cards, horizontal quick actions | Grid of cards, side-by-side panels |
| Lists and tables (users, courses, results, enrolments) | Stacked cards showing avatar, name, status and the key value; search and filters in a bottom sheet; 20 items per page | Full table with sortable columns, inline filters |
| Course workspace tabs | Horizontally scrollable tab bar or a select menu | Full tab bar |
| Lesson page | Content first, full-width audio player, Previous and Next at the bottom, completion button reachable with one thumb | Content with side panel for progress and lesson list |
| Assignment submission | One step at a time: instructions, response type, preview, submit; sticky Submit bar | Single page with all steps visible |
| Grading screen | Submission above, grading panel below, sticky Save and Release bar | Two panes: submission left, marks and feedback right |
| Gradebook | Per-learner card view with an expandable assignment list | Scrollable matrix with sticky learner column and header row |
| Charts | Full-width, labels shortened or rotated without overlap, tap to show a value, text summary always visible | Wider chart with all labels and the same text summary |
| Dialogs and forms | Full-screen sheets, one column, 16 px inputs | Centred dialogs, two columns where it helps |
| Notifications | List of cards, swipe-free (buttons only) | List with side detail |

### 15.3 Touch, forms and keyboard

- Every tappable element is at least 44 by 44 px with 8 px spacing. No feature depends on hover, double-tap, swipe-only or drag-only actions.
- All text inputs use at least 16 px text so iOS Safari does not zoom. Use the correct `type`, `inputmode` and `autocomplete` values. Labels are always visible; placeholders are never the only label.
- The on-screen keyboard must never hide the focused field, an error message or the submit button; the page scrolls to keep them visible.
- Disable a submit button only while a request is in flight, and show progress. Never lose typed input on error, rotation or a dropped connection.

### 15.4 Audio, recording, files and downloads

- Player: full width, play and pause, touch-draggable seek bar, current time and duration, speed 0.75x to 2x, Media Session metadata for lock-screen controls, no autoplay, `preload` limited to metadata. Audio keeps playing when the screen locks and survives rotation.
- Download shows the file size first and behaves correctly on iPhone (saves to Files) and Android. A failed download shows a clear retry message.
- Recording: needs HTTPS and a user tap; keep the screen awake where supported; warn that backgrounding stops recording; preview before submit; fall back to file upload if the microphone is denied or unsupported. Safari and Chrome record in different formats and both must play back on every device.
- Uploads show progress, resume after a network change or app suspension, and work from the phone's file picker, Files app and voice recordings.
- PDFs and Word files open in a new tab or download; they are never forced inline in a way that traps the user.

### 15.5 Performance and low bandwidth

- Budgets measured with Lighthouse mobile preset and a throttled mid-range Android profile: Sign In and learner dashboard LCP at or below 2.5 s, CLS at or below 0.1, INP at or below 200 ms, initial JavaScript for the Sign In route at or below 200 KB gzipped. Lighthouse performance score at least 80 and accessibility at least 95 on Sign In, learner dashboard, lesson page, assignment page and gradebook.
- Code-split by route; lazy-load charts and the rich-text editor; serve images as WebP with `srcset` and lazy loading; avatar images are small thumbnails; paginate every list.
- Show an offline banner when the connection drops and retry safely. The service worker caches the app shell only; private data and files are never cached by it.
- Never download audio automatically; the learner chooses to stream or save it.
- Respect `prefers-reduced-motion`. Colour contrast meets WCAG 2.1 AA, and information is never conveyed by colour alone.

### 15.6 In-app browsers

Links opened inside WhatsApp, Facebook, Instagram or TikTok browsers often block microphone access, downloads and sign-in (Google refuses to sign in inside them). The app detects these and shows a clear banner with instructions to open the page in Safari or Chrome. The banner never blocks the page.

### 15.7 Test matrix

Automated (Playwright and CI):

| Project | Engine | Viewport |
|---|---|---|
| Desktop Chrome | Chromium | 1280 by 720 |
| Desktop Firefox | Firefox | 1280 by 720 |
| Desktop Safari | WebKit | 1280 by 720 |
| Laptop and Full HD | Chromium | 1440 by 900 and 1920 by 1080 |
| iPhone SE | WebKit | 375 by 667 |
| iPhone 15 | WebKit | 393 by 852 |
| Small Android | Chromium | 360 by 640 |
| Pixel 7 | Chromium | 412 by 915 |
| iPad (gen 7) | WebKit | 810 by 1080, portrait and landscape |
| Minimum width | Chromium | 320 by 568 |

Playwright WebKit and device emulation do not replace real devices. Audio, recording, downloads, sign-up and the on-screen keyboard are verified manually on real hardware.

Real devices before launch (record device, OS and browser version for each):

- An iPhone on iOS 18 Safari (primary) and an iPhone on iOS 17 Safari.
- An iPad on Safari, portrait and landscape.
- A mid-range Android phone on Chrome.
- A Windows laptop on Chrome and Edge, and a Mac on Safari.
- At least one test on a slow or throttled mobile connection.

### 15.8 Per-screen checklist (definition of done)

1. No horizontal page scrolling from 320 to 1920 px, in portrait and landscape.
2. Touch targets are at least 44 by 44 px; inputs are 16 px or larger.
3. The keyboard never hides the focused field or the main action.
4. Tables become cards on phones; wide data scrolls only inside its own container.
5. Safe areas and `dvh` are respected on iPhone.
6. Loading, empty, error and offline states exist and fit the screen.
7. Keyboard navigation and VoiceOver or TalkBack work; focus order is logical; contrast meets AA.
8. The screen meets the performance budget in 15.5.
9. Playwright passes on every device project, with a screenshot saved for 375, 768 and 1280 px.
10. Loading shows the matching skeleton from the Section 16 skeleton table, with the 150 ms and 300 ms timing and no layout shift above 0.1.
11. Every action listed in the Section 16 toast catalogue shows its toast, and no unlisted toast exists.
12. A floating action button appears only where the Section 16 FAB table lists it, and only below 1024 px.
