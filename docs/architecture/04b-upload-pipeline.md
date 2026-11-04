# 4b. Workflow: validated upload pipeline and file access

Source: D18, D19, D33 and BUILD_PLAN Section 6. One pipeline for every bucket; no ad-hoc direct-to-Storage uploads.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (user JWT)
  participant RU as Edge Function register-upload
  participant DB as PostgreSQL
  participant S as Storage (private bucket)
  participant FU as Edge Function finalize-upload

  B->>RU: resource type, resource id, filename, declared size
  RU->>DB: re-check role, ownership and rules (never trust client)
  alt not authorised
    RU-->>B: 403
  else authorised
    RU->>DB: insert file_objects (PENDING, server-generated immutable path)
    RU-->>B: file id + exact path
  end
  B->>S: upload to that exact path (resumable if over 25 MB)
  Note over S: Storage insert policy allows only the path of the caller's PENDING row
  B->>FU: finalize(file id)
  FU->>S: read object
  FU->>FU: check magic bytes, MIME, size, duration, file-specific limits (D17), ownership
  alt valid
    FU->>DB: status VALIDATED, detected_mime_type, size, duration, checksum
    FU-->>B: VALIDATED
  else invalid
    FU->>S: remove object
    FU->>DB: status REJECTED + validation_error (DELETE_FAILED if removal fails, retried)
    FU-->>B: REJECTED + reason
  end
```

## File status

```mermaid
stateDiagram-v2
  [*] --> PENDING : register-upload
  PENDING --> VALIDATED : finalize-upload passes
  PENDING --> REJECTED : finalize-upload fails (object removed)
  PENDING --> DELETED : cleanup-files, older than 24 h
  REJECTED --> DELETED : cleanup-files removes object
  VALIDATED --> DELETED : retention-runner (learner audio only) or cleanup of replaced avatar/cover
  DELETED --> [*]
  PENDING --> DELETE_FAILED : removal error
  REJECTED --> DELETE_FAILED : removal error
  VALIDATED --> DELETE_FAILED : removal error
  DELETE_FAILED --> DELETED : retried by cleanup-files
```

## Playback and download (no Edge Function, no service role)

```mermaid
sequenceDiagram
  participant B as Browser (user JWT)
  participant S as Storage
  participant P as Storage policy
  B->>S: createSignedUrl(path, 3600 s playback / 300 s download)
  S->>P: evaluate with caller's session
  P->>P: file_objects row VALIDATED AND resource rule (enrolment, publication, course lecturer, ADMIN)
  alt allowed
    S-->>B: signed URL (download uses safe_download_filename)
  else denied (incl. suspended or deactivated user)
    S-->>B: error
  end
```
