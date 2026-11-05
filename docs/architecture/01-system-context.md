# 1. System and context architecture

Source: BUILD_PLAN v1.7 Sections 2, 6, 8 and D18, D19, D22, D26, D27. The service-role key exists only inside Edge Functions (and server settings); the browser always uses the signed-in user's own session.

```mermaid
flowchart TB
  subgraph Users["Users (phone, tablet or desktop browser)"]
    L[Learner]
    T[Lecturer]
    A[Administrator]
  end

  subgraph Vercel["Vercel"]
    FE["React + Vite SPA<br/>Tailwind, shadcn/ui, React Router<br/>route guards, skeletons, toasts, FABs, PWA shell<br/>(anon key + user JWT only)"]
  end

  subgraph Supabase["Supabase project (one each: development, staging, production)"]
    AUTH["Auth<br/>email + password (all roles)<br/>Continue with Google (learners only, D27)<br/>TOTP MFA, AAL2 for ADMIN"]
    DB[("PostgreSQL<br/>RLS on every table<br/>triggers, calculate_course_grades")]
    ST[("Storage<br/>6 private buckets<br/>policies require VALIDATED file_objects")]
    EF["Edge Functions (TypeScript)<br/>service-role key lives only here<br/>re-check role, ownership, rules"]
    CRON["pg_cron<br/>email worker 1 min, reminders 15 min,<br/>cleanup hourly, retention daily"]
  end

  subgraph External["External services"]
    RS[Resend email]
    GG[Google OAuth]
    SN[Sentry]
  end

  GH["GitHub Actions CI<br/>lint, checkJs, Vitest, pgTAP, build,<br/>Playwright, Lighthouse, secret scan"]

  L & T & A -->|HTTPS| FE
  FE -->|sign in / sign up| AUTH
  FE -->|queries with user JWT| DB
  FE -->|upload to registered path,<br/>createSignedUrl with own session| ST
  FE -->|trusted calls with user JWT| EF
  FE -.->|errors| SN
  AUTH -.-> GG
  AUTH -.->|account emails| RS
  EF --> DB
  EF --> ST
  EF -->|notification email| RS
  CRON --> EF
  CRON --> DB
  GH -.->|preview deployments| Vercel
  GH -.->|migrations via Supabase CLI| Supabase
```

## Environments

```mermaid
flowchart LR
  DEV["development<br/>Supabase project ddtc-lms-dev<br/>Vercel preview deployments (pull requests)<br/>seed data only"]
  STG["staging<br/>Supabase project ddtc-lms-staging<br/>seed data only, retention_days = 0 tests"]
  PRD["production<br/>Supabase paid plan, daily backups<br/>reserved until Phase 14"]
  DEV -->|merge to main, tag| STG -->|acceptance, v1.0.0| PRD
```

Real learner data is never used in development or staging.
