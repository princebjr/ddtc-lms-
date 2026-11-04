# Phase 1: Frontend scaffold and design system

**Before you start:** read `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PHASES.md` (protocol), `docs/TESTING.md`, and for this phase `docs/DATA_MODEL.md`, `docs/SECURITY_AND_ACCESS.md`, `docs/DESIGN.md`, `docs/RESPONSIVE.md`, `docs/UI_FEEDBACK.md` and the prototype. Do not start unless the previous phase is signed off and tagged.

**Test emphasis:** Component tests for UserAvatar, toasts, skeletons, FAB; overflow and touch-target tests on every device project; contrast test from the token file.

**Regression rule:** `npm run verify` runs every earlier phase's tests as well. A failure in an earlier phase's test blocks this phase.

**Build**

- Vite + React (JavaScript), Tailwind, shadcn/ui, Lucide, React Router, Supabase client with the anon key.
- Layout shells for Administrator, Lecturer and Learner dashboards with the Section 15 navigation pattern: floating pill bar on phones (three destination icons plus More, name shown on the active item only, D40), collapsible side rail on tablets, persistent sidebar on desktop.
- Responsive foundation: Tailwind breakpoints as in Section 15, viewport meta with `viewport-fit=cover`, safe-area utilities, `100dvh` layout units, 16 px minimum input text, a `ResponsiveTable` component (table on wide screens, stacked cards on phones), a `ResponsiveChart` wrapper, and an in-app-browser notice.
- Feedback system (Section 16): toast provider (shadcn Sonner) behind a `useToast` wrapper that enforces durations, de-duplication, the maximum of 3 and Undo; `Fab` and `SpeedDial` components that appear only below 1024 px, respect safe areas, and hide on scroll and while the keyboard is open; shared skeleton components and a `useDelayedLoading` hook implementing the 150 ms and 300 ms rules.
- `UserAvatar.jsx`: uploaded image, then initials (first letter of first and second name, uppercase), then generic icon; falls back if the image fails to load.
- Brand assets and tokens: copy `assets/brand/` into `src/assets/brand/`; implement the tokens from `docs/DESIGN.md` (light and dark, Inter self-hosted), the `LogoMark` component (alpha mask, navy or white), the gölarae brand block component, the PWA icons and favicon, and the Google button component per D27.
- Error boundary, loading and empty-state components, PWA manifest with maskable icons and `apple-touch-icon`, installable shell, and an offline fallback page. The service worker caches the app shell only; it never caches API responses or private files.
- Vitest, React Testing Library and Playwright set up with the device projects listed in Section 15, plus Lighthouse CI on the mobile preset in GitHub Actions.

**Tests required**

- UserAvatar: Prince Boateng gives PB; Sarah gives S; no name gives generic icon; broken image falls back to initials.
- Playwright runs on every Section 15 device project. A no-horizontal-overflow test (document scroll width must not exceed viewport width) runs on every route at 320, 375, 768, 1024, 1280 and 1920 px, and a touch-target test confirms interactive elements are at least 44 by 44 px on phones.

**Exit gate (all must pass)**

- All layouts usable at every Section 15 width and orientation; overflow and touch-target tests green.
- Initials are computed in code, never stored.

Git tag on completion: `phase-1-done`

## Evidence to save in `docs/acceptance/phase-01.md`

- Output summary of `npm run verify` (lint, type check, unit, database, end-to-end, Lighthouse where relevant).
- The exit-gate checklist above with pass or fail for each line.
- Screenshots at 375, 768 and 1280 px in light and dark for every new or changed screen.
- Real-device notes where this phase lists them (device, OS, browser).
- Known issues and anything deferred, each with a reason and an owner.
