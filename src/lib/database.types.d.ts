
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "assignment_versions": {
                  Row: {
                    "accepted_formats": (string)[],"allow_late": boolean,"assignment_id": string,"category_id": string,"change_reason": string | null,"changed_by": string,"content_type": Database["public"]['Enums']["assignment_content_type"],"created_at": string,"description": string,"due_at": string,"grading_criteria": string,"id": string,"instruction_audio_file_id": string | null,"max_marks": number,"text_instructions": string,"title": string,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_formats": (string)[],"allow_late": boolean,"assignment_id": string,"category_id": string,"change_reason"?: string | null,"changed_by": string,"content_type": Database["public"]['Enums']["assignment_content_type"],"created_at"?: string,"description": string,"due_at": string,"grading_criteria": string,"id"?: string,"instruction_audio_file_id"?: string | null,"max_marks": number,"text_instructions": string,"title": string,"version_number": number
                  }
                  Update: {
                    "accepted_formats"?: (string)[],"allow_late"?: boolean,"assignment_id"?: string,"category_id"?: string,"change_reason"?: string | null,"changed_by"?: string,"content_type"?: Database["public"]['Enums']["assignment_content_type"],"created_at"?: string,"description"?: string,"due_at"?: string,"grading_criteria"?: string,"id"?: string,"instruction_audio_file_id"?: string | null,"max_marks"?: number,"text_instructions"?: string,"title"?: string,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignment_versions_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignment_versions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "grade_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignment_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignment_versions_instruction_audio_file_id_fkey"
      columns: ["instruction_audio_file_id"]
isOneToOne: false
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    }
                  ]
                },"assignments": {
                  Row: {
                    "accepted_formats": (string)[],"allow_late": boolean,"archived_at": string | null,"category_id": string,"content_type": Database["public"]['Enums']["assignment_content_type"],"course_id": string,"created_at": string,"created_by": string,"description": string,"due_at": string,"grading_criteria": string,"id": string,"instruction_audio_file_id": string | null,"lesson_id": string | null,"max_marks": number,"publication_status": Database["public"]['Enums']["publication_status"],"published_at": string | null,"text_instructions": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_formats"?: (string)[],"allow_late"?: boolean,"archived_at"?: string | null,"category_id": string,"content_type": Database["public"]['Enums']["assignment_content_type"],"course_id": string,"created_at"?: string,"created_by": string,"description"?: string,"due_at": string,"grading_criteria"?: string,"id"?: string,"instruction_audio_file_id"?: string | null,"lesson_id"?: string | null,"max_marks": number,"publication_status"?: Database["public"]['Enums']["publication_status"],"published_at"?: string | null,"text_instructions"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_formats"?: (string)[],"allow_late"?: boolean,"archived_at"?: string | null,"category_id"?: string,"content_type"?: Database["public"]['Enums']["assignment_content_type"],"course_id"?: string,"created_at"?: string,"created_by"?: string,"description"?: string,"due_at"?: string,"grading_criteria"?: string,"id"?: string,"instruction_audio_file_id"?: string | null,"lesson_id"?: string | null,"max_marks"?: number,"publication_status"?: Database["public"]['Enums']["publication_status"],"published_at"?: string | null,"text_instructions"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignments_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "grade_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_instruction_audio_file_id_fkey"
      columns: ["instruction_audio_file_id"]
isOneToOne: false
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"position": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"course_enrollments": {
                  Row: {
                    "course_id": string,"created_at": string,"enrolled_at": string,"enrolled_by": string,"enrolment_status": Database["public"]['Enums']["enrolment_status"],"id": string,"learner_id": string,"status_changed_at": string | null,"status_changed_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"enrolled_at"?: string,"enrolled_by": string,"enrolment_status"?: Database["public"]['Enums']["enrolment_status"],"id"?: string,"learner_id": string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"enrolled_at"?: string,"enrolled_by"?: string,"enrolment_status"?: Database["public"]['Enums']["enrolment_status"],"id"?: string,"learner_id"?: string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_enrollments_enrolled_by_fkey"
      columns: ["enrolled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_enrollments_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_enrollments_status_changed_by_fkey"
      columns: ["status_changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"course_lecturers": {
                  Row: {
                    "assigned_at": string,"assigned_by": string,"course_id": string,"created_at": string,"id": string,"lecturer_id": string,"permission_level": Database["public"]['Enums']["course_permission"],"removed_at": string | null,"removed_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by": string,"course_id": string,"created_at"?: string,"id"?: string,"lecturer_id": string,"permission_level": Database["public"]['Enums']["course_permission"],"removed_at"?: string | null,"removed_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string,"course_id"?: string,"created_at"?: string,"id"?: string,"lecturer_id"?: string,"permission_level"?: Database["public"]['Enums']["course_permission"],"removed_at"?: string | null,"removed_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_lecturers_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_lecturers_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_lecturers_lecturer_id_fkey"
      columns: ["lecturer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_lecturers_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "archived_at": string | null,"category": string,"course_code": string,"cover_image_file_id": string | null,"created_at": string,"created_by": string,"description": string,"id": string,"learning_objectives": string,"missing_as_zero": boolean,"published_at": string | null,"return_reason": string | null,"status": Database["public"]['Enums']["course_status"],"submitted_at": string | null,"submitted_by": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"category"?: string,"course_code": string,"cover_image_file_id"?: string | null,"created_at"?: string,"created_by": string,"description"?: string,"id"?: string,"learning_objectives"?: string,"missing_as_zero"?: boolean,"published_at"?: string | null,"return_reason"?: string | null,"status"?: Database["public"]['Enums']["course_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"category"?: string,"course_code"?: string,"cover_image_file_id"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"id"?: string,"learning_objectives"?: string,"missing_as_zero"?: boolean,"published_at"?: string | null,"return_reason"?: string | null,"status"?: Database["public"]['Enums']["course_status"],"submitted_at"?: string | null,"submitted_by"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_cover_image_file_id_fkey"
      columns: ["cover_image_file_id"]
isOneToOne: false
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "courses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "courses_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"file_objects": {
                  Row: {
                    "bucket_name": string,"checksum": string | null,"created_at": string,"delete_attempts": number,"deleted_at": string | null,"detected_mime_type": string | null,"duration_seconds": number | null,"file_size": number | null,"id": string,"last_delete_error": string | null,"original_filename": string,"resource_id": string | null,"resource_type": string,"safe_download_filename": string,"status": Database["public"]['Enums']["file_status"],"storage_path": string,"updated_at": string,"uploaded_at": string,"uploaded_by": string,"validated_at": string | null,"validation_error": string | null,"waveform_peaks": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_name": string,"checksum"?: string | null,"created_at"?: string,"delete_attempts"?: number,"deleted_at"?: string | null,"detected_mime_type"?: string | null,"duration_seconds"?: number | null,"file_size"?: number | null,"id"?: string,"last_delete_error"?: string | null,"original_filename": string,"resource_id"?: string | null,"resource_type": string,"safe_download_filename": string,"status"?: Database["public"]['Enums']["file_status"],"storage_path": string,"updated_at"?: string,"uploaded_at"?: string,"uploaded_by": string,"validated_at"?: string | null,"validation_error"?: string | null,"waveform_peaks"?: (number)[] | null
                  }
                  Update: {
                    "bucket_name"?: string,"checksum"?: string | null,"created_at"?: string,"delete_attempts"?: number,"deleted_at"?: string | null,"detected_mime_type"?: string | null,"duration_seconds"?: number | null,"file_size"?: number | null,"id"?: string,"last_delete_error"?: string | null,"original_filename"?: string,"resource_id"?: string | null,"resource_type"?: string,"safe_download_filename"?: string,"status"?: Database["public"]['Enums']["file_status"],"storage_path"?: string,"updated_at"?: string,"uploaded_at"?: string,"uploaded_by"?: string,"validated_at"?: string | null,"validation_error"?: string | null,"waveform_peaks"?: (number)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_objects_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"grade_categories": {
                  Row: {
                    "archived_at": string | null,"course_id": string,"created_at": string,"id": string,"name": string,"part": Database["public"]['Enums']["grade_part"],"position": number,"updated_at": string,"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"course_id": string,"created_at"?: string,"id"?: string,"name": string,"part"?: Database["public"]['Enums']["grade_part"],"position": number,"updated_at"?: string,"weight": number
                  }
                  Update: {
                    "archived_at"?: string | null,"course_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"part"?: Database["public"]['Enums']["grade_part"],"position"?: number,"updated_at"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "grade_categories_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"grade_change_history": {
                  Row: {
                    "changed_at": string,"changed_by": string,"event": Database["public"]['Enums']["grade_event"],"id": string,"new_feedback": string | null,"new_score": number | null,"previous_feedback": string | null,"previous_score": number | null,"reason": string | null,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by": string,"event": Database["public"]['Enums']["grade_event"],"id"?: string,"new_feedback"?: string | null,"new_score"?: number | null,"previous_feedback"?: string | null,"previous_score"?: number | null,"reason"?: string | null,"submission_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string,"event"?: Database["public"]['Enums']["grade_event"],"id"?: string,"new_feedback"?: string | null,"new_score"?: number | null,"previous_feedback"?: string | null,"previous_score"?: number | null,"reason"?: string | null,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grade_change_history_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grade_change_history_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_attachments": {
                  Row: {
                    "created_at": string,"file_object_id": string,"id": string,"lesson_id": string,"position": number,"removed_at": string | null,"removed_by": string | null,"title": string,"updated_at": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_object_id": string,"id"?: string,"lesson_id": string,"position": number,"removed_at"?: string | null,"removed_by"?: string | null,"title": string,"updated_at"?: string,"uploaded_by": string
                  }
                  Update: {
                    "created_at"?: string,"file_object_id"?: string,"id"?: string,"lesson_id"?: string,"position"?: number,"removed_at"?: string | null,"removed_by"?: string | null,"title"?: string,"updated_at"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_attachments_file_object_id_fkey"
      columns: ["file_object_id"]
isOneToOne: true
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_attachments_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_attachments_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_audio_files": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"deleted_by": string | null,"file_object_id": string,"id": string,"lesson_id": string,"lifecycle_status": Database["public"]['Enums']["audio_lifecycle"],"position": number | null,"superseded_at": string | null,"title": string,"updated_at": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"file_object_id": string,"id"?: string,"lesson_id": string,"lifecycle_status"?: Database["public"]['Enums']["audio_lifecycle"],"position"?: number | null,"superseded_at"?: string | null,"title": string,"updated_at"?: string,"uploaded_by": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"file_object_id"?: string,"id"?: string,"lesson_id"?: string,"lifecycle_status"?: Database["public"]['Enums']["audio_lifecycle"],"position"?: number | null,"superseded_at"?: string | null,"title"?: string,"updated_at"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_audio_files_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_audio_files_file_object_id_fkey"
      columns: ["file_object_id"]
isOneToOne: true
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_audio_files_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_audio_files_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_progress": {
                  Row: {
                    "completed_at": string | null,"completion_status": Database["public"]['Enums']["completion_status"],"created_at": string,"id": string,"learner_id": string,"lesson_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"completion_status"?: Database["public"]['Enums']["completion_status"],"created_at"?: string,"id"?: string,"learner_id": string,"lesson_id": string,"updated_at"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"completion_status"?: Database["public"]['Enums']["completion_status"],"created_at"?: string,"id"?: string,"learner_id"?: string,"lesson_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_progress_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_progress_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "content": string,"course_id": string,"created_at": string,"created_by": string,"id": string,"position": number,"publication_status": Database["public"]['Enums']["publication_status"],"published_at": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: string,"course_id": string,"created_at"?: string,"created_by": string,"id"?: string,"position": number,"publication_status"?: Database["public"]['Enums']["publication_status"],"published_at"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: string,"course_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"position"?: number,"publication_status"?: Database["public"]['Enums']["publication_status"],"published_at"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "created_at": string,"email_enabled": boolean,"id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email_enabled"?: boolean,"id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email_enabled"?: boolean,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"deduplication_key": string | null,"id": string,"link_path": string | null,"message": string,"notification_type": Database["public"]['Enums']["notification_type"],"read_at": string | null,"recipient_id": string,"related_entity_id": string | null,"related_entity_type": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deduplication_key"?: string | null,"id"?: string,"link_path"?: string | null,"message": string,"notification_type": Database["public"]['Enums']["notification_type"],"read_at"?: string | null,"recipient_id": string,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"deduplication_key"?: string | null,"id"?: string,"link_path"?: string | null,"message"?: string,"notification_type"?: Database["public"]['Enums']["notification_type"],"read_at"?: string | null,"recipient_id"?: string,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "account_status": Database["public"]['Enums']["account_status"],"branch_id": string | null,"can_create_courses": boolean,"can_publish_directly": boolean,"contact_number": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"id_number": number,"profile_completed": boolean,"profile_image_file_id": string | null,"role": Database["public"]['Enums']["user_role"],"second_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"branch_id"?: string | null,"can_create_courses"?: boolean,"can_publish_directly"?: boolean,"contact_number"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id": string,"id_number": number,"profile_completed"?: boolean,"profile_image_file_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"second_name"?: string,"updated_at"?: string
                  }
                  Update: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"branch_id"?: string | null,"can_create_courses"?: boolean,"can_publish_directly"?: boolean,"contact_number"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"id_number"?: number,"profile_completed"?: boolean,"profile_image_file_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"second_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_profile_image_file_id_fkey"
      columns: ["profile_image_file_id"]
isOneToOne: false
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_extensions": {
                  Row: {
                    "assignment_id": string,"created_at": string,"extended_due_at": string,"granted_by": string,"id": string,"learner_id": string,"reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"created_at"?: string,"extended_due_at": string,"granted_by": string,"id"?: string,"learner_id": string,"reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assignment_id"?: string,"created_at"?: string,"extended_due_at"?: string,"granted_by"?: string,"id"?: string,"learner_id"?: string,"reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_extensions_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_extensions_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_extensions_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_extensions_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_files": {
                  Row: {
                    "created_at": string,"file_object_id": string,"file_role": Database["public"]['Enums']["submission_file_role"],"id": string,"submission_version_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_object_id": string,"file_role": Database["public"]['Enums']["submission_file_role"],"id"?: string,"submission_version_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"file_object_id"?: string,"file_role"?: Database["public"]['Enums']["submission_file_role"],"id"?: string,"submission_version_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_files_file_object_id_fkey"
      columns: ["file_object_id"]
isOneToOne: true
      referencedRelation: "file_objects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_files_submission_version_id_fkey"
      columns: ["submission_version_id"]
isOneToOne: false
      referencedRelation: "submission_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_versions": {
                  Row: {
                    "client_request_id": string,"created_at": string,"id": string,"is_late": boolean,"submission_id": string,"submitted_at": string,"text_answer": string,"updated_at": string,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_request_id": string,"created_at"?: string,"id"?: string,"is_late": boolean,"submission_id": string,"submitted_at"?: string,"text_answer"?: string,"updated_at"?: string,"version_number": number
                  }
                  Update: {
                    "client_request_id"?: string,"created_at"?: string,"id"?: string,"is_late"?: boolean,"submission_id"?: string,"submitted_at"?: string,"text_answer"?: string,"updated_at"?: string,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_versions_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "assignment_id": string,"created_at": string,"current_version": number,"feedback": string | null,"grade_release_status": Database["public"]['Enums']["grade_release_status"],"graded_at": string | null,"graded_by": string | null,"id": string,"is_late": boolean,"learner_id": string,"marked_in_person": boolean,"released_at": string | null,"released_by": string | null,"released_feedback": string | null,"released_score": number | null,"score": number | null,"status": Database["public"]['Enums']["submission_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"created_at"?: string,"current_version"?: number,"feedback"?: string | null,"grade_release_status"?: Database["public"]['Enums']["grade_release_status"],"graded_at"?: string | null,"graded_by"?: string | null,"id"?: string,"is_late"?: boolean,"learner_id": string,"marked_in_person"?: boolean,"released_at"?: string | null,"released_by"?: string | null,"released_feedback"?: string | null,"released_score"?: number | null,"score"?: number | null,"status"?: Database["public"]['Enums']["submission_status"],"updated_at"?: string
                  }
                  Update: {
                    "assignment_id"?: string,"created_at"?: string,"current_version"?: number,"feedback"?: string | null,"grade_release_status"?: Database["public"]['Enums']["grade_release_status"],"graded_at"?: string | null,"graded_by"?: string | null,"id"?: string,"is_late"?: boolean,"learner_id"?: string,"marked_in_person"?: boolean,"released_at"?: string | null,"released_by"?: string | null,"released_feedback"?: string | null,"released_score"?: number | null,"score"?: number | null,"status"?: Database["public"]['Enums']["submission_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_graded_by_fkey"
      columns: ["graded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_released_by_fkey"
      columns: ["released_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"system_settings": {
                  Row: {
                    "created_at": string,"description": string,"is_sensitive": boolean,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"is_sensitive"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"is_sensitive"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "system_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_record_mfa_reset":
{ Args: { "p_actor": string,"p_target": string }; Returns: undefined
                           },
"admin_set_direct_publish":
{ Args: { "p_actor": string,"p_target": string,"p_value": boolean }; Returns: Json
                           },
"admin_set_user":
{ Args: { "p_actor": string,"p_can_create"?: boolean,"p_role"?: Database["public"]['Enums']["user_role"],"p_status"?: Database["public"]['Enums']["account_status"],"p_target": string }; Returns: Json
                           },
"am_i_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"apply_standard_parts":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_course": string,"p_reason": string }; Returns: undefined
                           },
"assignment_audio_activate":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_file": string }; Returns: Json
                           },
"assignment_media":
{ Args: { "p_assignment": string }; Returns: {
              "bucket_name": string,"duration_seconds": number,"file_object_id": string,"file_size": number,"mime_type": string,"safe_download_filename": string,"storage_path": string,"waveform_peaks": (number)[]
            }[]
                           },
"assignment_report_summary":
{ Args: { "p_assignment": string }; Returns: {
              "average": number,"enrolled": number,"graded": number,"highest": number,"lowest": number,"max_marks": number,"not_submitted": number,"submitted": number
            }[]
                           },
"assignment_result_counts":
{ Args: { "p_assignment": string }; Returns: {
              "enrolled": number,"graded": number,"missing": number,"not_yet_due": number,"released": number,"submitted": number,"ungraded": number,"withdrawn_submitted": number
            }[]
                           },
"assignment_results":
{ Args: { "p_assignment": string }; Returns: {
              "band": string,"branch_name": string,"changed_since_release": boolean,"counted": boolean,"current_version": number,"effective_due_at": string,"enrolment_status": Database["public"]['Enums']["enrolment_status"],"extended_due_at": string,"first_name": string,"grade_release_status": Database["public"]['Enums']["grade_release_status"],"graded_at": string,"id_number": number,"is_late": boolean,"learner_id": string,"letter_grade": string,"max_marks": number,"percentage": number,"profile_image_path": string,"released_at": string,"released_score": number,"result": string,"score": number,"second_name": string,"status": Database["public"]['Enums']["submission_status"],"submission_id": string,"submitted_at": string
            }[]
                           },
"assignment_save":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_course": string,"p_fields": Json,"p_reason": string }; Returns: string
                           },
"assignment_set_archived":
{ Args: { "p_actor": string,"p_archived": boolean,"p_as_admin": boolean,"p_assignment": string }; Returns: Json
                           },
"assignment_set_publication":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_publish": boolean }; Returns: Json
                           },
"assignment_statistics":
{ Args: { "p_course": string }; Returns: {
              "assignment_id": string,"average": number,"chart_visible": boolean,"distribution": Json,"highest": number,"lowest": number,"missing": number,"my_band": string,"released": number,"ungraded": number
            }[]
                           },
"assignment_submissions":
{ Args: { "p_assignment": string }; Returns: {
              "branch_name": string,"current_version": number,"effective_due_at": string,"enrolment_status": Database["public"]['Enums']["enrolment_status"],"extended_due_at": string,"first_name": string,"id_number": number,"is_late": boolean,"learner_id": string,"profile_image_path": string,"second_name": string,"status": Database["public"]['Enums']["submission_status"],"submission_id": string,"submitted_at": string
            }[]
                           },
"bootstrap_first_admin":
{ Args: { "p_user": string }; Returns: undefined
                           },
"calculate_course_grades":
{ Args: { "p_course": string }; Returns: {
              "band": string,"branch_name": string,"categories": Json,"cells": Json,"enrolment_status": Database["public"]['Enums']["enrolment_status"],"first_name": string,"id_number": number,"learner_id": string,"letter_grade": string,"overall_percentage": number,"profile_image_path": string,"second_name": string,"status": string
            }[]
                           },
"cleanup_failures":
{ Args: Record<PropertyKey, never>; Returns: {
              "bucket_name": string,"delete_attempts": number,"id": string,"last_delete_error": string,"resource_type": string,"status": Database["public"]['Enums']["file_status"],"storage_path": string,"updated_at": string
            }[]
                           },
"course_cover_paths":
{ Args: { "p_courses": (string)[] }; Returns: {
              "course_id": string,"storage_path": string
            }[]
                           },
"course_cover_remove":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_course": string }; Returns: Json
                           },
"course_create":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_category"?: string,"p_code": string,"p_description"?: string,"p_objectives"?: string,"p_owner": string,"p_title": string }; Returns: string
                           },
"course_lecturer_change":
{ Args: { "p_action": string,"p_actor": string,"p_as_admin": boolean,"p_course": string,"p_lecturer": string }; Returns: Json
                           },
"course_release_preview":
{ Args: { "p_course": string }; Returns: {
              "assignment_id": string,"assignment_title": string,"branch_name": string,"changed": boolean,"first_name": string,"id_number": number,"learner_id": string,"letter_grade": string,"max_marks": number,"percentage": number,"released_score": number,"score": number,"second_name": string
            }[]
                           },
"course_roster":
{ Args: { "p_course": string }; Returns: {
              "branch_name": string,"enrolled_at": string,"enrolment_id": string,"enrolment_status": Database["public"]['Enums']["enrolment_status"],"first_name": string,"id_number": number,"learner_id": string,"profile_image_path": string,"second_name": string
            }[]
                           },
"course_teachers":
{ Args: { "p_course": string }; Returns: {
              "first_name": string,"lecturer_id": string,"permission_level": Database["public"]['Enums']["course_permission"],"profile_image_path": string,"second_name": string
            }[]
                           },
"course_transition":
{ Args: { "p_action": string,"p_actor": string,"p_as_admin": boolean,"p_course": string,"p_grant_direct"?: boolean,"p_reason"?: string }; Returns: Json
                           },
"course_uses_standard_parts":
{ Args: { "p_course": string }; Returns: boolean
                           },
"course_weight_total":
{ Args: { "p_course": string }; Returns: number
                           },
"course_weights_locked":
{ Args: { "p_course": string }; Returns: boolean
                           },
"enrolment_add":
{ Args: { "p_actor": string,"p_course": string,"p_learners": (string)[] }; Returns: Json
                           },
"enrolment_set_status":
{ Args: { "p_actor": string,"p_enrolments": (string)[],"p_status": Database["public"]['Enums']["enrolment_status"] }; Returns: Json
                           },
"files_due_for_cleanup":
{ Args: { "p_limit"?: number }; Returns: {
              "bucket_name": string,"id": string,"reason": string,"status": Database["public"]['Enums']["file_status"],"storage_path": string
            }[]
                           },
"grade_categories_save":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_categories": Json,"p_course": string,"p_reason"?: string }; Returns: Json
                           },
"grade_release":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_learner"?: string }; Returns: number
                           },
"grade_release_course":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_course": string }; Returns: number
                           },
"grade_reopen":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_learner": string,"p_reason": string }; Returns: undefined
                           },
"grade_save":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_feedback": string,"p_learner": string,"p_reason"?: string,"p_score": number }; Returns: {
              "changed": boolean,"grade_release_status": Database["public"]['Enums']["grade_release_status"],"submission_id": string
            }[]
                           },
"gradebook_assignments":
{ Args: { "p_course": string }; Returns: {
              "assignment_id": string,"category_id": string,"category_name": string,"due_at": string,"max_marks": number,"part": string,"published": boolean,"title": string
            }[]
                           },
"grading_queue":
{ Args: Record<PropertyKey, never>; Returns: {
              "assignment_id": string,"assignment_title": string,"branch_name": string,"course_code": string,"course_id": string,"course_title": string,"current_version": number,"due_at": string,"first_name": string,"id_number": number,"is_late": boolean,"learner_id": string,"max_marks": number,"profile_image_path": string,"score": number,"second_name": string,"state": string,"status": Database["public"]['Enums']["submission_status"],"submitted_at": string
            }[]
                           },
"i_manage_course":
{ Args: { "p_course": string }; Returns: boolean
                           },
"idle_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"launch_readiness":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"lesson_attachment_add":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_file": string,"p_title": string }; Returns: string
                           },
"lesson_attachment_delete":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_attachment": string }; Returns: Json
                           },
"lesson_audio_activate":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_file": string,"p_replace"?: string,"p_title"?: string }; Returns: Json
                           },
"lesson_audio_delete":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_audio": string }; Returns: Json
                           },
"lesson_audio_rename":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_audio": string,"p_title": string }; Returns: undefined
                           },
"lesson_audio_reorder":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_audio": (string)[],"p_lesson": string }; Returns: undefined
                           },
"lesson_media":
{ Args: { "p_lesson": string }; Returns: {
              "bucket_name": string,"duration_seconds": number,"file_object_id": string,"file_size": number,"item_id": string,"kind": string,"mime_type": string,"safe_download_filename": string,"sort_order": number,"storage_path": string,"title": string,"waveform_peaks": (number)[]
            }[]
                           },
"lesson_reorder":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_course": string,"p_lessons": (string)[] }; Returns: undefined
                           },
"lesson_save":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_content": string,"p_course": string,"p_lesson": string,"p_title": string }; Returns: string
                           },
"lesson_set_publication":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_lesson": string,"p_publish": boolean }; Returns: Json
                           },
"mark_lesson":
{ Args: { "p_completed": boolean,"p_lesson": string }; Returns: string
                           },
"my_grade":
{ Args: { "p_assignment": string }; Returns: Json
                           },
"my_grades":
{ Args: Record<PropertyKey, never>; Returns: {
              "assignment_id": string,"assignment_title": string,"band": string,"course_code": string,"course_id": string,"course_title": string,"current_version": number,"due_at": string,"feedback": string,"letter_grade": string,"max_marks": number,"passed": boolean,"percentage": number,"released_at": string,"score": number,"state": string,"submitted_at": string,"updated": boolean
            }[]
                           },
"my_submission":
{ Args: { "p_assignment": string }; Returns: Json
                           },
"practical_marks":
{ Args: { "p_assignment": string }; Returns: {
              "feedback": string,"learner_id": string,"score": number
            }[]
                           },
"practical_marks_save":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_marks": Json,"p_reason"?: string }; Returns: number
                           },
