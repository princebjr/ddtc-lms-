# 2. Role and permission map

Source: BUILD_PLAN v1.7 Section 7 and D01, D02, D03, D05, D06, D22, D27, D28, D32, D35. Route guards only decide what the screen shows; RLS, Storage policies and Edge Functions enforce every rule below.

## How a role is obtained

```mermaid
flowchart LR
  SU["Public sign-up<br/>(email + password, or Continue with Google)"] -->|trigger always sets| LRN[LEARNER]
  IMP["bulk-import-learners<br/>(ADMIN, AAL2)"] --> LRN
  PRV["provision-lecturer<br/>(ADMIN, AAL2)"] --> LEC[LECTURER]
  BOOT["One-time bootstrap<br/>(disabled after setup)"] --> ADM[ADMIN]
  SUR["set-user-role<br/>(ADMIN, AAL2, audited)"] -->|role, can_create_courses, status| LEC
  SUR --> LRN
  SUR --> ADM
  GOOG["Google sign-in with email of an<br/>existing ADMIN or LECTURER"] -->|refused, links nothing| X((denied))
```

Account status (D03): only ACTIVE users can use the system. SUSPENDED and DEACTIVATED users are signed out, all sessions revoked, and refused at sign-in.

## What each role can do

```mermaid
flowchart TB
  subgraph ADMIN["ADMIN (TOTP MFA; every ADMIN policy requires AAL2)"]
    A1["Profiles: read all; change role/status only via set-user-role"]
    A2["Courses, enrolments, lessons, assignments, submissions: read all"]
    A3["Approve or return courses; enrol learners (single or CSV); mark COMPLETED"]
    A4["Grant/revoke can_create_courses; transfer OWNER; manage course lecturers"]
    A5["Gradebooks, charts, exports: all courses (audited)"]
    A6["Audit logs, grade history: read; system settings: read and edit"]
    A7["reset-admin-mfa for the other administrator"]
  end

  subgraph LECTURER["LECTURER (email + password only)"]
    direction TB
    subgraph OWNER["Course OWNER"]
      O1["Everything CO_LECTURER can do"]
      O2["Archive the course; add/remove co-lecturers"]
    end
    subgraph CO["Course CO_LECTURER"]
      C1["Lessons, audio, attachments: create, edit, upload, download"]
      C2["Assignments: create and manage; extensions"]
      C3["Submissions: read; grade, feedback, release, reopen"]
      C4["Gradebook, charts, exports: own courses, full detail"]
      C5["Grade history: read for own courses; settings: read non-sensitive"]
    end
    LC["can_create_courses = true: create-course (becomes OWNER)"]
    LX["Other lecturers' courses: no access"]
  end

  subgraph LEARNER["LEARNER (email + password, or Google)"]
    N1["Own profile: read and edit permitted fields"]
    N2["PUBLISHED courses with ACTIVE enrolment: lessons, VALIDATED audio, published assignments, submit"]
    N3["COMPLETED enrolment or ARCHIVED course: read-only, no new submissions"]
    N4["Own grades and feedback: RELEASED only"]
    N5["Class chart: aggregate only, from min_class_size (default 5) released results"]
    N6["WITHDRAWN or SUSPENDED enrolment, other learners' data, exports, audit: none"]
  end
```

## Enforcement layer per rule

| Rule | Enforced by |
|---|---|
| Role and status cannot be changed by the user | RLS + column privileges on `profiles`; `set-user-role` Edge Function |
| Sign-up always yields LEARNER | Database trigger on `auth.users` |
| Google refused for ADMIN and LECTURER emails | Auth hook / trigger (mechanism stated in Phase 3) |
| ADMIN privileged operations need AAL2 | RLS checks `auth.jwt() ->> 'aal'`; Edge Functions re-check |
| Lecturer isolation between courses | RLS joined on `course_lecturers` |
| Learner sees only enrolled, published content | RLS joined on `course_enrollments` and publication status |
| Only VALIDATED files readable | Storage policies joined on `file_objects.status` |
| Unreleased grades private | RLS on `submissions.grade_release_status` |
