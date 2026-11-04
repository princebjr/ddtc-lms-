# 4e. Workflow: learner-audio retention

Source: D20, D25, D33 and BUILD_PLAN Phase 12. `retention_enabled` = false at launch; dry run for the first 30 days; only an administrator can enable live deletion.

```mermaid
flowchart TD
  CRON["pg_cron daily"] --> RR["Edge Function retention-runner"]
  RR --> EN{"retention_enabled?"}
  EN -->|false| DRY["mode DRY_RUN"]
  EN -->|true| LIVE["mode LIVE"]
  DRY & LIVE --> SEL["Select candidates"]
  SEL --> E1{"submission_files.file_role = AUDIO?"}
  E1 -->|no: text, PDF, Word, lesson audio,<br/>instruction audio, attachments| SKIP["never touched"]
  E1 -->|yes| E2{"file_objects.status = VALIDATED?"}
  E2 -->|no| SKIP
  E2 -->|yes| E3{"grade RELEASED and<br/>released_at older than retention_days (default 180)?"}
  E3 -->|no| SKIP
  E3 -->|yes| E4{"active retention_hold on<br/>submission, learner or course?"}
  E4 -->|yes| SKIP
  E4 -->|no| ELIG["eligible"]
  ELIG -->|DRY_RUN| REP["count only; change nothing"]
  ELIG -->|LIVE| DEL["delete one object by exact stored path"]
  DEL -->|ok| OK["file_objects.status = DELETED, deleted_at"]
  DEL -->|error| FAIL["status = DELETE_FAILED; retried next run"]
  REP & OK & FAIL --> RUN["retention_runs row (counts, details) + audit_logs"]
```

Submission, grade, feedback and history rows always remain. Staging tests set `retention_days` to 0 with seeded fixtures; production stays at 180 unless DDTC approves a change.
