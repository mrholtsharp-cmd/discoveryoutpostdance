export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          class_date: string
          created_at: string
          enrollment_id: string
          id: string
          notes: string | null
          recorded_by: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          class_date: string
          created_at?: string
          enrollment_id: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          class_date?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule: {
        Row: {
          age_group: string | null
          capacity: number | null
          class_name: string
          created_at: string
          day: string
          description: string | null
          id: string
          instructor: string | null
          monthly_tuition_cents: number | null
          sort_order: number
          stripe_monthly_lookup_key: string | null
          stripe_semester_lookup_key: string | null
          time: string
        }
        Insert: {
          age_group?: string | null
          capacity?: number | null
          class_name: string
          created_at?: string
          day: string
          description?: string | null
          id?: string
          instructor?: string | null
          monthly_tuition_cents?: number | null
          sort_order?: number
          stripe_monthly_lookup_key?: string | null
          stripe_semester_lookup_key?: string | null
          time: string
        }
        Update: {
          age_group?: string | null
          capacity?: number | null
          class_name?: string
          created_at?: string
          day?: string
          description?: string | null
          id?: string
          instructor?: string | null
          monthly_tuition_cents?: number | null
          sort_order?: number
          stripe_monthly_lookup_key?: string | null
          stripe_semester_lookup_key?: string | null
          time?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          name: string
          parent_id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          parent_id: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          parent_id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          admin_notes: string | null
          class_id: string
          created_at: string
          enrolled_at: string
          id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          class_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          class_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_requests: {
        Row: {
          class_label: string
          created_at: string
          email: string
          id: string
          monthly_amount_cents: number
          months_remaining: number
          notes: string | null
          parent_id: string
          season_year: number
          status: string
          student_name: string | null
          updated_at: string
        }
        Insert: {
          class_label: string
          created_at?: string
          email: string
          id?: string
          monthly_amount_cents: number
          months_remaining: number
          notes?: string | null
          parent_id: string
          season_year: number
          status?: string
          student_name?: string | null
          updated_at?: string
        }
        Update: {
          class_label?: string
          created_at?: string
          email?: string
          id?: string
          monthly_amount_cents?: number
          months_remaining?: number
          notes?: string | null
          parent_id?: string
          season_year?: number
          status?: string
          student_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parents: {
        Row: {
          address: string | null
          admin_notes: string | null
          auth_user_id: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          auth_user_id: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          phone: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          auth_user_id?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      registration_audit_log: {
        Row: {
          created_at: string
          email: string | null
          error_message: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          registration_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          registration_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          registration_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_audit_log_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_email_verifications: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_address: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_address?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          admin_notes: string | null
          age: number
          amount_paid_cents: number | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          date_of_birth: string | null
          desired_class: string
          email: string
          emergency_contact: string
          experience_level: string
          id: string
          is_trial: boolean
          last_payment_error: string | null
          media_release: boolean
          medical_notes: string | null
          paid_at: string | null
          parent_address: string | null
          parent_agreement: boolean
          parent_name: string
          payment_choice: string | null
          payment_failure_count: number
          payment_failure_flagged: boolean
          payment_status: string
          phone: string
          program: string | null
          refunded_amount_cents: number | null
          refunded_at: string | null
          selected_class_id: string | null
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          student_first_name: string | null
          student_last_name: string | null
          student_name: string
          tuition_item_id: string | null
          waiver_signature: string | null
          waivers_signed_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          age: number
          amount_paid_cents?: number | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date_of_birth?: string | null
          desired_class: string
          email: string
          emergency_contact: string
          experience_level: string
          id?: string
          is_trial?: boolean
          last_payment_error?: string | null
          media_release?: boolean
          medical_notes?: string | null
          paid_at?: string | null
          parent_address?: string | null
          parent_agreement?: boolean
          parent_name: string
          payment_choice?: string | null
          payment_failure_count?: number
          payment_failure_flagged?: boolean
          payment_status?: string
          phone: string
          program?: string | null
          refunded_amount_cents?: number | null
          refunded_at?: string | null
          selected_class_id?: string | null
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          student_first_name?: string | null
          student_last_name?: string | null
          student_name: string
          tuition_item_id?: string | null
          waiver_signature?: string | null
          waivers_signed_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          age?: number
          amount_paid_cents?: number | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date_of_birth?: string | null
          desired_class?: string
          email?: string
          emergency_contact?: string
          experience_level?: string
          id?: string
          is_trial?: boolean
          last_payment_error?: string | null
          media_release?: boolean
          medical_notes?: string | null
          paid_at?: string | null
          parent_address?: string | null
          parent_agreement?: boolean
          parent_name?: string
          payment_choice?: string | null
          payment_failure_count?: number
          payment_failure_flagged?: boolean
          payment_status?: string
          phone?: string
          program?: string | null
          refunded_amount_cents?: number | null
          refunded_at?: string | null
          selected_class_id?: string | null
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          student_first_name?: string | null
          student_last_name?: string | null
          student_name?: string
          tuition_item_id?: string | null
          waiver_signature?: string | null
          waivers_signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_selected_class_id_fkey"
            columns: ["selected_class_id"]
            isOneToOne: false
            referencedRelation: "class_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_tuition_item_id_fkey"
            columns: ["tuition_item_id"]
            isOneToOne: false
            referencedRelation: "tuition_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          environment: string
          event_id: string
          event_type: string
          id: string
          payload: Json | null
          processed_at: string
        }
        Insert: {
          environment: string
          event_id: string
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string
        }
        Update: {
          environment?: string
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          admin_notes: string | null
          allergies: string | null
          created_at: string
          date_of_birth: string
          first_name: string
          grade: string | null
          id: string
          last_name: string
          medical_notes: string | null
          parent_id: string
          shirt_size: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          allergies?: string | null
          created_at?: string
          date_of_birth: string
          first_name: string
          grade?: string | null
          id?: string
          last_name: string
          medical_notes?: string | null
          parent_id: string
          shirt_size?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          allergies?: string | null
          created_at?: string
          date_of_birth?: string
          first_name?: string
          grade?: string | null
          id?: string
          last_name?: string
          medical_notes?: string | null
          parent_id?: string
          shirt_size?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tuition_items: {
        Row: {
          active: boolean
          created_at: string
          description: string
          display_price: string
          id: string
          kind: string
          name: string
          sort_order: number
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          display_price: string
          id?: string
          kind: string
          name: string
          sort_order?: number
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          display_price?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
          updated_at: string
          wait_position: number
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
          updated_at?: string
          wait_position: number
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
          updated_at?: string
          wait_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enroll_or_waitlist: {
        Args: { _class_id: string; _student_id: string }
        Returns: {
          placement: string
          wait_position: number
        }[]
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      attendance_status: "present" | "absent" | "late" | "excused"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      attendance_status: ["present", "absent", "late", "excused"],
    },
  },
} as const