"record_activity":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"record_export":
{ Args: { "p_actor": string,"p_entity_id": string,"p_entity_type": string,"p_kind": string,"p_metadata": Json }; Returns: undefined
                           },
"standard_parts_preview":
{ Args: { "p_course": string }; Returns: {
              "current_overall": number,"first_name": string,"learner_id": string,"new_overall": number,"second_name": string
            }[]
                           },
"submission_draft_file_remove":
{ Args: { "p_actor": string,"p_file": string }; Returns: {
              "bucket_name": string,"storage_path": string
            }[]
                           },
"submission_extension_remove":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_learner": string }; Returns: string
                           },
"submission_extension_set":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_assignment": string,"p_due": string,"p_learner": string,"p_reason": string,"p_undo"?: boolean }; Returns: string
                           },
"submission_prepare_upload":
{ Args: { "p_actor": string,"p_assignment": string,"p_role": Database["public"]['Enums']["submission_file_role"] }; Returns: {
              "submission_id": string,"version_number": number
            }[]
                           },
"submission_review":
{ Args: { "p_assignment": string,"p_learner": string }; Returns: Json
                           },
"submission_submit":
{ Args: { "p_actor": string,"p_assignment": string,"p_files": (string)[],"p_request": string,"p_text": string }; Returns: {
              "is_late": boolean,"replayed": boolean,"resubmitted": boolean,"submission_id": string,"version_number": number
            }[]
                           },
