/**
 * Generated from the local Supabase schema — do not hand-edit.
 * Regenerate: `supabase gen types typescript --local > src/database.types.ts`
 * (run from repo root with `supabase start` up).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          duration_ms: number
          error_code: string | null
          id: string
          idempotency_key: string | null
          input_hash: string
          metadata: Json
          org_id: string
          outcome: string
          provider: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          duration_ms: number
          error_code?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash: string
          metadata?: Json
          org_id: string
          outcome: string
          provider?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          idempotency_key?: string | null
          input_hash?: string
          metadata?: Json
          org_id?: string
          outcome?: string
          provider?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_seen_at: string
          name: string
          org_id: string
          public_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          name: string
          org_id: string
          public_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          name?: string
          org_id?: string
          public_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          body: string
          category: string
          citations: Json
          generated_at: string
          id: string
          intent_id: string | null
          model: string
          org_id: string
          provider: string
          severity: string
          title: string
        }
        Insert: {
          body: string
          category: string
          citations?: Json
          generated_at?: string
          id?: string
          intent_id?: string | null
          model: string
          org_id: string
          provider: string
          severity: string
          title: string
        }
        Update: {
          body?: string
          category?: string
          citations?: Json
          generated_at?: string
          id?: string
          intent_id?: string | null
          model?: string
          org_id?: string
          provider?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      intents: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          input_hash: string
          kind: string
          org_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          input_hash: string
          kind: string
          org_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          input_hash?: string
          kind?: string
          org_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      keys_envelopes: {
        Row: {
          created_at: string
          id: string
          org_id: string
          provider: string
          rotated_at: string | null
          user_id: string
          wrapped_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          provider: string
          rotated_at?: string | null
          user_id: string
          wrapped_key: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          provider?: string
          rotated_at?: string | null
          user_id?: string
          wrapped_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "keys_envelopes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          default_llm_base_url: string | null
          default_llm_model: string
          default_llm_provider: string
          id: string
          kdf_params: Json
          llm_daily_budget_cents: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_llm_base_url?: string | null
          default_llm_model?: string
          default_llm_provider?: string
          id?: string
          kdf_params?: Json
          llm_daily_budget_cents?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_llm_base_url?: string | null
          default_llm_model?: string
          default_llm_provider?: string
          id?: string
          kdf_params?: Json
          llm_daily_budget_cents?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          id: string
          org_id: string
          refilled_at: string
          tokens: number
          user_id: string
        }
        Insert: {
          bucket: string
          id?: string
          org_id: string
          refilled_at?: string
          tokens?: number
          user_id: string
        }
        Update: {
          bucket?: string
          id?: string
          org_id?: string
          refilled_at?: string
          tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          captured_at: string
          id: string
          intent_id: string | null
          metadata: Json
          org_id: string
          platform: string
          raw_html_path: string | null
          raw_markdown: string | null
          url: string
          url_hash: string
        }
        Insert: {
          captured_at?: string
          id?: string
          intent_id?: string | null
          metadata?: Json
          org_id: string
          platform: string
          raw_html_path?: string | null
          raw_markdown?: string | null
          url: string
          url_hash: string
        }
        Update: {
          captured_at?: string
          id?: string
          intent_id?: string | null
          metadata?: Json
          org_id?: string
          platform?: string
          raw_html_path?: string | null
          raw_markdown?: string | null
          url?: string
          url_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_message: {
        Args: { p_msg_id: number; p_queue_name: string }
        Returns: undefined
      }
      current_org_ids: { Args: never; Returns: string[] }
      dequeue_message: { Args: { p_queue_name: string }; Returns: Json }
      enqueue_message: {
        Args: { p_message: Json; p_queue_name: string }
        Returns: number
      }
      invoke_edge_function: {
        Args: { p_function_name: string }
        Returns: undefined
      }
      is_member_of: { Args: { _org_id: string }; Returns: boolean }
      rate_limit_take: {
        Args: {
          p_bucket: string
          p_capacity: number
          p_org_id: string
          p_refill_per_second: number
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      unwrap_dek: { Args: { p_wrapped: string }; Returns: string }
      wrap_dek: { Args: { p_dek: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

