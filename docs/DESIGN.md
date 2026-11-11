---
version: 3.0
name: DDTC Design System
description: Official design system for the DDTC Learning Management System. Navy-and-blue brand palette with a separately defined dark theme, Inter on every device, Lucide icons, Apple-inspired polish, Mobbin as a reference library, WCAG 2.1 AA.

colors:
  brand: { primary: "#2563EB", navy: "#0F172A", slate: "#64748B", surface: "#F1F5F9", success: "#0F766E", warning: "#D97706", error: "#DC2626" }
  light:
    page: "#f8fafc"
    sidebar: "#ffffff"
    card: "#ffffff"
    fill: "#f1f5f9"
    hairline: "#e2e8f0"
    control-border: "#7a8aa0"
    text-primary: "#0f172a"
    text-secondary: "#475569"
    text-tertiary: "#5b6b80"
    primary: "#2563eb"
    on-primary: "#ffffff"
    link: "#2563eb"
    success: "#0f766e"
    warning-text: "#b45309"
    error: "#dc2626"
    chart-bar: "#64748b"
  dark:
    page: "#0a1428"
    sidebar: "#08122a"
    card: "#0f1d3a"
    fill: "#172a52"
    hairline: "#1f3566"
    control-border: "#6f84a8"
    text-primary: "#f1f5f9"
    text-secondary: "#cbd5e1"
    text-tertiary: "#94a3b8"
    primary: "#2563eb"
    on-primary: "#ffffff"
    link: "#60a5fa"
    success: "#2dd4bf"
    warning-text: "#fbbf24"
    error: "#f87171"
    chart-bar: "#94a3b8"

typography:
  font-stack: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  large-title: { size: 34px, line: 41px, weight: 700, tracking: "-0.022em" }
  title-1: { size: 28px, line: 34px, weight: 700, tracking: "-0.02em" }
  title-2: { size: 22px, line: 28px, weight: 600, tracking: "-0.016em" }
  title-3: { size: 20px, line: 25px, weight: 600, tracking: "-0.012em" }
  headline: { size: 17px, line: 22px, weight: 600, tracking: "-0.008em" }
  body: { size: 16px, line: 24px, weight: 400, tracking: "0" }
  body-sm: { size: 14px, line: 20px, weight: 400, tracking: "0" }
  label: { size: 14px, line: 18px, weight: 500, tracking: "0" }
  caption: { size: 12px, line: 16px, weight: 500, tracking: "0.01em" }
  reading: { size: 18px, line: 30px, weight: 400, max-width: 68ch }

rounded: { xs: 8px, sm: 12px, md: 16px, lg: 24px, full: 9999px }
spacing: { 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px, 10: 40px, 12: 48px, 16: 64px }
motion: { fast: 120ms, base: 200ms, sheet: 320ms, ease: "cubic-bezier(0.2, 0, 0, 1)", ease-sheet: "cubic-bezier(0.32, 0.72, 0, 1)" }
icons: { library: lucide-react, size: 20px, size-nav: 24px, size-inline: 16px, stroke: 1.75 }
touch: { min-target: 44px, fab: 56px }
---

# DDTC Design System

## 1. Purpose and status

This is the official design reference for the DDTC LMS (version 3.0). It replaces `DESIGN-mobbin.md` and design file v2. Claude Code reads it before building or changing any screen. The clickable prototype in `docs/prototype/` (trial logins in its README) is the visual reference for layouts, flows and feel; this file is the rulebook.

**Order of authority:** accessibility and readability, then this file, then the prototype, then Mobbin references, then taste.

**Product feel:** modern, calm and very clean. Navy and blue on soft slate surfaces, lots of space, large readable type, one confident blue, almost no decoration.

## 2. Design principles

1. **Clarity first.** Every screen has one obvious purpose and one obvious next action. Text is legible, icons are understood, and nothing important depends on colour alone.
2. **Content over chrome.** The interface defers to lessons, audio, assignments and grades. Chrome uses quiet greys; the content gets the space.
3. **Depth through fill, not effects.** Hierarchy comes from surface tints, hairlines, spacing and size. A soft shadow is allowed only on overlays (toasts, dialogs, sheets, the floating action button).
4. **Consistency.** The same action looks and behaves the same on every screen and for every role. Components are reused, never rebuilt.
5. **Generous touch and space.** 44 px minimum targets, an 8 px base rhythm, comfortable line lengths and breathing room on small screens.
6. **Polish with restraint.** Short, purposeful motion, continuous rounded corners and tidy alignment. No gradients, no parallax, no decorative blobs, no animation for its own sake.
7. **Readability over style.** When a stylish option and a readable option disagree, choose readable.
8. **Equal light and dark.** Both themes are first-class and pass the same contrast tests.
9. **Tokens, not values.** Components use design tokens only. No hard-coded colours, sizes or radii inside components.

## 3. How references are used

**Mobbin** is a library of proven product flows. Use it to learn how good products arrange sign-in, onboarding, dashboards, lists, course and lesson pages, forms, settings, empty states and feedback, and to avoid reinventing standard patterns.
- Before designing a screen, the owner picks 2 or 3 Mobbin references of the same flow type and saves a short note (what to borrow and why) in `docs/references/<screen>.md`. Claude Code cannot browse Mobbin, so it works from those notes and any images placed in that folder.
- Borrow patterns (structure, order, interaction), not pixels. Never copy another product's logo, illustrations, copy, exact layout or brand look. Adapt every borrowed pattern to the DDTC tokens in this file.
- Marketing patterns in `DESIGN-mobbin.md` (pricing tiers, testimonials, FAQ marquees, award lockups, hero marquees) are not used. There is no marketing homepage.

