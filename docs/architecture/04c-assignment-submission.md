# 4c. Workflow: assignment submission

Source: D10, D11, D13, D24 and BUILD_PLAN Phase 8. Lateness and due dates are decided by server time only.

```mermaid
sequenceDiagram
  autonumber
  actor Lrn as Learner
  participant FE as Frontend
  participant UP as Upload pipeline (4b)
  participant EF as Edge Function submit-assignment
  participant DB as PostgreSQL

  Lrn->>FE: choose response: text, recorded audio, uploaded audio, PDF or Word
  opt files (max 5 per version)
    FE->>UP: register, upload, finalize each file
    UP-->>FE: VALIDATED file ids (REJECTED shows reason)
  end
  FE->>EF: submit(assignment id, text, file ids)
  EF->>DB: enrolment ACTIVE? assignment published? course not archived?
  EF->>DB: effective due = extension.extended_due_at or assignments.due_at
  alt now <= effective due and status is not GRADED
    EF->>DB: new submission_versions row (is_late = false), status SUBMITTED
  else now > effective due and (allow_late or extension)
    EF->>DB: new version with is_late = true (flagged, never auto-penalised)
  else blocked
    EF-->>FE: refused with reason
  end
  EF->>DB: link submission_files, audit
  EF-->>FE: "Submission received"
```

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SUBMITTED : submit-assignment (version 1)
  SUBMITTED --> SUBMITTED : resubmit before due date (new version, old kept)
  SUBMITTED --> GRADED : lecturer saves grade
  GRADED --> REOPENED : lecturer reopens (audited, grade history)
  REOPENED --> SUBMITTED : learner resubmits
  REOPENED --> GRADED : lecturer re-grades
```

Missing work never creates a submission row (D11); it is derived at read time by `calculate_course_grades`.
