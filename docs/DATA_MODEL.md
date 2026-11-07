# DDTC LMS: Data model and storage

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## 5. Final data model

All tables have `id uuid` primary keys (except where noted), `created_at`, and `updated_at` maintained by trigger. RLS is enabled on every table with no default access.

| Table | Key columns and constraints |
|---|---|
| profiles | id (= auth.users.id, FK), id_number, first_name, second_name, email, contact_number, role, can_create_courses, account_status, profile_completed, profile_image_file_id. Role, status and can_create_courses are not user-editable. `id_number` (ADR-008): six digits, 100000 to 999999, unique; assigned by a trigger from `private.id_number_seq` through `private.id_number_for()` (a one-to-one shuffle); a second trigger refuses any change. |
| system_settings | key (PK), value (jsonb), updated_by, updated_at. Holds all values marked default. |
| courses | title, course_code (unique), description, learning_objectives, category, cover_image_file_id, created_by, status, missing_as_zero, archived_at. |
| course_lecturers | course_id, lecturer_id, permission_level, assigned_by. Unique (course_id, lecturer_id). |
| course_enrollments | course_id, learner_id, enrolment_status, enrolled_at, enrolled_by. Unique active enrolment per (course_id, learner_id) via partial index. |
| lessons | course_id, title, content (sanitised HTML), position, publication_status, created_by. Unique (course_id, position). |
| file_objects | id, bucket_name, storage_path (unique), original_filename, safe_download_filename, detected_mime_type, file_size, duration_seconds, uploaded_by, status (PENDING, VALIDATED, REJECTED, DELETED, DELETE_FAILED), resource_type, resource_id, checksum, validation_error, uploaded_at, validated_at, deleted_at. Server-generated paths; no client write access to `status` or any validation field. |
| lesson_audio_files | lesson_id, file_object_id, uploaded_by, title, position, lifecycle_status (ACTIVE, SUPERSEDED, ARCHIVED, DELETED), superseded_at, deleted_at, deleted_by. ADR-007: up to 10 ACTIVE files per lesson, each at a distinct position 1 to 10 (a deferrable exclusion constraint, so reorders and deletions move several at once); history and deleted rows have no position; a DELETED row keeps who deleted it and when, and its file is removed from Storage. File validation state comes from `file_objects`. |
| lesson_attachments | lesson_id, file_object_id, uploaded_by, title, position, removed_at, removed_by. Deleting (ADR-007) sets removed_at and removed_by; the row is kept and the file is removed from Storage. Validation state comes from `file_objects`. |
| lesson_progress | learner_id, lesson_id, completion_status, completed_at. Unique (learner_id, lesson_id). |
| grade_categories | course_id, name, weight (0-100). Weights per course must total 100 before first release. |
| assignments | course_id, lesson_id (nullable), category_id, title, description, content_type (TEXT, AUDIO, TEXT_AND_AUDIO), text_instructions, instruction_audio_file_id, due_at, allow_late, max_marks (>0), accepted_formats (array, checked; always TEXT and AUDIO, optionally PDF and DOCX, ADR-009), grading_criteria, publication_status, created_by, published_at, archived_at. CHECK constraints enforce instruction-type rules. |
| assignment_versions | assignment_id, version_number, title, description, content_type, text_instructions, instruction_audio_file_id, due_at, max_marks, accepted_formats, grading_criteria, changed_by, change_reason, created_at. Preserves published snapshots and material edits. |
| submission_extensions | assignment_id, learner_id, extended_due_at, granted_by. Unique (assignment_id, learner_id). |
| submissions | assignment_id, learner_id, status (DRAFT, SUBMITTED, GRADED, REOPENED), current_version, is_late, score, feedback, graded_by, graded_at, grade_release_status (DRAFT, RELEASED), released_at. Unique (assignment_id, learner_id). CHECK score between 0 and the assignment's max_marks (enforced by trigger). |
| submission_versions | submission_id, version_number, text_answer, submitted_at, is_late. Unique (submission_id, version_number). |
| submission_files | submission_version_id, file_object_id, file_role (AUDIO, PDF, DOCX, OTHER). Validation/deletion state comes from `file_objects`. |
| grade_change_history | submission_id, previous_score, new_score, previous_feedback, new_feedback, changed_by, reason, changed_at. Written by trigger; no UPDATE or DELETE. |
| notifications | recipient_id, notification_type, title, message, related_entity_type, related_entity_id, deduplication_key, read_at, created_at. Unique deduplication key where present. |
| notification_deliveries | notification_id, channel (EMAIL), status (QUEUED, SENT, RETRYING, FAILED, SUPPRESSED), attempts, provider_message_id, last_error, next_attempt_at, sent_at, updated_at. |
| notification_preferences | user_id, email_enabled (boolean). |
| audit_logs | actor_id, action, entity_type, entity_id, metadata (jsonb), created_at. Insert by triggers and Edge Functions only; no UPDATE or DELETE for anyone. |
| retention_holds | scope (SUBMISSION, LEARNER, COURSE), scope_id, reason, placed_by, placed_at, released_at. |
| retention_runs | started_at, finished_at, mode (DRY_RUN, LIVE), eligible_count, deleted_count, failed_count, details (jsonb). |

## 6. Storage buckets (all private except noted)

| Bucket | Path pattern | Who writes | Who reads |
|---|---|---|---|
| lesson-audio | {course_id}/{lesson_id}/{file_id}.{ext} | Course lecturers (via pipeline) | Course lecturers, ACTIVE or COMPLETED enrolled learners (published lesson, VALIDATED file), administrators |
| lesson-attachments | {course_id}/{lesson_id}/{file_id}.{ext} | Course lecturers | Same as lesson-audio |
| assignment-instructions-audio | {course_id}/{assignment_id}/{file_id}.{ext} | Course lecturers | Course lecturers, enrolled learners (published assignment), administrators |
| learner-submissions | {assignment_id}/{learner_id}/{version}/{file_id}.{ext} | The learner (own folder, before due date or extension) | The learner, lecturers of that course, administrators |
| profile-images | {user_id}/{file_id}.{ext} | The owner only | Any signed-in user (low sensitivity) |
| course-covers | {course_id}/{file_id}.{ext} | Course lecturers | Any signed-in user who can see the course |


Replacing a profile image or course cover creates a new `file_objects` row; the old object is removed by the `cleanup-files` job. That job never touches lesson audio, instruction audio, attachments or submission files.