**Apple-inspired principles** guide polish, typography, spacing and interaction quality: clear hierarchy, large titles that collapse on scroll, inset grouped lists for settings, bottom sheets for secondary tasks, segmented controls for view switches, translucent bars used sparingly, smooth sheet motion and generous whitespace.
- Use the principles only. Do not use Apple's colours (the DDTC palette and the blue in this file are our own), Apple logos, SF Symbols or Apple trademarks.

## 4. Brand and logos

**Official DDTC LMS logo** (`assets/brand/logo-ddtc-white.png`, `logo-ddtc-navy.png`): a circular emblem showing a figure above a house. It is supplied as white line art on transparent; the navy copy is generated from it.
**Logo of gölarae** (`assets/brand/logo-golarae.png`, `logo-golarae-white.png`): a stylised G with a sun and a wave, supplied as a stippled grey drawing on transparent; the white copy is a solid silhouette for dark surfaces.

**One `LogoMark` component** renders any logo through its alpha channel as a CSS mask over a token colour: navy `#0F172A` on light surfaces and white on dark. Logos are never stretched, rotated, outlined, given effects, recoloured outside navy or white, or placed on busy images. The one owner-approved exception (ADR-012): on Sign In, Sign Up and two-step verification a light travels round the circle of the DDTC emblem (a separate decorative ring laid over the emblem's circle; the emblem itself is unchanged; never the favicon, the app icons or the in-app logos). Clear space around a logo is a quarter of its height. Minimum size 32 px for the DDTC emblem and 28 px for the gölarae logo.

| Where | Treatment |
|---|---|
| Auth hero (Sign In, Sign Up and every other account page) | DDTC emblem 120 px (phone 72 px), navy on light, white on dark, fading in once (800 ms) when the page opens, with the name DYNAMIC DISCIPLESHIP TRAINING CENTRE (HOJ) in bold (lines balanced) and directly beneath it, at every width, the tagline "Di nokware kosi owu mu, na wobenya nkwa abotiri - Adiyisɛm 2:10b" (Revelation 2:10b in Twi, marked `lang="tw"`). On Sign In, Sign Up and two-step verification a light travels round the emblem's circle (owner, Phase 3; ADR-004; ADR-012) |
| Sidebar and top bar | DDTC emblem 28 to 32 px with "DDTC LMS" beside it on desktop; in the phone top bar the emblem with the short name **DDTC** in bold beside it (owner change 2026-11-06; the page title is not repeated there) |
| **Brand block** | Directly below the whole Sign In and Sign Up form (including the Google button), centred: the gölarae logo (36 px tall), then directly beneath it the exact text `from gölarae` (13 px, weight 500, `text-secondary`), nothing between them. Never "powered by gölarae". |
| **Copyright line** | Sign In and Sign Up only, well below the brand block (48 px more space than the gap above it), centred, caption size, `text-tertiary`: "© YEAR Dynamic Discipleship Training Centre (HOJ). All rights reserved." with this year in Ghana time (owner request 2026-11-07, ADR-012). |
| App icon, PWA, apple-touch | White DDTC emblem on a `#0F172A` tile (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon-180`) |
| Favicon | `favicon-32` and `favicon-48` are generated; the thin lines are hard to read at 32 px, so a simplified mark should replace them once supplied or approved |

## 5. Colour

### 5.1 Brand palette

Primary blue #2563EB, navy #0F172A, slate #64748B, surface #F1F5F9, success #0F766E, warning #D97706, error #DC2626. Neutrals are the slate ladder. #D97706 is used for warning icons and fills only; warning text uses #B45309 (light) or #FBBF24 (dark) because #D97706 on white is only 3.2:1.

### 5.2 Semantic tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| page | #f8fafc | #0a1428 | Page background |
| sidebar | #ffffff | #08122a | Sidebar |
| card | #ffffff | #0f1d3a | Cards, dialogs, sheets, inputs |
| fill | #f1f5f9 | #172a52 | Hover, chips, segmented track, icon tiles |
| hairline | #e2e8f0 | #1f3566 | Dividers and card borders |
| control-border | #7a8aa0 | #6f84a8 | Input, checkbox, switch boundaries |
| text-primary | #0f172a | #f1f5f9 | Headings and body |
| text-secondary | #475569 | #cbd5e1 | Supporting text |
| text-tertiary | #5b6b80 | #94a3b8 | Hints and metadata |
| primary | #2563eb | #2563eb | Primary buttons, selected states |
| on-primary | #ffffff | #ffffff | Text on primary |
| link and focus | #2563eb | #60a5fa | Links, focus ring, active nav, unread dot |
| success | #0f766e | #2dd4bf | Success icon and text |
| warning | #b45309 | #fbbf24 | Warning icon and text |
| error | #dc2626 | #f87171 | Error icon, text, destructive |
| chart-bar | #64748b | #94a3b8 | Distribution bars; the learner's own band uses the link colour |

Status tints (chips, toasts) are the status colour at 12% over `card`, via `color-mix`, so they follow the theme. The dark theme is defined separately, not an inversion of the light theme.

### 5.3 Rules

- Primary actions are blue pills with white text. Navy is for headings, the logo and dark surfaces.
- Every status shows an icon and a text label as well as colour.
- No gradients except the very soft hero tint on the auth screen and the course cover placeholder.
- Never use `hairline` as text colour. Never use `text-tertiary` for body text.

### 5.4 Contrast results (WCAG 2.1 AA)

| Pair | Ratio | Result |
|---|---|---|
| Light: text-primary on page and card | 17.1 | Pass (4.5:1) |
| Light: text-primary on card | 17.9 | Pass (4.5:1) |
| Light: text-secondary on page and card | 7.2 | Pass (4.5:1) |
| Light: text-secondary on card | 7.6 | Pass (4.5:1) |
| Light: text-tertiary on page and card | 5.2 | Pass (4.5:1) |
| Light: text-tertiary on card | 5.4 | Pass (4.5:1) |
| Light: link on card | 5.2 | Pass (4.5:1) |
| Light: success text on card | 5.5 | Pass (4.5:1) |
| Light: warning text on card | 5.0 | Pass (4.5:1) |
| Light: error text on card | 4.8 | Pass (4.5:1) |
| Light: form border on card | 3.5 | Pass (3:1) |
| Light: chart bar on card | 4.8 | Pass (3:1) |
| Dark: text-primary on page and card | 16.8 | Pass (4.5:1) |
| Dark: text-primary on card | 15.2 | Pass (4.5:1) |
| Dark: text-secondary on page and card | 12.4 | Pass (4.5:1) |
| Dark: text-secondary on card | 11.3 | Pass (4.5:1) |
| Dark: text-tertiary on page and card | 7.2 | Pass (4.5:1) |
| Dark: text-tertiary on card | 6.5 | Pass (4.5:1) |
| Dark: link on card | 6.6 | Pass (4.5:1) |
| Dark: success text on card | 9.0 | Pass (4.5:1) |
| Dark: warning text on card | 10.0 | Pass (4.5:1) |
| Dark: error text on card | 6.0 | Pass (4.5:1) |
| Dark: form border on card | 4.4 | Pass (3:1) |
| Dark: chart bar on card | 6.5 | Pass (3:1) |
| Light: white text on primary button #2563EB | 5.2 | Pass (4.5:1) |
| Light: white text on error button | 4.8 | Pass (4.5:1) |

A unit test recomputes these ratios from the token file and fails the build if any pair drops below its threshold.

## 6. Light and dark modes

- Three settings in Profile Settings: Light, Dark, System. Default is System (`prefers-color-scheme`). The choice is stored in the browser (localStorage, guarded) and applied before the first paint with a tiny inline script, so there is no flash of the wrong theme.
- Tailwind uses class-based dark mode (`.dark` on the root). All colours come from CSS variables, so components need no per-theme code.
- The `theme-color` meta tag and the `color-scheme` property follow the active theme.
- Elevation in dark mode uses lighter fills (canvas, then surface, then surface-soft) and hairlines; overlay shadows are darker. Images and the logo are never inverted; the logo mask takes its colour from the token.
- Both themes are tested: every Playwright visual and axe test runs in light and dark.

## 7. Typography

**Font:** Inter, self-hosted as a variable font (subset to Latin, `font-display: swap`), on every device including iPhone and Mac, for consistency across iOS, Android and Windows. Fallback: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Saans is not used (commercial licence); it can replace Inter later if a web licence is bought.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| large-title | 34 / 41 | 700 | Phone and tablet page titles |
| title-1 | 28 / 34 | 700 | Desktop page titles, auth heading |
| title-2 | 22 / 28 | 600 | Section headings |
| title-3 | 20 / 25 | 600 | Card and dialog titles |
| headline | 17 / 22 | 600 | List and course titles |
| body | 16 / 24 | 400 | Default text; inputs always 16 px or larger |
| body-sm | 14 / 20 | 400 | Table cells, metadata |
| label | 14 / 18 | 500 | Buttons, labels, chips |
| caption | 12 / 16 | 500 | Timestamps, helper text; the brand line is 13 px |
| reading | 18 / 30 | 400 | Lesson text; 68 characters per line at most |

Sizes in `rem`; sentence case; left-aligned except short headings and auth blocks; tabular figures in tables; no text under 12 px.

## 8. Layout, spacing, shape and depth

- **Grid:** 4 px base, 8 px rhythm. Page padding 16 px on phones, 24 px on tablets, 32 px on desktop. Content is capped at 1280 px; reading content at 68 characters.
- **Breakpoints:** phone below 640 px, tablet 640 to 1023 px, desktop 1024 px and above (the same as the build plan; the Mobbin breakpoints are not used).
- **Radius:** inputs 12, small cards and list groups 16, cards, dialogs and sheets 24, buttons and chips fully rounded (pill). Squircle-style continuous corners where the platform allows.
- **Lists:** inset grouped lists (rounded group, hairline dividers, 56 px rows) for settings and menus.
- **Elevation:** flat (hairline), raised (surface on canvas), overlay (toast, dialog, sheet, FAB, with the overlay shadow). No other shadows.
- **Materials:** the floating tab bar, top bar and sheet headers may use a translucent blur (`backdrop-filter: blur(20px)` over `canvas` at 80% opacity) with a hairline. Provide a solid fallback and turn blur off when the user prefers reduced transparency or the browser lacks support. Never put blur behind body text.

## 9. Motion

- Durations: 120 ms for press and hover, 200 ms for fades and expands, 320 ms for sheets and drawers. Standard easing is `cubic-bezier(0.2, 0, 0, 1)`; sheets use `cubic-bezier(0.32, 0.72, 0, 1)`.
- Allowed: route fade, sheet slide, toast slide and fade, FAB hide and show, speed-dial expand, accordion expand, button press scale to 0.98, skeleton shimmer.
- Not allowed: parallax, looping decorative animation, autoplaying media, bouncing, animated gradients, long staggered entrances.
- Owner-approved exceptions (ADR-004, ADR-012): the DDTC emblem on the auth hero fades in once over 800 ms; the Sign In, Sign Up and two-step verification cards carry a light that travels round their edge (`glow-edge` and `glow-ring`, 6 s per lap, `glow` token, soft static halo; only a transform animates, so nothing is repainted per frame); on those three pages the same light travels round the emblem's circle (`logo-glow`, `logo-glow-ring` and `logo-glow-arc`, a 3 px band over the circle's stroke with the same halo). Under reduced motion the lights stay still; in forced-colours mode the rings are removed.
- ADR-006: the recorder's pulsing red dot and scrolling live waveform are functional recording indicators and may loop while recording; under reduced motion the dot is still and the waveform updates without scrolling animation.
- Reduced motion (`prefers-reduced-motion`): remove shimmer (static grey), replace slides and scales with a simple fade, and never auto-scroll.

## 10. Icons (Lucide React)

- Use `lucide-react` only. Size 20 px by default, 24 px in navigation, 16 px inline with text; stroke width 1.75; colour inherits the text token.
- Icons support text and never replace it in navigation, buttons or status. Icon-only buttons need an accessible name and a 44 px target.
- Decorative icons are `aria-hidden`. Check each icon name against the installed Lucide version (some names have been renamed; aliases usually exist).

| Concept | Lucide icon |
|---|---|
| Dashboard | LayoutDashboard |
| Users, learners | Users |
| Courses | BookOpen |
| Lessons | GraduationCap or ListOrdered |
| Assignments | ClipboardList |
| Grades, gradebook | ClipboardCheck |
| Analytics, charts | ChartColumn (BarChart3 alias) |
| Notifications | Bell |
| Settings | Settings |
| Audit log | ScrollText |
| Search, filter | Search, SlidersHorizontal |
| Add, create | Plus |
| Play, pause | Play, Pause |
| Download, upload | Download, Upload |
| Record | Mic |
| Document | FileText |
| Success | CircleCheck |
| Warning | TriangleAlert |
| Error | CircleX |
| Information | Info |
| More menu | Ellipsis |
| Back, forward | ChevronLeft, ChevronRight |
| Sign out | LogOut |
| Security, MFA | ShieldCheck |
| Theme | Sun, Moon, Monitor |

## 11. Components

Every component is built once under `src/components/ui/` on shadcn/ui with these tokens, then reused. No screen defines its own button, input, card or dialog.

| Component | Specification |
|---|---|
| Button, primary | `primary` blue fill, white text, pill, 44 px high (48 px for auth forms), label style; hover brightens slightly; press scale 0.98; loading shows an inline spinner and keeps its width |
| Button, secondary | `fill` background, `text-primary` text, pill |
| Button, outline | transparent, 1px `border-soft` (`control-border` where it is the only cue), pill |
| Button, ghost | no fill, `text-primary`, hover `surface-soft` |
| Button, destructive | `error` fill with white text (light) or dark text (dark), pill, always confirmed by a dialog |
| Text input | `card` fill, 1px `control-border`, 12 px radius, 48 px high, 16 px text, visible label above, helper or error text below; focus: 2 px `link` ring with 2 px offset; error: 2 px `error` border plus message with icon |
| Select, textarea, search | Same chrome as the text input; search has a leading Search icon and a clear button |
| Branch picker (D42, ADR-010) | The Branch drop-down (Profile settings, the administrator's user panel) is the phone's own picker below 640 px (`NativeSelect`: field chrome, 48 px, 16 px text, chevron) and the shadcn Select from tablet width up; label above, placeholder "Select your branch" ("No branch" for administrators), a field-shaped skeleton while the list loads, and "The branches could not be loaded." with Retry. Branch filters on lists match the list's other filters. |
| Checkbox, radio, switch | 24 px control, `control-border` outline, `primary` when on, 44 px hit area |
| Card | `surface`, 1px `hairline`, 24 px radius, 16 to 24 px padding; interactive cards add a hover fill and a visible focus ring |
| Inset list row | 56 px, leading icon or avatar, title, secondary line, trailing chevron or value |
| Tabs, segmented control | Track `surface-soft`, selected pill `surface` with `text-primary`; scrollable on phones |
| Navigation | Phone: floating pill with three destination icons and a permanent More button; icons only, the active item expands to show its name (see 12.4); More opens a bottom sheet. Tablet: collapsible side rail. Desktop: sidebar with the DDTC emblem, blue-tinted active item, theme switch at the bottom |
| Page header | Large title on phones, title-1 on desktop, optional breadcrumb, actions on the right on desktop |
| Chip and status badge | Pill, label style, status tint background, icon plus text, never colour alone |
| Branch chip (D42, ADR-010) | Pill on `fill`, label style: the Lucide MapPin icon with the branch name (never the icon alone; screen readers hear "Branch:" first); "No branch" in `text-secondary` when unset. A column from 640 px; on phone cards it sits in the chip row under the name. Fits at 320 px (the name truncates). |
| Avatar | `UserAvatar`: image, else initials, else generic icon; sizes 24, 32, 40, 56, 96; circle; initials in `text-primary` on `surface-soft` |
| Dialog and bottom sheet | `surface`, 24 px radius, overlay shadow, scrim; sheets slide from the bottom on phones with a grab handle; focus trapped; Escape closes |
| Table | Header `caption` on `surface-soft`, 48 px rows, hairline dividers, sticky header; becomes stacked cards on phones |
| Empty state | `surface-soft` frame, Lucide icon, one-line title, one sentence, one primary action |
| Error state | Icon, plain explanation, Retry button |
| Banner | Full-width strip with icon and text for offline mode and the in-app browser notice; dismissible when not critical |
| Toast | See 12.1 |
| Floating action button | See 12.2 |
| Skeleton | See 12.3 |

## 12. Feedback components

The full catalogue of toasts, floating action buttons and skeleton screens is in the build plan (Section 16) and the architecture file. This section sets how they look.

### 12.1 Toast

`surface` fill, 1px `hairline`, 16 px radius, overlay shadow, 12 by 16 px padding, `body-sm` text, a 20 px status icon in the status colour, optional text button (Undo, Retry, Open, View) in `link` colour, and a close button. Phones: full width minus 16 px, above the tab bar and any FAB; desktop: top right, 360 px wide. Slide and fade in 200 ms. Announced in an `aria-live="polite"` region (errors use `assertive`).

### 12.2 Floating action button

56 px circle, `primary` fill, `on-primary` Plus icon (24 px), overlay shadow, 16 px from the right edge and above the tab bar and safe area. Visible below 1024 px only. Speed dial items are 44 px pills with a label, over a scrim. Hides on scroll down and while the keyboard is open.

### 12.3 Skeleton

Base `skeleton-base`, shimmer highlight `skeleton-shine`, 1.4 s linear sweep, radius matching the real element (circle for avatars, 12 px for lines and fields, 24 px for cards). Matches the final layout so nothing shifts. Static grey under reduced motion. Appears after 150 ms and stays at least 300 ms.

### 12.4 Phone navigation effect

The phone bar is a floating pill (blurred `card` at 85%, hairline border, overlay shadow, 16 px from the edges and above the safe area) with four items: three destinations and a permanent **More**.

- **Icons only.** Each item is a 48 px round target with a 22 px Lucide icon in `text-secondary`. No names are shown on inactive items.
- **Active item morph.** The active item expands into a capsule filled with `link` at 8% over `card` (token `--capsule-tint`; 14% left the link-coloured label at 4.24:1 in light mode, below WCAG AA, so it was lowered in Phase 1 under the accessibility-first order of authority and is covered by the contrast unit test); its icon turns `link` and its name fades in beside the icon (13 px, weight 600). When the user taps another item, the old capsule collapses while the new one expands in the same 320 ms with the sheet easing curve (`cubic-bezier(0.32, 0.72, 0, 1)`); the icon scales 1.08 on press.
- **More** is always the last item. It highlights (with its name) while the sheet is open or when the current page lives under it. It opens a bottom sheet listing every other destination and Sign out.
- **Accessibility.** Every item has an accessible name and `aria-current="page"` when active; the bar is a `nav` landmark; targets are at least 44 px; under reduced motion the change is instant with no scaling.
- **Per role.** Administrator: Dashboard, Users, Courses. Lecturer: Dashboard, My Courses, To grade. Learner: Dashboard, My Courses, Assignments.

## 13. Data and media components

- **Course card:** cover image (16:9, 24 px radius, grey placeholder), title (headline), lecturer, lesson count, progress bar for learners. One tap target.
- **Lesson page:** large title, reading-width text, full-width audio player, Previous and Next at the bottom, completion button reachable with a thumb.
- **Audio player (ADR-006):** a waveform of 3 px bars with 2 px gaps and rounded ends (about 48 bars on phones, 120 on desktop) from 128 stored peaks; played bars `wave-played`, unplayed `wave-unplayed`, a 2 px `wave-playhead` line with 8 px round handles. Tap to seek, drag to scrub with a small time bubble. 56 px play and pause, back and forward 15 s, current time left and remaining time right, speed chip (0.75x to 2x), Download with file size. Sizes: compact (one row, lists), standard (lesson page), full (grading). States: loading (skeleton bars), ready, playing, paused, buffering, error with Retry, offline. Slider role with spoken time; arrow keys seek 5 s; 44 px targets; never colour alone; reduced motion removes bar animation.
- **Recorder (ADR-006, built in Phase 8):** large Mic button with the 10 minute and 25 MB limits; while recording a right-to-left live waveform in `wave-recording`, a pulsing red dot, a large timer, a thin time-left bar, Pause and Resume, a 72 px red Stop and Discard; the screen is kept awake; "We can’t hear you. Check your microphone." after 5 s of silence. Review: the same waveform with Play preview, Re-record and Use recording. Several recordings per submission, each within the limits, at most 5 files per version. Clear permission-denied state with an upload fallback.
- **Upload row:** icon, filename, size, progress bar (`link`), status chip (Checking, Ready, Rejected with reason), cancel or retry.
- **Recorder as built (Phase 8):** MediaRecorder in the first format the browser offers (MP4 with AAC, then WebM or Ogg with Opus) at 64 kbit/s; the 72 px red Mic and Stop buttons; a 64-bar live waveform in `wave-recording`; the time-left bar and "N:NN left"; Pause also happens by itself when the app is left ("Recording paused because you left the app"), and Resume keeps what was recorded if the phone cut the microphone meanwhile; Wake Lock while recording; the recording is kept on the device as a draft (IndexedDB, 24 hours) and restored with "Draft restored". Answers: 10 minutes and 25 MB; lesson audio (lecturers, ADR-007): 30 minutes.
- **Answer form (Phase 8, ADR-013):** Write, Record and Upload tabs (the segmented control) add parts to one answer: a plain-text answer with a character count (20,000) and up to 5 files listed as upload rows; a warning banner when the answer will be late; Submit ("Submit again" for a resubmission) in the sticky action bar with a one-line summary of what will be sent. Below it, every version sent (newest open), each with its time, contents, Late and Replaced chips, text, compact players and Download for documents.
- **Submission list (Phase 8):** the results-table pattern: learner (avatar and name), ID number, branch chip (D42), status chips (Not submitted, Submitted, Graded, Reopened; Late), latest version and time, effective due date ("extended"), View answer and Extension; cards on phones. The extension dialog takes a date and time in Ghana time and an optional reason; Take back extension when one stands.
- **Gradebook:** desktop matrix with sticky header and sticky first column (avatar and name); phone shows one card per learner with an expandable assignment list. Score cells show the score, maximum and percentage; status chips show Graded, Submitted, Missing or Late. Overall grade shows "Provisional" or "Final".
- **Results table:** search, filter chips, sort menu; cards on phones with avatar, name, status chip and score.
- **Score distribution chart:** responsive bars in `chart-bar`, the learner's own band in `chart-bar-own` with a "Your score" label, counts above each bar, horizontal axis "Percentage scored", vertical axis "Number of learners", gridlines in `hairline`, a text summary below. On narrow screens the labels shorten (for example "0-49") and never overlap. Tap a bar to see its value. Charts support light and dark themes through tokens only.
- **Grade history:** a vertical timeline with who, when, old and new values.
- **Grading screen as built (Phase 9, ADR-014):** the learner header (photo, name, ID number, branch chip, D42); on phones the answer comes first and the grading panel after it, with Save draft and Release grade in a bar that sticks above the phone navigation; from tablet width two panes (`grid-cols-grading`: the answer, and an 18 to 24 rem panel that stays in view). The panel: a state chip (Ungraded, Draft grade, Released, Changed, not released, Reopened), Marks out of the maximum with up to two decimals (checked before sending), plain-text Feedback with a 10,000-character count, the saved score with its percentage, letter grade and band as the database computed them, what the learner sees, a required Reason when a released grade changes, and Reopen grade (a dialog with a required reason). The grade history sits under the panel, collapsed behind "Grade history: N entries": each entry says what happened (Graded 15, Changed 15.5 to 17, Released 17, Reopened), who, when (Ghana time) and why.
- **Results as built (Phase 9):** the submission list grows into the results table: six count tiles (Enrolled, Submitted, Graded with how many released, Ungraded, Missing, Not yet due; two per row on phones, three on tablets, six on wide screens), search by name or ID number, Show, Branch and Sort filters (in a bottom sheet on phones), result chips (Graded, Ungraded, Missing, Not yet due; Late; Withdrawn), score with percentage and letter grade and a grade-state chip, Grade (the primary button for an answer waiting) or View answer, Extension, and Release grades (N) after a confirmation.
- **Learner's grade as built (Phase 9):** a card first on the assignment page once released: score out of the maximum in the large title style, percentage, a Grade chip (green when passed), the band, the feedback and when it was released; Updated after a changed grade is released. "New grade available" with View on the next page load (once per tab).
- **To grade and Grades and feedback (Step 9.1):** To grade lists the answers waiting for the lecturer, oldest first (learner cell with branch chip, assignment and course code, time sent, Reopened and Late, Grade), a course filter with more than one course, and Draft grades not released per assignment (Open to release); the lecturer dashboard's To grade tile opens it. Grades and feedback groups the learner's answered assignments by course: score out of the maximum, percentage, a Grade chip, the feedback (three lines), band and release date, or Awaiting grade. Course covers everywhere use `CourseCover`: a clipped 16:9 frame with the photo cropped inside, whatever its shape.
- **Gradebook as built (Phase 10, ADR-015):** each course has its own gradebook. Staff: the workspace's Gradebook tab, with a summary line (learners, assignments, drafts not released), Review and release (N) and Export. From tablet width it is a matrix in its own frame (`max-h-gradebook`) that scrolls both ways, with a sticky learner column (photo, name, ID number, branch chip) and a sticky header row (title, "out of N · category"). On phones there is one card per learner with the overall grade and its status, and the assignments behind "Assignments (N)". Each cell shows the score out of the maximum, plus a chip for Draft, Ungraded, Missing, Counted as 0, Not yet due or Late; a released score has no chip. "What the states mean" explains them. The Analytics tab has one card per assignment: six class figures (class average, highest, lowest, graded, ungraded, missing), the distribution chart and Export report. Gradebooks (lecturer) and Gradebook oversight (administrator) list published and archived courses with Open gradebook, plus Export with course, assignment and format pickers. Learner: Grades and feedback shows course cards (current, then completed) with the course grade, its status and "N of M assignments graded". Each card opens the course's page: the Course grade card (large title, band, status, what Provisional means, categories with their weights), the assignments (score, %, status with letter grade, Late, feedback) and "How the class scored" (charts only once the class reaches `min_class_size`, own band highlighted). The learner's course page links to it with My grades. Locked weights carry a Locked chip; the administrator's dialog adds Reason and Preview the effect (overall grades that would change, "current → new").
- **Examinations, practicals and branch groups as built (Phase 10.1, ADR-016):**
  - **Parts of the course grade:** the Assignments tab's card lists Weekly assignments, Local Assembly practicals ("marked in person") and Final examinations with their weights. It is read-only for lecturers. Administrators get Change weights (three weight boxes, Reason, Preview the effect) or, on an older course, Switch to the three parts.
  - **Practical mark sheet:** the practical's Submissions page becomes "Marks: title". It shows the summary ("N of M marked · K not released"), the Group by branch switch, branch sections with counts, and a row per learner with a status chip (Not marked, Draft grade, Released, Changed), "Mark out of N" and "Comment (optional)". Save marks (N) sends only the changed rows; a reason box appears when a released mark changes. Release marks (N) asks for confirmation. On phones the action bar sticks above the navigation.
  - **Examinations tab:** a list of exams with Opens and Closes (Ghana time), a status chip (Draft, Published and opens later, Open, Closed, Archived), Results, and New examination. There is no new floating action button.
  - **Exam editor:** a Details card (title, description, instructions, pass mark %, Opens, Closes); "Sections and questions" with a Total N marks chip, each question showing its kind; multiple choice has four options with a radio for the correct one; short answer and essay have "Expected answer or marking guide (only lecturers see it)"; plus Marks, Add multiple choice / short answer / essay, Add section and Save questions. A "Publishing and deadline" card holds Preview (a dialog of what learners see), Publish or Unpublish, Archive or Restore, and the new deadline with reason, Change deadline and Close now. Once a learner starts, the details and questions are read-only.
  - **Results:** Release results (N), Export, and the Group by branch switch, then a table per branch: Learner, Status chips (Not started, In progress, Submitted, Not submitted; To mark, Partly marked, Marked; Released or Changed, not released), Submitted, Multiple choice, Short answer, Essay, Total ("15 / 20" over "75% · Pass"), and Mark. It shows as cards up to 1024 px.
  - **Script:** a summary card (status chips and "total / max · % · Pass or Fail"). Each multiple-choice question shows options with Chosen and Correct answer chips and "Marked automatically: N of M". Each short answer or essay shows the text, the recording player, the marking guide (collapsed), "Mark out of N", Feedback and Save mark. Then Overall feedback (Save feedback, Release result) and Authorise retake (a dialog with Reason and the learner's new deadline). A reason box appears once a result is released.
  - **Learner's exam:**
    - A facts card: state chip, Opens, Submit by (Ghana time), total marks, pass mark, and "There is no time limit. Work at your own pace and submit before the deadline." **There is no countdown anywhere.**
    - Before starting: the instructions, then Start examination (Start your retake for a retake).
    - While answering: instructions (collapsed); a polite live saving indicator ("Saving…", "All answers saved at 14:02", or the offline message); sections as tabs; answer cards (A to D radios; "Your answer" or "Your essay" text; then, since Step 10.3 (ADR-018), three actions: Record your answer (outline button with a 2 px border in the error colour and a red Mic icon), Upload an audio file and Upload a PDF or Word file, with a one-line hint of the accepted formats; an attached audio answer shows its player with Remove audio answer, and an attached document its name with Open and Remove document); a sticky bar with "N of M answered", Previous and Next section, and Review and submit, which opens a confirmation listing each question as answered or not.
    - Afterwards: the Submitted or Not submitted message, the result card (score, %, letter, Pass or Not passed, feedback, release date) and each answer with its mark and feedback.
  - **Dashboards:** the learner dashboard's Examinations list (title, course, "Submit by …" or "Opens …", a state chip). The lecturer dashboard and To grade show "Examination scripts" ("N to mark", "N to release").
  - **Branch groups:** the gradebook matrix has a heading row per branch, and phones show sections. Assignment results, the Learners tab and To grade get the same switch.
- **Letter grades as built (Step 10.2, ADR-017):** single pieces of work show score, percentage and band only (no "Grade B" chip, no "· B"); the course grade carries the letter, and a course grade tag (a status chip, success when Final, warning when provisional) sits on each learner My Courses card and under the course page title.

## 14. Responsive behaviour

The full rules are in the build plan (Section 15). In summary: design at 375 px first; no horizontal page scroll from 320 to 1920 px; phone uses the floating tab bar, cards, bottom sheets and a single column; tablet adds a side rail and two columns; desktop uses the sidebar, tables and two-pane grading. Inputs are 16 px so iPhone does not zoom, the keyboard never hides the focused field, and iPhone safe areas are respected. Every screen, including gradebooks and charts, has a defined phone layout.

## 15. Accessibility

- WCAG 2.1 AA in both themes; contrast thresholds in 5.4 are enforced by tests.
- Visible focus ring on every interactive element (2 px, `focus-ring`, 2 px offset); logical focus order; full keyboard operation; no keyboard traps.
- Touch targets at least 44 by 44 px with 8 px spacing.
- Forms: visible labels, errors tied to fields with `aria-describedby`, required fields marked in text.
- Screen readers: landmarks, headings in order, `aria-live` for toasts, `aria-busy` for loading, chart text summaries, meaningful alt text for covers and avatars.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-color-scheme` and browser text zoom; support forced-colors mode with visible borders.
- Test with axe (both themes), VoiceOver on iPhone and TalkBack on Android before launch.

## 16. Voice and content

Plain, warm and respectful. Short sentences in sentence case. Say what happened and what to do next ("The file is too large. Choose one under 25 MB."). No exclamation marks, no jargon, no blame. Use "Lessons", "Courses" and "Assignments" exactly; never "modules" or "terms". Dates and times display in Africa/Accra.

## 17. Implementation rules for Claude Code

- Put tokens in `src/styles/tokens.css` as CSS variables for `:root` and `.dark`; map them to Tailwind utilities with Tailwind 4's `@theme` in `src/styles/index.css` (Tailwind 4 has no `tailwind.config.js`; Phase 1 plan, decision 3); configure shadcn variables from them (see 18). Tailwind's default colours, font sizes, radii and shadows are removed, so only DDTC tokens exist.
- Components use Tailwind classes that reference semantic tokens (`bg-page`, `bg-card`, `bg-fill`, `border-hairline`, `border-control`, `text-link`), never raw hex values. Text colours are named `ink` because Tailwind's `text-primary` would mean the primary blue: `text-ink` (text-primary token), `text-ink-secondary`, `text-ink-tertiary`. Type styles are `text-large-title` to `text-caption`. The lint rule `ddtc/no-hard-coded-design-values` fails the build on hard-coded colours, sizes or radii in `src/components` and `src/pages`.
- Build in this order: tokens, theme provider and script, `LogoMark`, `UserAvatar`, buttons, inputs, cards, lists, navigation shells, toasts, skeletons, FAB, dialogs and sheets, table-to-cards, charts, audio player, recorder, upload row.
- A hidden `/dev/design` page (development and staging only) shows every component in light and dark on phone, tablet and desktop widths for review.
- Unit tests: token contrast ratios, theme switching, `LogoMark` colours, `UserAvatar`, toast, skeleton and FAB rules. Playwright: visual snapshots at 375, 768 and 1280 px in light and dark, plus axe.

## 18. CSS variable starter (shadcn mapping)

```
:root {
  --background: #f8fafc;      --foreground: #0f172a;
  --card: #ffffff;            --card-foreground: #0f172a;
  --popover: #ffffff;         --popover-foreground: #0f172a;
  --primary: #2563eb;         --primary-foreground: #ffffff;
  --secondary: #f1f5f9;       --secondary-foreground: #0f172a;
  --muted: #f1f5f9;           --muted-foreground: #475569;
  --accent: #f1f5f9;          --accent-foreground: #0f172a;
  --destructive: #dc2626;     --destructive-foreground: #ffffff;
  --border: #e2e8f0;          --input: #7a8aa0;      --ring: #2563eb;
  --sidebar: #ffffff;         --link: #2563eb;
  --success: #0f766e;         --warning: #b45309;    --info: #2563eb;
  --text-tertiary: #5b6b80;   --chart-bar: #64748b;  --chart-own: #2563eb;
  --skeleton-base: #f1f5f9;   --skeleton-shine: #e2e8f0;
  --radius: 12px;
}
.dark {
  --background: #0a1428;      --foreground: #f1f5f9;
  --card: #0f1d3a;            --card-foreground: #f1f5f9;
  --popover: #0f1d3a;         --popover-foreground: #f1f5f9;
  --primary: #2563eb;         --primary-foreground: #ffffff;
  --secondary: #172a52;       --secondary-foreground: #f1f5f9;
  --muted: #172a52;           --muted-foreground: #cbd5e1;
  --accent: #172a52;          --accent-foreground: #f1f5f9;
  --destructive: #f87171;     --destructive-foreground: #0a1428;
  --border: #1f3566;          --input: #6f84a8;      --ring: #60a5fa;
  --sidebar: #08122a;         --link: #60a5fa;
  --success: #2dd4bf;         --warning: #fbbf24;    --info: #60a5fa;
  --text-tertiary: #94a3b8;   --chart-bar: #94a3b8;  --chart-own: #60a5fa;
  --skeleton-base: #172a52;   --skeleton-shine: #1f3566;
}
```

shadcn's `--accent` is a subtle hover fill, not the brand blue; the brand blue is `--primary`, `--link` and `--ring`.

## 19. Do and don't

**Do:** blue pill buttons for the main action; navy for headings and logo; tokens, Lucide icons and shared components everywhere; icon plus text for every status; test every screen in light and dark at 375, 768 and 1280 px; keep motion short.

**Don't:** use gradients, glow (the only exceptions are the travelling light on the Sign In, Sign Up and two-step verification cards and round the emblem's circle on those pages, ADR-004 and ADR-012), heavy shadows or glass over text; copy Mobbin screens, other brands' assets or Apple's colours and symbols; use `hairline` or `text-tertiary` as body text colour; use colour as the only signal; create one-off components or hard-coded values; use text under 12 px, inputs under 16 px or targets under 44 px; recolour or alter the logos; write "modules", "terms" or "powered by gölarae".

## 21. Sign In and Sign Up screens (layout)

- **Desktop:** two panels. Left: hero with the DDTC emblem, full name and tagline on a very soft tint. Right: form card (max 400 px) with a moving edge glow (ADR-004) and, in order: title, subtitle, fields, error message area, the main button (blue pill, 48 px), an "or" divider, the **Continue with Google** button, the switch link ("Don't have an account? Sign up"), then the brand block (gölarae logo and "from gölarae"), then the trial-logins card only in the prototype.
- **Phone:** one column; the hero shrinks (72 px emblem) but keeps the bold name with the tagline beneath it, as on every auth page, verification pages included; the form fills the width; the brand block stays directly below the form.
- **Continue with Google:** follows Google's identity branding guidelines: the official multi-colour G mark (never recoloured), the label "Continue with Google", Roboto Medium 14 px label colour per Google's guidance, height 48 px, pill or 12 px radius, light variant (white fill, 1px neutral border, dark text) in light mode and dark variant (dark fill, light text) in dark mode. It is full width and never styled as a primary button.
- Sign Up adds first name and second name fields above email; both are required. A **Complete your profile** screen (same card style) asks for missing names after a Google sign-up.
- Errors appear inline under the form in the error colour with an icon; they never reveal whether an email exists. Loading uses an inline spinner in the button.
- The Google button is hidden for administrator and lecturer sign-in (they use email and password) only by policy text, not by role detection; the refusal happens server-side (D27).

## 22. Assumptions awaiting your confirmation

1. The palette hex codes were read from the style-guide image; confirm each.
2. Control borders (#7a8aa0) are slightly stronger than the softest slate so fields meet 3:1.
3. A simplified favicon mark (supplied or approved).
4. The Google button uses Google's official light and dark variants at 48 px height.
5. Theme choice is stored in the browser, not on the profile.
