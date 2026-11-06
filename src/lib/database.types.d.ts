
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
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
                    "bucket_name": string,"checksum": string | null,"created_at": string,"deleted_at": string | null,"detected_mime_type": string | null,"duration_seconds": number | null,"file_size": number | null,"id": string,"original_filename": string,"resource_id": string | null,"resource_type": string,"safe_download_filename": string,"status": Database["public"]['Enums']["file_status"],"storage_path": string,"updated_at": string,"uploaded_at": string,"uploaded_by": string,"validated_at": string | null,"validation_error": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_name": string,"checksum"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"detected_mime_type"?: string | null,"duration_seconds"?: number | null,"file_size"?: number | null,"id"?: string,"original_filename": string,"resource_id"?: string | null,"resource_type": string,"safe_download_filename": string,"status"?: Database["public"]['Enums']["file_status"],"storage_path": string,"updated_at"?: string,"uploaded_at"?: string,"uploaded_by": string,"validated_at"?: string | null,"validation_error"?: string | null
                  }
                  Update: {
                    "bucket_name"?: string,"checksum"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"detected_mime_type"?: string | null,"duration_seconds"?: number | null,"file_size"?: number | null,"id"?: string,"original_filename"?: string,"resource_id"?: string | null,"resource_type"?: string,"safe_download_filename"?: string,"status"?: Database["public"]['Enums']["file_status"],"storage_path"?: string,"updated_at"?: string,"uploaded_at"?: string,"uploaded_by"?: string,"validated_at"?: string | null,"validation_error"?: string | null
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
                },"profiles": {
                  Row: {
                    "account_status": Database["public"]['Enums']["account_status"],"can_create_courses": boolean,"can_publish_directly": boolean,"contact_number": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"profile_completed": boolean,"profile_image_file_id": string | null,"role": Database["public"]['Enums']["user_role"],"second_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"can_create_courses"?: boolean,"can_publish_directly"?: boolean,"contact_number"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id": string,"profile_completed"?: boolean,"profile_image_file_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"second_name"?: string,"updated_at"?: string
                  }
                  Update: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"can_create_courses"?: boolean,"can_publish_directly"?: boolean,"contact_number"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"profile_completed"?: boolean,"profile_image_file_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"second_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_profile_image_file_id_fkey"
      columns: ["profile_image_file_id"]
isOneToOne: false
      referencedRelation: "file_objects"
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
"bootstrap_first_admin":
{ Args: { "p_user": string }; Returns: undefined
                           },
"course_cover_paths":
{ Args: { "p_courses": (string)[] }; Returns: {
              "course_id": string,"storage_path": string
            }[]
                           },
"course_create":
{ Args: { "p_actor": string,"p_as_admin": boolean,"p_category"?: string,"p_code": string,"p_description"?: string,"p_objectives"?: string,"p_owner": string,"p_title": string }; Returns: string
                           },
"course_lecturer_change":
{ Args: { "p_action": string,"p_actor": string,"p_as_admin": boolean,"p_course": string,"p_lecturer": string }; Returns: Json
                           },
"course_roster":
{ Args: { "p_course": string }; Returns: {
              "enrolled_at": string,"enrolment_id": string,"enrolment_status": Database["public"]['Enums']["enrolment_status"],"first_name": string,"learner_id": string,"profile_image_path": string,"second_name": string
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
"launch_readiness":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_activity":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "ACTIVE"|"SUSPENDED"|"DEACTIVATED","course_permission": "OWNER"|"CO_LECTURER","course_status": "DRAFT"|"PENDING_APPROVAL"|"PUBLISHED"|"ARCHIVED","enrolment_status": "ACTIVE"|"COMPLETED"|"WITHDRAWN"|"SUSPENDED","file_status": "PENDING"|"VALIDATED"|"REJECTED"|"DELETED"|"DELETE_FAILED","user_role": "ADMIN"|"LECTURER"|"LEARNER"
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
            "account_status": ["ACTIVE", "SUSPENDED", "DEACTIVATED"],"course_permission": ["OWNER", "CO_LECTURER"],"course_status": ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "ARCHIVED"],"enrolment_status": ["ACTIVE", "COMPLETED", "WITHDRAWN", "SUSPENDED"],"file_status": ["PENDING", "VALIDATED", "REJECTED", "DELETED", "DELETE_FAILED"],"user_role": ["ADMIN", "LECTURER", "LEARNER"]
          }
        }
} as const
