export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          duration_ms: number;
          error_code: string | null;
          id: string;
          idempotency_key: string | null;
          input_hash: string;
          metadata: Json;
          org_id: string;
          outcome: string;
          provider: string | null;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          duration_ms: number;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input_hash: string;
          metadata?: Json;
          org_id: string;
          outcome: string;
          provider?: string | null;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          duration_ms?: number;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input_hash?: string;
          metadata?: Json;
          org_id?: string;
          outcome?: string;
          provider?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      competitor_snapshots: {
        Row: {
          captured_at: string;
          competitor_id: string;
          id: string;
          org_id: string;
          price_points: Json;
          product_count: number | null;
          source: string;
        };
        Insert: {
          captured_at?: string;
          competitor_id: string;
          id?: string;
          org_id: string;
          price_points?: Json;
          product_count?: number | null;
          source: string;
        };
        Update: {
          captured_at?: string;
          competitor_id?: string;
          id?: string;
          org_id?: string;
          price_points?: Json;
          product_count?: number | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'competitor_snapshots_competitor_id_fkey';
            columns: ['competitor_id'];
            isOneToOne: false;
            referencedRelation: 'competitors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'competitor_snapshots_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      competitors: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          niche_notes: string | null;
          org_id: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          niche_notes?: string | null;
          org_id: string;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          niche_notes?: string | null;
          org_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'competitors_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      devices: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          last_seen_at: string;
          name: string;
          org_id: string;
          public_key: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          last_seen_at?: string;
          name: string;
          org_id: string;
          public_key?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          last_seen_at?: string;
          name?: string;
          org_id?: string;
          public_key?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      insights: {
        Row: {
          body: string;
          category: string;
          citations: Json;
          generated_at: string;
          id: string;
          intent_id: string | null;
          model: string;
          org_id: string;
          provider: string;
          severity: string;
          superseded_at: string | null;
          title: string;
        };
        Insert: {
          body: string;
          category: string;
          citations?: Json;
          generated_at?: string;
          id?: string;
          intent_id?: string | null;
          model: string;
          org_id: string;
          provider: string;
          severity: string;
          superseded_at?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          category?: string;
          citations?: Json;
          generated_at?: string;
          id?: string;
          intent_id?: string | null;
          model?: string;
          org_id?: string;
          provider?: string;
          severity?: string;
          superseded_at?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'insights_intent_id_fkey';
            columns: ['intent_id'];
            isOneToOne: false;
            referencedRelation: 'intents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'insights_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      intents: {
        Row: {
          created_at: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          idempotency_key: string;
          input_hash: string;
          kind: string;
          org_id: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          idempotency_key: string;
          input_hash: string;
          kind: string;
          org_id: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          idempotency_key?: string;
          input_hash?: string;
          kind?: string;
          org_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'intents_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      keys_envelopes: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          provider: string;
          rotated_at: string | null;
          user_id: string;
          wrapped_key: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          provider: string;
          rotated_at?: string | null;
          user_id: string;
          wrapped_key: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          provider?: string;
          rotated_at?: string | null;
          user_id?: string;
          wrapped_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'keys_envelopes_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      orgs: {
        Row: {
          created_at: string;
          default_llm_base_url: string | null;
          default_llm_model: string;
          default_llm_provider: string;
          id: string;
          kdf_params: Json;
          llm_daily_budget_cents: number;
          name: string;
          shopify_store_url: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_llm_base_url?: string | null;
          default_llm_model?: string;
          default_llm_provider?: string;
          id?: string;
          kdf_params?: Json;
          llm_daily_budget_cents?: number;
          name: string;
          shopify_store_url?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_llm_base_url?: string | null;
          default_llm_model?: string;
          default_llm_provider?: string;
          id?: string;
          kdf_params?: Json;
          llm_daily_budget_cents?: number;
          name?: string;
          shopify_store_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_findings: {
        Row: {
          alt_count: number;
          available_for_sale: boolean | null;
          barcode_count: number | null;
          collection_count: number;
          collection_titles: string[];
          compare_at_price: number | null;
          cost_cad: number | null;
          created_at: string;
          description_words: number | null;
          flag_categories: Json;
          flag_codes: string[];
          flags: Json;
          handle: string;
          has_barcode: boolean | null;
          has_sku: boolean | null;
          id: string;
          image_count: number;
          intent_id: string;
          is_gift_card: boolean | null;
          margin_cad: number | null;
          margin_pct: number | null;
          online_store_url: string | null;
          org_id: string;
          price: number | null;
          product_created_at: string | null;
          product_id: string;
          product_type: string | null;
          product_updated_at: string | null;
          published_at: string | null;
          red_flags: number;
          requires_shipping: boolean | null;
          seo_description_length: number | null;
          seo_title_length: number | null;
          sku_count: number | null;
          status: string | null;
          superseded_at: string | null;
          tag_count: number | null;
          tags: string[];
          title: string;
          title_length: number | null;
          total_inventory: number | null;
          tracks_inventory: boolean | null;
          variant_count: number;
          vendor: string | null;
          yellow_flags: number;
        };
        Insert: {
          alt_count?: number;
          available_for_sale?: boolean | null;
          barcode_count?: number | null;
          collection_count?: number;
          collection_titles?: string[];
          compare_at_price?: number | null;
          cost_cad?: number | null;
          created_at?: string;
          description_words?: number | null;
          flag_categories?: Json;
          flag_codes?: string[];
          flags?: Json;
          handle: string;
          has_barcode?: boolean | null;
          has_sku?: boolean | null;
          id?: string;
          image_count?: number;
          intent_id: string;
          is_gift_card?: boolean | null;
          margin_cad?: number | null;
          margin_pct?: number | null;
          online_store_url?: string | null;
          org_id: string;
          price?: number | null;
          product_created_at?: string | null;
          product_id: string;
          product_type?: string | null;
          product_updated_at?: string | null;
          published_at?: string | null;
          red_flags?: number;
          requires_shipping?: boolean | null;
          seo_description_length?: number | null;
          seo_title_length?: number | null;
          sku_count?: number | null;
          status?: string | null;
          superseded_at?: string | null;
          tag_count?: number | null;
          tags?: string[];
          title: string;
          title_length?: number | null;
          total_inventory?: number | null;
          tracks_inventory?: boolean | null;
          variant_count?: number;
          vendor?: string | null;
          yellow_flags?: number;
        };
        Update: {
          alt_count?: number;
          available_for_sale?: boolean | null;
          barcode_count?: number | null;
          collection_count?: number;
          collection_titles?: string[];
          compare_at_price?: number | null;
          cost_cad?: number | null;
          created_at?: string;
          description_words?: number | null;
          flag_categories?: Json;
          flag_codes?: string[];
          flags?: Json;
          handle?: string;
          has_barcode?: boolean | null;
          has_sku?: boolean | null;
          id?: string;
          image_count?: number;
          intent_id?: string;
          is_gift_card?: boolean | null;
          margin_cad?: number | null;
          margin_pct?: number | null;
          online_store_url?: string | null;
          org_id?: string;
          price?: number | null;
          product_created_at?: string | null;
          product_id?: string;
          product_type?: string | null;
          product_updated_at?: string | null;
          published_at?: string | null;
          red_flags?: number;
          requires_shipping?: boolean | null;
          seo_description_length?: number | null;
          seo_title_length?: number | null;
          sku_count?: number | null;
          status?: string | null;
          superseded_at?: string | null;
          tag_count?: number | null;
          tags?: string[];
          title?: string;
          title_length?: number | null;
          total_inventory?: number | null;
          tracks_inventory?: boolean | null;
          variant_count?: number;
          vendor?: string | null;
          yellow_flags?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'product_findings_intent_id_fkey';
            columns: ['intent_id'];
            isOneToOne: false;
            referencedRelation: 'intents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_findings_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limits: {
        Row: {
          bucket: string;
          id: string;
          org_id: string;
          refilled_at: string;
          tokens: number;
          user_id: string;
        };
        Insert: {
          bucket: string;
          id?: string;
          org_id: string;
          refilled_at?: string;
          tokens?: number;
          user_id: string;
        };
        Update: {
          bucket?: string;
          id?: string;
          org_id?: string;
          refilled_at?: string;
          tokens?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rate_limits_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          executive_summary: string;
          finding_count: number;
          first_sale_plan: Json | null;
          generated_at: string;
          generated_by: string;
          id: string;
          intent_id: string;
          org_id: string;
          sprint_recommendation: string;
        };
        Insert: {
          executive_summary: string;
          finding_count?: number;
          first_sale_plan?: Json | null;
          generated_at?: string;
          generated_by: string;
          id?: string;
          intent_id: string;
          org_id: string;
          sprint_recommendation: string;
        };
        Update: {
          executive_summary?: string;
          finding_count?: number;
          first_sale_plan?: Json | null;
          generated_at?: string;
          generated_by?: string;
          id?: string;
          intent_id?: string;
          org_id?: string;
          sprint_recommendation?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_intent_id_fkey';
            columns: ['intent_id'];
            isOneToOne: true;
            referencedRelation: 'intents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      sources: {
        Row: {
          captured_at: string;
          id: string;
          intent_id: string | null;
          metadata: Json;
          org_id: string;
          platform: string;
          raw_html_path: string | null;
          raw_markdown: string | null;
          url: string;
          url_hash: string;
        };
        Insert: {
          captured_at?: string;
          id?: string;
          intent_id?: string | null;
          metadata?: Json;
          org_id: string;
          platform: string;
          raw_html_path?: string | null;
          raw_markdown?: string | null;
          url: string;
          url_hash: string;
        };
        Update: {
          captured_at?: string;
          id?: string;
          intent_id?: string | null;
          metadata?: Json;
          org_id?: string;
          platform?: string;
          raw_html_path?: string | null;
          raw_markdown?: string | null;
          url?: string;
          url_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sources_intent_id_fkey';
            columns: ['intent_id'];
            isOneToOne: false;
            referencedRelation: 'intents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sources_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      store_profiles: {
        Row: {
          collection_count: number | null;
          created_at: string;
          currency: string | null;
          id: string;
          last_analyzed_at: string | null;
          latest_intent_id: string | null;
          latest_report_id: string | null;
          latest_score: number | null;
          org_id: string;
          product_count: number | null;
          store_name: string | null;
          updated_at: string;
          url: string;
          url_hash: string;
        };
        Insert: {
          collection_count?: number | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          last_analyzed_at?: string | null;
          latest_intent_id?: string | null;
          latest_report_id?: string | null;
          latest_score?: number | null;
          org_id: string;
          product_count?: number | null;
          store_name?: string | null;
          updated_at?: string;
          url: string;
          url_hash: string;
        };
        Update: {
          collection_count?: number | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          last_analyzed_at?: string | null;
          latest_intent_id?: string | null;
          latest_report_id?: string | null;
          latest_score?: number | null;
          org_id?: string;
          product_count?: number | null;
          store_name?: string | null;
          updated_at?: string;
          url?: string;
          url_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_profiles_latest_intent_id_fkey';
            columns: ['latest_intent_id'];
            isOneToOne: false;
            referencedRelation: 'intents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_profiles_latest_report_id_fkey';
            columns: ['latest_report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_profiles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      app_fingerprints: {
        Row: {
          app_handle: string;
          app_title: string;
          category: string;
          detection_source: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          org_id: string;
          seen_count: number;
          shop_domain: string;
        };
        Insert: {
          app_handle: string;
          app_title: string;
          category: string;
          detection_source: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          org_id: string;
          seen_count?: number;
          shop_domain: string;
        };
        Update: {
          app_handle?: string;
          app_title?: string;
          category?: string;
          detection_source?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          org_id?: string;
          seen_count?: number;
          shop_domain?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'app_fingerprints_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
      score_history: {
        Row: {
          captured_at: string;
          category_scores: Json;
          critical_count: number;
          finding_count: number;
          grade: string;
          high_count: number;
          id: string;
          intent_id: string;
          low_count: number;
          medium_count: number;
          org_id: string;
          rubric_version: string;
          shop_domain: string;
          total_score: number;
        };
        Insert: {
          captured_at?: string;
          category_scores?: Json;
          critical_count?: number;
          finding_count?: number;
          grade: string;
          high_count?: number;
          id?: string;
          intent_id: string;
          low_count?: number;
          medium_count?: number;
          org_id: string;
          rubric_version?: string;
          shop_domain: string;
          total_score: number;
        };
        Update: {
          captured_at?: string;
          category_scores?: Json;
          critical_count?: number;
          finding_count?: number;
          grade?: string;
          high_count?: number;
          id?: string;
          intent_id?: string;
          low_count?: number;
          medium_count?: number;
          org_id?: string;
          rubric_version?: string;
          shop_domain?: string;
          total_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'score_history_intent_id_fkey';
            columns: ['intent_id'];
            isOneToOne: true;
            referencedRelation: 'intents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'score_history_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'orgs';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      archive_message: {
        Args: { p_msg_id: number; p_queue_name: string };
        Returns: undefined;
      };
      current_org_ids: { Args: never; Returns: string[] };
      dequeue_message: { Args: { p_queue_name: string }; Returns: Json };
      enqueue_message: {
        Args: { p_message: Json; p_queue_name: string };
        Returns: number;
      };
      enqueue_weekly_audit: { Args: never; Returns: undefined };
      invoke_edge_function: {
        Args: { p_function_name: string };
        Returns: undefined;
      };
      is_member_of: { Args: { _org_id: string }; Returns: boolean };
      rate_limit_take: {
        Args: {
          p_bucket: string;
          p_capacity: number;
          p_org_id: string;
          p_refill_per_second: number;
          p_user_id: string;
        };
        Returns: {
          allowed: boolean;
          remaining: number;
          retry_after_seconds: number;
        }[];
      };
      supersede_store_insights: {
        Args: {
          p_exclude_intent: string;
          p_input_hash: string;
          p_org_id: string;
        };
        Returns: undefined;
      };
      unwrap_dek: { Args: { p_wrapped: string }; Returns: string };
      upsert_app_fingerprint: {
        Args: {
          p_app_handle: string;
          p_app_title: string;
          p_category: string;
          p_detection_source: string;
          p_org_id: string;
          p_shop_domain: string;
        };
        Returns: number;
      };
      wrap_dek: { Args: { p_dek: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