"weights_impact_preview":
{ Args: { "p_categories": Json,"p_course": string }; Returns: {
              "current_overall": number,"first_name": string,"learner_id": string,"new_overall": number,"second_name": string
            }[]
                           }
          }
          Enums: {
            "account_status": "ACTIVE"|"SUSPENDED"|"DEACTIVATED","assignment_content_type": "TEXT"|"AUDIO"|"TEXT_AND_AUDIO","audio_lifecycle": "ACTIVE"|"SUPERSEDED"|"ARCHIVED"|"DELETED","completion_status": "IN_PROGRESS"|"COMPLETED","course_permission": "OWNER"|"CO_LECTURER","course_status": "DRAFT"|"PENDING_APPROVAL"|"PUBLISHED"|"ARCHIVED","enrolment_status": "ACTIVE"|"COMPLETED"|"WITHDRAWN"|"SUSPENDED","file_status": "PENDING"|"VALIDATED"|"REJECTED"|"DELETED"|"DELETE_FAILED","grade_event": "SAVED"|"RELEASED"|"REOPENED","grade_part": "ASSIGNMENTS"|"PRACTICALS"|"EXAMINATIONS","grade_release_status": "DRAFT"|"RELEASED","notification_type": "GRADE_RELEASED"|"GRADE_UPDATED","publication_status": "DRAFT"|"PUBLISHED","submission_file_role": "AUDIO"|"PDF"|"DOCX"|"OTHER","submission_status": "DRAFT"|"SUBMITTED"|"GRADED"|"REOPENED","user_role": "ADMIN"|"LECTURER"|"LEARNER"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_status": ["ACTIVE", "SUSPENDED", "DEACTIVATED"],"assignment_content_type": ["TEXT", "AUDIO", "TEXT_AND_AUDIO"],"audio_lifecycle": ["ACTIVE", "SUPERSEDED", "ARCHIVED", "DELETED"],"completion_status": ["IN_PROGRESS", "COMPLETED"],"course_permission": ["OWNER", "CO_LECTURER"],"course_status": ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"],"enrolment_status": ["ACTIVE", "COMPLETED", "WITHDRAWN", "SUSPENDED"],"file_status": ["PENDING", "VALIDATED", "REJECTED", "DELETED", "DELETE_FAILED"],"grade_event": ["SAVED", "RELEASED", "REOPENED"],"grade_part": ["ASSIGNMENTS", "PRACTICALS", "EXAMINATIONS"],"grade_release_status": ["DRAFT", "RELEASED"],"notification_type": ["GRADE_RELEASED", "GRADE_UPDATED"],"publication_status": ["DRAFT", "PUBLISHED"],"submission_file_role": ["AUDIO", "PDF", "DOCX", "OTHER"],"submission_status": ["DRAFT", "SUBMITTED", "GRADED", "REOPENED"],"user_role": ["ADMIN", "LECTURER", "LEARNER"]
          }
        }
} as const
