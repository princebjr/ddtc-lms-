# 4d. Workflow: grading, release and recalculation

Source: D11, D12, D13, D14, D15, D16, D30, D35 and BUILD_PLAN Phases 9 and 10. Nothing is stored as an aggregate; `calculate_course_grades` is the only place grade formulas exist.

```mermaid
sequenceDiagram
  autonumber
  actor Lec as Lecturer (course lecturer)
  participant FE as Frontend
  participant DB as PostgreSQL
  participant RG as Edge Function release-grades
  actor Lrn as Learner

  Lec->>FE: enter score and feedback
  FE->>DB: update submissions (RLS: course lecturer; trigger checks 0 <= score <= max_marks)
  Note over DB: grade_release_status stays DRAFT; learner cannot read it
  Lec->>FE: Release (one submission or whole assignment)
  FE->>RG: release-grades (user JWT)
  RG->>DB: re-check course lecturer rights; category weights total 100 (then locked)
  RG->>DB: grade_release_status = RELEASED, released_at = now()
  RG->>DB: notifications + notification_deliveries + audit_logs
  DB-->>Lrn: in-app and email "grade released"
  opt later change to a released grade
    Lec->>DB: update score or feedback
    DB->>DB: trigger writes grade_change_history (immutable) + audit + learner notification
  end
```

## Calculation on read (D13)

```mermaid
flowchart TD
  REQ["Any screen or export asks for grades"] --> F["calculate_course_grades(course)<br/>SQL, read-only, idempotent"]
  F --> Q{"For each learner and assignment:<br/>does it count?"}
  Q -->|"released graded submission<br/>(any due date)"| C1["counts: score / max_marks"]
  Q -->|"missing_as_zero AND published AND<br/>effective due passed AND no submitted version"| C2["counts as 0 of max_marks<br/>label: Counted as 0"]
  Q -->|"otherwise: future, ungraded, draft grade,<br/>unpublished without released grade"| C3["excluded<br/>(Missing shown if past due)"]
  C1 & C2 --> CAT["category % = sum earned / sum max x 100"]
  CAT --> OV["overall = sum(cat % x weight) / sum(weights of categories with a counted item)"]
  OV --> R["round half up to 1 decimal; band A-F (D14);<br/>Final or Provisional; 'Not yet available' if nothing counted"]
  F --> CH["distribution chart counts (D15)<br/>released graded only; learners see it only from min_class_size"]
```
