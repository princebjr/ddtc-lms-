
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
                    "account_status": Database["public"]['Enums']["account_status"],"can_create_courses": boolean,"contact_number": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"profile_completed": boolean,"profile_image_file_id": string | null,"role": Database["public"]['Enums']["user_role"],"second_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"can_create_courses"?: boolean,"contact_number"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id": string,"profile_completed"?: boolean,"profile_image_file_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"second_name"?: string,"updated_at"?: string
                  }
                  Update: {
                    "account_status"?: Database["public"]['Enums']["account_status"],"can_create_courses"?: boolean,"contact_number"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"profile_completed"?: boolean,"profile_image_file_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"second_name"?: string,"updated_at"?: string
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
            [_ in never]: never
          }
          Enums: {
            "account_status": "ACTIVE"|"SUSPENDED"|"DEACTIVATED","file_status": "PENDING"|"VALIDATED"|"REJECTED"|"DELETED"|"DELETE_FAILED","user_role": "ADMIN"|"LECTURER"|"LEARNER"
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
            "account_status": ["ACTIVE", "SUSPENDED", "DEACTIVATED"],"file_status": ["PENDING", "VALIDATED", "REJECTED", "DELETED", "DELETE_FAILED"],"user_role": ["ADMIN", "LECTURER", "LEARNER"]
          }
        }
} as const
