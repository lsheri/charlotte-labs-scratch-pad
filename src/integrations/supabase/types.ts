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
      admin_access_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_resource: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_resource?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_resource?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_receipt_decisions: {
        Row: {
          action: string
          admin_user_id: string
          after_value: Json | null
          before_value: Json | null
          created_at: string
          id: string
          note: string | null
          receipt_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          note?: string | null
          receipt_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          note?: string | null
          receipt_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          ai_summary: string | null
          captured_at: string
          created_at: string
          id: string
          participant_id: string
          prompt_text: string
          raw_payload: Json | null
          session_id: string
          source: string
          thread_id: string | null
          title: string | null
          tool: string
          transcript_hash: string | null
          url: string | null
        }
        Insert: {
          ai_summary?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          participant_id: string
          prompt_text: string
          raw_payload?: Json | null
          session_id: string
          source?: string
          thread_id?: string | null
          title?: string | null
          tool: string
          transcript_hash?: string | null
          url?: string | null
        }
        Update: {
          ai_summary?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          participant_id?: string
          prompt_text?: string
          raw_payload?: Json | null
          session_id?: string
          source?: string
          thread_id?: string | null
          title?: string | null
          tool?: string
          transcript_hash?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_events: {
        Row: {
          attempts: number | null
          created_at: string
          error_message: string | null
          http_status: number | null
          id: string
          label: string
          latency_ms: number | null
          model: string | null
          participant_id: string | null
          provider: string
          receipt_id: string | null
          status: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          label: string
          latency_ms?: number | null
          model?: string | null
          participant_id?: string | null
          provider: string
          receipt_id?: string | null
          status: string
        }
        Update: {
          attempts?: number | null
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          label?: string
          latency_ms?: number | null
          model?: string | null
          participant_id?: string | null
          provider?: string
          receipt_id?: string | null
          status?: string
        }
        Relationships: []
      }
      analysis_events: {
        Row: {
          created_at: string
          event_type: string
          evidence_quote: string | null
          id: string
          inferred: boolean
          receipt_id: string
          token_count: number | null
          ts: string | null
          turn_index: number
        }
        Insert: {
          created_at?: string
          event_type: string
          evidence_quote?: string | null
          id?: string
          inferred?: boolean
          receipt_id: string
          token_count?: number | null
          ts?: string | null
          turn_index: number
        }
        Update: {
          created_at?: string
          event_type?: string
          evidence_quote?: string | null
          id?: string
          inferred?: boolean
          receipt_id?: string
          token_count?: number | null
          ts?: string | null
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "analysis_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_library: {
        Row: {
          active: boolean
          behavior_code: string
          behavior_id: string
          behavior_label: string
          created_at: string
          detection_rules: string | null
          dimension_id: string
          framework_origin: Database["public"]["Enums"]["framework_origin_enum"]
          reflection_prompts: Json | null
          source_id: string
        }
        Insert: {
          active?: boolean
          behavior_code: string
          behavior_id?: string
          behavior_label: string
          created_at?: string
          detection_rules?: string | null
          dimension_id: string
          framework_origin: Database["public"]["Enums"]["framework_origin_enum"]
          reflection_prompts?: Json | null
          source_id: string
        }
        Update: {
          active?: boolean
          behavior_code?: string
          behavior_id?: string
          behavior_label?: string
          created_at?: string
          detection_rules?: string | null
          dimension_id?: string
          framework_origin?: Database["public"]["Enums"]["framework_origin_enum"]
          reflection_prompts?: Json | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_library_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimension_registry"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "behavior_library_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "framework_sources"
            referencedColumns: ["source_id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          first_captured_at: string
          id: string
          last_captured_at: string
          last_summarized_turn_count: number
          last_url: string | null
          participant_id: string
          session_id: string
          summary: string | null
          summary_generated_at: string | null
          summary_refresh_count_today: number
          summary_refresh_day: string | null
          thread_key: string
          title: string | null
          tool: string
          turn_count: number
        }
        Insert: {
          created_at?: string
          first_captured_at?: string
          id?: string
          last_captured_at?: string
          last_summarized_turn_count?: number
          last_url?: string | null
          participant_id: string
          session_id: string
          summary?: string | null
          summary_generated_at?: string | null
          summary_refresh_count_today?: number
          summary_refresh_day?: string | null
          thread_key: string
          title?: string | null
          tool: string
          turn_count?: number
        }
        Update: {
          created_at?: string
          first_captured_at?: string
          id?: string
          last_captured_at?: string
          last_summarized_turn_count?: number
          last_url?: string | null
          participant_id?: string
          session_id?: string
          summary?: string | null
          summary_generated_at?: string | null
          summary_refresh_count_today?: number
          summary_refresh_day?: string | null
          thread_key?: string
          title?: string | null
          tool?: string
          turn_count?: number
        }
        Relationships: []
      }
      checkup_cache: {
        Row: {
          created_at: string
          expires_at: string
          payload: Json
          receipts_fingerprint: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          payload: Json
          receipts_fingerprint: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          payload?: Json
          receipts_fingerprint?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_turns: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          idx: number
          pause_before_ms: number | null
          role: string
          sent_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          idx: number
          pause_before_ms?: number | null
          role: string
          sent_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          idx?: number
          pause_before_ms?: number | null
          role?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_turns_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_heartbeats: {
        Row: {
          job_name: string
          last_payload: Json
          last_run_at: string
          last_status: string
          updated_at: string
        }
        Insert: {
          job_name: string
          last_payload?: Json
          last_run_at?: string
          last_status?: string
          updated_at?: string
        }
        Update: {
          job_name?: string
          last_payload?: Json
          last_run_at?: string
          last_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crosswalk_mappings: {
        Row: {
          confidence: number
          created_at: string
          from_dimension_id: string
          mapping_id: string
          notes: string | null
          source_id: string
          to_framework: Database["public"]["Enums"]["framework_origin_enum"]
          to_term: string
          to_term_level: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          from_dimension_id: string
          mapping_id?: string
          notes?: string | null
          source_id: string
          to_framework: Database["public"]["Enums"]["framework_origin_enum"]
          to_term: string
          to_term_level?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          from_dimension_id?: string
          mapping_id?: string
          notes?: string | null
          source_id?: string
          to_framework?: Database["public"]["Enums"]["framework_origin_enum"]
          to_term?: string
          to_term_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crosswalk_mappings_from_dimension_id_fkey"
            columns: ["from_dimension_id"]
            isOneToOne: false
            referencedRelation: "dimension_registry"
            referencedColumns: ["dimension_id"]
          },
          {
            foreignKeyName: "crosswalk_mappings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "framework_sources"
            referencedColumns: ["source_id"]
          },
        ]
      }
      dimension_construct_map: {
        Row: {
          construct_id: string
          construct_name: string
          dimension_canonical_name: string
          id: string
          is_inverse: boolean
          role: string
          v1_status: string
          weight: number
        }
        Insert: {
          construct_id: string
          construct_name: string
          dimension_canonical_name: string
          id?: string
          is_inverse?: boolean
          role: string
          v1_status: string
          weight?: number
        }
        Update: {
          construct_id?: string
          construct_name?: string
          dimension_canonical_name?: string
          id?: string
          is_inverse?: boolean
          role?: string
          v1_status?: string
          weight?: number
        }
        Relationships: []
      }
      dimension_registry: {
        Row: {
          active: boolean
          canonical_name: string
          category: Database["public"]["Enums"]["dimension_category_enum"]
          created_at: string
          description: string | null
          dimension_id: string
          display_name: string
          priority_rank: number
          source_ids: string[]
        }
        Insert: {
          active?: boolean
          canonical_name: string
          category: Database["public"]["Enums"]["dimension_category_enum"]
          created_at?: string
          description?: string | null
          dimension_id?: string
          display_name: string
          priority_rank?: number
          source_ids?: string[]
        }
        Update: {
          active?: boolean
          canonical_name?: string
          category?: Database["public"]["Enums"]["dimension_category_enum"]
          created_at?: string
          description?: string | null
          dimension_id?: string
          display_name?: string
          priority_rank?: number
          source_ids?: string[]
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
      extension_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          participant_id: string
          revoked: boolean
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          participant_id: string
          revoked?: boolean
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          participant_id?: string
          revoked?: boolean
          token?: string
        }
        Relationships: []
      }
      fluency_analysis_runs: {
        Row: {
          analysis_output_json: Json
          consent_source: string | null
          created_at: string
          created_by_user_id: string | null
          input_type: Database["public"]["Enums"]["input_type_enum"]
          overall_confidence: number | null
          participant_id: string
          privacy_flags: Json | null
          raw_transcript: string | null
          receipt_id: string | null
          receipt_profile: string
          rubric_version: string
          run_id: string
          session_id: string
          subject_type: string
          tool_metadata: Json | null
          transcript_consent: boolean
          transcript_hash: string | null
        }
        Insert: {
          analysis_output_json?: Json
          consent_source?: string | null
          created_at?: string
          created_by_user_id?: string | null
          input_type?: Database["public"]["Enums"]["input_type_enum"]
          overall_confidence?: number | null
          participant_id: string
          privacy_flags?: Json | null
          raw_transcript?: string | null
          receipt_id?: string | null
          receipt_profile?: string
          rubric_version?: string
          run_id?: string
          session_id: string
          subject_type?: string
          tool_metadata?: Json | null
          transcript_consent?: boolean
          transcript_hash?: string | null
        }
        Update: {
          analysis_output_json?: Json
          consent_source?: string | null
          created_at?: string
          created_by_user_id?: string | null
          input_type?: Database["public"]["Enums"]["input_type_enum"]
          overall_confidence?: number | null
          participant_id?: string
          privacy_flags?: Json | null
          raw_transcript?: string | null
          receipt_id?: string | null
          receipt_profile?: string
          rubric_version?: string
          run_id?: string
          session_id?: string
          subject_type?: string
          tool_metadata?: Json | null
          transcript_consent?: boolean
          transcript_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fluency_analysis_runs_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluency_analysis_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fluency_chunk_results: {
        Row: {
          analysis_json: Json | null
          attempt: number
          chunk_idx: number
          chunk_total: number
          created_at: string
          id: string
          job_id: string
          summary_text: string | null
        }
        Insert: {
          analysis_json?: Json | null
          attempt?: number
          chunk_idx: number
          chunk_total: number
          created_at?: string
          id?: string
          job_id: string
          summary_text?: string | null
        }
        Update: {
          analysis_json?: Json | null
          attempt?: number
          chunk_idx?: number
          chunk_total?: number
          created_at?: string
          id?: string
          job_id?: string
          summary_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fluency_chunk_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "receipt_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      fluency_receipts: {
        Row: {
          citations: Json | null
          created_at: string
          receipt_id: string
          redaction_level: Database["public"]["Enums"]["redaction_level_enum"]
          rendered_json: Json | null
          rendered_summary: string | null
          run_id: string
        }
        Insert: {
          citations?: Json | null
          created_at?: string
          receipt_id?: string
          redaction_level?: Database["public"]["Enums"]["redaction_level_enum"]
          rendered_json?: Json | null
          rendered_summary?: string | null
          run_id: string
        }
        Update: {
          citations?: Json | null
          created_at?: string
          receipt_id?: string
          redaction_level?: Database["public"]["Enums"]["redaction_level_enum"]
          rendered_json?: Json | null
          rendered_summary?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluency_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fluency_analysis_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      framework_sources: {
        Row: {
          active: boolean
          content_hash: string | null
          content_snapshot_text: string | null
          created_at: string
          name: string
          notes: string | null
          organization: string
          retrieved_at: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["source_type_enum"]
          url: string
          version_label: string | null
        }
        Insert: {
          active?: boolean
          content_hash?: string | null
          content_snapshot_text?: string | null
          created_at?: string
          name: string
          notes?: string | null
          organization: string
          retrieved_at?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["source_type_enum"]
          url: string
          version_label?: string | null
        }
        Update: {
          active?: boolean
          content_hash?: string | null
          content_snapshot_text?: string | null
          created_at?: string
          name?: string
          notes?: string | null
          organization?: string
          retrieved_at?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["source_type_enum"]
          url?: string
          version_label?: string | null
        }
        Relationships: []
      }
      participant_baseline: {
        Row: {
          c1_quiz_completed_at: string | null
          c1_quiz_tier: string | null
          c1_quiz_total: number | null
          created_at: string
          discipline: string | null
          id: string
          participant_id: string
          prior_ai_tool_use: string | null
          session_id: string
          year_of_study: number | null
        }
        Insert: {
          c1_quiz_completed_at?: string | null
          c1_quiz_tier?: string | null
          c1_quiz_total?: number | null
          created_at?: string
          discipline?: string | null
          id?: string
          participant_id: string
          prior_ai_tool_use?: string | null
          session_id: string
          year_of_study?: number | null
        }
        Update: {
          c1_quiz_completed_at?: string | null
          c1_quiz_tier?: string | null
          c1_quiz_total?: number | null
          created_at?: string
          discipline?: string | null
          id?: string
          participant_id?: string
          prior_ai_tool_use?: string | null
          session_id?: string
          year_of_study?: number | null
        }
        Relationships: []
      }
      participant_fluency_history: {
        Row: {
          created_at: string
          delegation_confidence: number | null
          delegation_score_profile: number | null
          development_confidence: number | null
          development_score_profile: number | null
          direction_confidence: number | null
          direction_score_profile: number | null
          discernment_confidence: number | null
          discernment_score_profile: number | null
          efficiency_confidence: number | null
          efficiency_score_profile: number | null
          ethics_confidence: number | null
          ethics_score_profile: number | null
          id: string
          participant_id: string
          provenance: string | null
          receipt_count_total: number
          receipt_id: string
          rubric_version: string
          session_id: string
          strategic_agency_confidence: number | null
          strategic_agency_score_profile: number | null
          term_id: string
        }
        Insert: {
          created_at?: string
          delegation_confidence?: number | null
          delegation_score_profile?: number | null
          development_confidence?: number | null
          development_score_profile?: number | null
          direction_confidence?: number | null
          direction_score_profile?: number | null
          discernment_confidence?: number | null
          discernment_score_profile?: number | null
          efficiency_confidence?: number | null
          efficiency_score_profile?: number | null
          ethics_confidence?: number | null
          ethics_score_profile?: number | null
          id?: string
          participant_id: string
          provenance?: string | null
          receipt_count_total?: number
          receipt_id: string
          rubric_version?: string
          session_id: string
          strategic_agency_confidence?: number | null
          strategic_agency_score_profile?: number | null
          term_id: string
        }
        Update: {
          created_at?: string
          delegation_confidence?: number | null
          delegation_score_profile?: number | null
          development_confidence?: number | null
          development_score_profile?: number | null
          direction_confidence?: number | null
          direction_score_profile?: number | null
          discernment_confidence?: number | null
          discernment_score_profile?: number | null
          efficiency_confidence?: number | null
          efficiency_score_profile?: number | null
          ethics_confidence?: number | null
          ethics_score_profile?: number | null
          id?: string
          participant_id?: string
          provenance?: string | null
          receipt_count_total?: number
          receipt_id?: string
          rubric_version?: string
          session_id?: string
          strategic_agency_confidence?: number | null
          strategic_agency_score_profile?: number | null
          term_id?: string
        }
        Relationships: []
      }
      participant_fluency_profiles: {
        Row: {
          capital_stewardship_score_term: number | null
          created_at: string
          delegation_confidence: number | null
          delegation_score_profile: number | null
          delegation_score_term: number | null
          development_confidence: number | null
          development_score_profile: number | null
          development_score_term: number | null
          direction_confidence: number | null
          direction_score_profile: number | null
          direction_score_term: number | null
          discernment_confidence: number | null
          discernment_score_profile: number | null
          discernment_score_term: number | null
          efficiency_confidence: number | null
          efficiency_score_profile: number | null
          efficiency_score_term: number | null
          ethics_confidence: number | null
          ethics_score_profile: number | null
          ethics_score_term: number | null
          id: string
          last_receipt_id: string | null
          last_updated_at: string
          participant_id: string
          receipt_count_term: number
          receipt_count_total: number
          session_id: string
          strategic_agency_confidence: number | null
          strategic_agency_score_profile: number | null
          strategic_agency_score_term: number | null
          term_id: string
        }
        Insert: {
          capital_stewardship_score_term?: number | null
          created_at?: string
          delegation_confidence?: number | null
          delegation_score_profile?: number | null
          delegation_score_term?: number | null
          development_confidence?: number | null
          development_score_profile?: number | null
          development_score_term?: number | null
          direction_confidence?: number | null
          direction_score_profile?: number | null
          direction_score_term?: number | null
          discernment_confidence?: number | null
          discernment_score_profile?: number | null
          discernment_score_term?: number | null
          efficiency_confidence?: number | null
          efficiency_score_profile?: number | null
          efficiency_score_term?: number | null
          ethics_confidence?: number | null
          ethics_score_profile?: number | null
          ethics_score_term?: number | null
          id?: string
          last_receipt_id?: string | null
          last_updated_at?: string
          participant_id: string
          receipt_count_term?: number
          receipt_count_total?: number
          session_id: string
          strategic_agency_confidence?: number | null
          strategic_agency_score_profile?: number | null
          strategic_agency_score_term?: number | null
          term_id: string
        }
        Update: {
          capital_stewardship_score_term?: number | null
          created_at?: string
          delegation_confidence?: number | null
          delegation_score_profile?: number | null
          delegation_score_term?: number | null
          development_confidence?: number | null
          development_score_profile?: number | null
          development_score_term?: number | null
          direction_confidence?: number | null
          direction_score_profile?: number | null
          direction_score_term?: number | null
          discernment_confidence?: number | null
          discernment_score_profile?: number | null
          discernment_score_term?: number | null
          efficiency_confidence?: number | null
          efficiency_score_profile?: number | null
          efficiency_score_term?: number | null
          ethics_confidence?: number | null
          ethics_score_profile?: number | null
          ethics_score_term?: number | null
          id?: string
          last_receipt_id?: string | null
          last_updated_at?: string
          participant_id?: string
          receipt_count_term?: number
          receipt_count_total?: number
          session_id?: string
          strategic_agency_confidence?: number | null
          strategic_agency_score_profile?: number | null
          strategic_agency_score_term?: number | null
          term_id?: string
        }
        Relationships: []
      }
      participant_tool_history: {
        Row: {
          created_at: string
          first_use_date: string | null
          id: string
          is_established: boolean
          participant_id: string
          receipt_count: number
          session_count: number
          tool: Database["public"]["Enums"]["tool_id_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_use_date?: string | null
          id?: string
          is_established?: boolean
          participant_id: string
          receipt_count?: number
          session_count?: number
          tool: Database["public"]["Enums"]["tool_id_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_use_date?: string | null
          id?: string
          is_established?: boolean
          participant_id?: string
          receipt_count?: number
          session_count?: number
          tool?: Database["public"]["Enums"]["tool_id_enum"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          organization: string | null
          template_picker_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          organization?: string | null
          template_picker_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization?: string | null
          template_picker_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      prompt_chains: {
        Row: {
          avg_structure_score: number | null
          chain_type: string | null
          created_at: string
          first_occurrence_for_participant: boolean | null
          id: string
          max_semantic_drift: number | null
          participant_id: string
          prompt_count: number | null
          prompt_feature_ids: string[] | null
          receipt_id: string | null
          resolution_type: string | null
          session_id: string | null
          span_ms: number | null
          structure_score_trend: string | null
          thread_id: string | null
          tool: Database["public"]["Enums"]["tool_id_enum"] | null
          turn_ids: string[] | null
        }
        Insert: {
          avg_structure_score?: number | null
          chain_type?: string | null
          created_at?: string
          first_occurrence_for_participant?: boolean | null
          id?: string
          max_semantic_drift?: number | null
          participant_id: string
          prompt_count?: number | null
          prompt_feature_ids?: string[] | null
          receipt_id?: string | null
          resolution_type?: string | null
          session_id?: string | null
          span_ms?: number | null
          structure_score_trend?: string | null
          thread_id?: string | null
          tool?: Database["public"]["Enums"]["tool_id_enum"] | null
          turn_ids?: string[] | null
        }
        Update: {
          avg_structure_score?: number | null
          chain_type?: string | null
          created_at?: string
          first_occurrence_for_participant?: boolean | null
          id?: string
          max_semantic_drift?: number | null
          participant_id?: string
          prompt_count?: number | null
          prompt_feature_ids?: string[] | null
          receipt_id?: string | null
          resolution_type?: string | null
          session_id?: string | null
          span_ms?: number | null
          structure_score_trend?: string | null
          thread_id?: string | null
          tool?: Database["public"]["Enums"]["tool_id_enum"] | null
          turn_ids?: string[] | null
        }
        Relationships: []
      }
      prompt_features: {
        Row: {
          c10_clarification_detected: boolean | null
          c11_planning_element_score: number | null
          c12_synthesis_detected: boolean | null
          c14_attribution_detected: boolean | null
          c16_meta_prompt_detected: boolean | null
          c3_exemplar_detected: boolean | null
          c3_format_spec_detected: boolean | null
          c3_goal_clarity_score: number | null
          c4_collaboration_term_detected: boolean | null
          c4_role_directive_detected: boolean | null
          c4_settings_toggle_count: number | null
          c5_challenge_detected: boolean | null
          chain_id: string | null
          chain_position: number | null
          chain_type: string | null
          char_length: number | null
          created_at: string
          id: string
          is_first_prompt_in_session: boolean | null
          is_first_substantive_prompt: boolean | null
          is_last_three_prompts: boolean | null
          is_personal_context: boolean | null
          meta_prompt_type: string | null
          participant_id: string
          prior_assistant_turn_id: string | null
          prompt_position: number | null
          receipt_id: string | null
          semantic_drift_from_prior: number | null
          sent_at: string | null
          session_id: string | null
          template_suspected: boolean | null
          thread_id: string | null
          tool: Database["public"]["Enums"]["tool_id_enum"] | null
          turn_id: string | null
          word_count: number | null
        }
        Insert: {
          c10_clarification_detected?: boolean | null
          c11_planning_element_score?: number | null
          c12_synthesis_detected?: boolean | null
          c14_attribution_detected?: boolean | null
          c16_meta_prompt_detected?: boolean | null
          c3_exemplar_detected?: boolean | null
          c3_format_spec_detected?: boolean | null
          c3_goal_clarity_score?: number | null
          c4_collaboration_term_detected?: boolean | null
          c4_role_directive_detected?: boolean | null
          c4_settings_toggle_count?: number | null
          c5_challenge_detected?: boolean | null
          chain_id?: string | null
          chain_position?: number | null
          chain_type?: string | null
          char_length?: number | null
          created_at?: string
          id?: string
          is_first_prompt_in_session?: boolean | null
          is_first_substantive_prompt?: boolean | null
          is_last_three_prompts?: boolean | null
          is_personal_context?: boolean | null
          meta_prompt_type?: string | null
          participant_id: string
          prior_assistant_turn_id?: string | null
          prompt_position?: number | null
          receipt_id?: string | null
          semantic_drift_from_prior?: number | null
          sent_at?: string | null
          session_id?: string | null
          template_suspected?: boolean | null
          thread_id?: string | null
          tool?: Database["public"]["Enums"]["tool_id_enum"] | null
          turn_id?: string | null
          word_count?: number | null
        }
        Update: {
          c10_clarification_detected?: boolean | null
          c11_planning_element_score?: number | null
          c12_synthesis_detected?: boolean | null
          c14_attribution_detected?: boolean | null
          c16_meta_prompt_detected?: boolean | null
          c3_exemplar_detected?: boolean | null
          c3_format_spec_detected?: boolean | null
          c3_goal_clarity_score?: number | null
          c4_collaboration_term_detected?: boolean | null
          c4_role_directive_detected?: boolean | null
          c4_settings_toggle_count?: number | null
          c5_challenge_detected?: boolean | null
          chain_id?: string | null
          chain_position?: number | null
          chain_type?: string | null
          char_length?: number | null
          created_at?: string
          id?: string
          is_first_prompt_in_session?: boolean | null
          is_first_substantive_prompt?: boolean | null
          is_last_three_prompts?: boolean | null
          is_personal_context?: boolean | null
          meta_prompt_type?: string | null
          participant_id?: string
          prior_assistant_turn_id?: string | null
          prompt_position?: number | null
          receipt_id?: string | null
          semantic_drift_from_prior?: number | null
          sent_at?: string | null
          session_id?: string | null
          template_suspected?: boolean | null
          thread_id?: string | null
          tool?: Database["public"]["Enums"]["tool_id_enum"] | null
          turn_id?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_features_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "conversation_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_checklist_items: {
        Row: {
          created_at: string
          id: string
          item_key: string
          note: string | null
          receipt_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["checklist_item_status"]
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_key: string
          note?: string | null
          receipt_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["checklist_item_status"]
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_key?: string
          note?: string | null
          receipt_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["checklist_item_status"]
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_checklist_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_checkup_cache: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          payload: Json
          receipt_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint: string
          payload: Json
          receipt_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint?: string
          payload?: Json
          receipt_id?: string
        }
        Relationships: []
      }
      receipt_construct_signals: {
        Row: {
          c10_clarification_count: number | null
          c10_clarification_rate: number | null
          c10_extended_pause_rate: number | null
          c11_insufficient: boolean | null
          c11_mean_structure_score: number | null
          c12_receipt_reflection_count: number | null
          c12_synthesis_rate: number | null
          c14_attribution_rate: number | null
          c16_meta_count: number | null
          c16_meta_rate: number | null
          c3_avg_goal_clarity: number | null
          c3_exemplar_rate: number | null
          c3_format_spec_rate: number | null
          c3_insufficient: boolean | null
          c3_iteration_rate: number | null
          c3_structure_trend: string | null
          c4_collaboration_term_count: number | null
          c4_role_directive_count: number | null
          c4_role_directive_rate: number | null
          c4_settings_toggle_count: number | null
          c5_challenge_count: number | null
          c5_challenge_rate: number | null
          c9_tool_is_new: boolean | null
          c9_tools_used_count: number | null
          challenge_chain_count: number | null
          created_at: string
          dominant_chain_type: string | null
          id: string
          loop_chain_count: number | null
          participant_id: string
          pivot_chain_count: number | null
          prerequisite_missing: boolean | null
          receipt_id: string
          refinement_chain_count: number | null
          session_duration_ms: number | null
          session_id: string | null
          task_type: Database["public"]["Enums"]["task_type_enum"] | null
          tool: Database["public"]["Enums"]["tool_id_enum"] | null
          total_chain_count: number | null
          total_prompt_count: number | null
        }
        Insert: {
          c10_clarification_count?: number | null
          c10_clarification_rate?: number | null
          c10_extended_pause_rate?: number | null
          c11_insufficient?: boolean | null
          c11_mean_structure_score?: number | null
          c12_receipt_reflection_count?: number | null
          c12_synthesis_rate?: number | null
          c14_attribution_rate?: number | null
          c16_meta_count?: number | null
          c16_meta_rate?: number | null
          c3_avg_goal_clarity?: number | null
          c3_exemplar_rate?: number | null
          c3_format_spec_rate?: number | null
          c3_insufficient?: boolean | null
          c3_iteration_rate?: number | null
          c3_structure_trend?: string | null
          c4_collaboration_term_count?: number | null
          c4_role_directive_count?: number | null
          c4_role_directive_rate?: number | null
          c4_settings_toggle_count?: number | null
          c5_challenge_count?: number | null
          c5_challenge_rate?: number | null
          c9_tool_is_new?: boolean | null
          c9_tools_used_count?: number | null
          challenge_chain_count?: number | null
          created_at?: string
          dominant_chain_type?: string | null
          id?: string
          loop_chain_count?: number | null
          participant_id: string
          pivot_chain_count?: number | null
          prerequisite_missing?: boolean | null
          receipt_id: string
          refinement_chain_count?: number | null
          session_duration_ms?: number | null
          session_id?: string | null
          task_type?: Database["public"]["Enums"]["task_type_enum"] | null
          tool?: Database["public"]["Enums"]["tool_id_enum"] | null
          total_chain_count?: number | null
          total_prompt_count?: number | null
        }
        Update: {
          c10_clarification_count?: number | null
          c10_clarification_rate?: number | null
          c10_extended_pause_rate?: number | null
          c11_insufficient?: boolean | null
          c11_mean_structure_score?: number | null
          c12_receipt_reflection_count?: number | null
          c12_synthesis_rate?: number | null
          c14_attribution_rate?: number | null
          c16_meta_count?: number | null
          c16_meta_rate?: number | null
          c3_avg_goal_clarity?: number | null
          c3_exemplar_rate?: number | null
          c3_format_spec_rate?: number | null
          c3_insufficient?: boolean | null
          c3_iteration_rate?: number | null
          c3_structure_trend?: string | null
          c4_collaboration_term_count?: number | null
          c4_role_directive_count?: number | null
          c4_role_directive_rate?: number | null
          c4_settings_toggle_count?: number | null
          c5_challenge_count?: number | null
          c5_challenge_rate?: number | null
          c9_tool_is_new?: boolean | null
          c9_tools_used_count?: number | null
          challenge_chain_count?: number | null
          created_at?: string
          dominant_chain_type?: string | null
          id?: string
          loop_chain_count?: number | null
          participant_id?: string
          pivot_chain_count?: number | null
          prerequisite_missing?: boolean | null
          receipt_id?: string
          refinement_chain_count?: number | null
          session_duration_ms?: number | null
          session_id?: string | null
          task_type?: Database["public"]["Enums"]["task_type_enum"] | null
          tool?: Database["public"]["Enums"]["tool_id_enum"] | null
          total_chain_count?: number | null
          total_prompt_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_construct_signals_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_jobs: {
        Row: {
          attempts: number
          bucket: string | null
          chunks_done: number
          chunks_total: number | null
          created_at: string
          error: string | null
          eta_seconds: number | null
          goal: string | null
          id: string
          label: string | null
          participant_id: string
          progress_label: string | null
          provenance: string | null
          provenance_source: string | null
          purpose: string | null
          receipt_id: string | null
          recommendations_status: string
          retry_after: string | null
          stage: string
          status: string
          tags: string[] | null
          thread_ids: string[]
          updated_at: string
          workflow_type: string | null
          workflow_type_custom: string | null
          workflow_type_extras: string[]
        }
        Insert: {
          attempts?: number
          bucket?: string | null
          chunks_done?: number
          chunks_total?: number | null
          created_at?: string
          error?: string | null
          eta_seconds?: number | null
          goal?: string | null
          id?: string
          label?: string | null
          participant_id: string
          progress_label?: string | null
          provenance?: string | null
          provenance_source?: string | null
          purpose?: string | null
          receipt_id?: string | null
          recommendations_status?: string
          retry_after?: string | null
          stage?: string
          status?: string
          tags?: string[] | null
          thread_ids?: string[]
          updated_at?: string
          workflow_type?: string | null
          workflow_type_custom?: string | null
          workflow_type_extras?: string[]
        }
        Update: {
          attempts?: number
          bucket?: string | null
          chunks_done?: number
          chunks_total?: number | null
          created_at?: string
          error?: string | null
          eta_seconds?: number | null
          goal?: string | null
          id?: string
          label?: string | null
          participant_id?: string
          progress_label?: string | null
          provenance?: string | null
          provenance_source?: string | null
          purpose?: string | null
          receipt_id?: string | null
          recommendations_status?: string
          retry_after?: string | null
          stage?: string
          status?: string
          tags?: string[] | null
          thread_ids?: string[]
          updated_at?: string
          workflow_type?: string | null
          workflow_type_custom?: string | null
          workflow_type_extras?: string[]
        }
        Relationships: []
      }
      receipt_recommendations_cache: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          payload: Json
          receipt_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint: string
          payload: Json
          receipt_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint?: string
          payload?: Json
          receipt_id?: string
        }
        Relationships: []
      }
      receipt_templates: {
        Row: {
          audience: string
          best_for: string | null
          id: string
          key: string
          name: string
          phase: number
          promise: string
          sort_order: number
          status: string
        }
        Insert: {
          audience: string
          best_for?: string | null
          id?: string
          key: string
          name: string
          phase?: number
          promise: string
          sort_order?: number
          status?: string
        }
        Update: {
          audience?: string
          best_for?: string | null
          id?: string
          key?: string
          name?: string
          phase?: number
          promise?: string
          sort_order?: number
          status?: string
        }
        Relationships: []
      }
      receipt_threads: {
        Row: {
          created_at: string
          position: number
          receipt_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          position?: number
          receipt_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          position?: number
          receipt_id?: string
          thread_id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          conversation_id: string | null
          conversation_json: Json
          created_at: string
          goal: string | null
          id: string
          metadata: Json | null
          participant_id: string
          prompt_preview: string | null
          quality_passed: boolean | null
          quality_scores: Json | null
          response_preview: string | null
          session_id: string
          shared_proof: boolean
          time_spent_minutes: number | null
          tool_used: string
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          conversation_json?: Json
          created_at?: string
          goal?: string | null
          id?: string
          metadata?: Json | null
          participant_id: string
          prompt_preview?: string | null
          quality_passed?: boolean | null
          quality_scores?: Json | null
          response_preview?: string | null
          session_id: string
          shared_proof?: boolean
          time_spent_minutes?: number | null
          tool_used: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          conversation_json?: Json
          created_at?: string
          goal?: string | null
          id?: string
          metadata?: Json | null
          participant_id?: string
          prompt_preview?: string | null
          quality_passed?: boolean | null
          quality_scores?: Json | null
          response_preview?: string | null
          session_id?: string
          shared_proof?: boolean
          time_spent_minutes?: number | null
          tool_used?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      renderings: {
        Row: {
          created_at: string
          generation_ms: number | null
          id: string
          payload: Json
          receipt_id: string
          template_key: string
        }
        Insert: {
          created_at?: string
          generation_ms?: number | null
          id?: string
          payload?: Json
          receipt_id: string
          template_key: string
        }
        Update: {
          created_at?: string
          generation_ms?: number | null
          id?: string
          payload?: Json
          receipt_id?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "renderings_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sessions: {
        Row: {
          consent_text: string
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          join_code: string
          kind: string
          name: string
          researcher_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
        }
        Insert: {
          consent_text: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          join_code: string
          kind?: string
          name: string
          researcher_id: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
        }
        Update: {
          consent_text?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          join_code?: string
          kind?: string
          name?: string
          researcher_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
        }
        Relationships: []
      }
      session_participants: {
        Row: {
          consent_accepted_at: string | null
          id: string
          joined_at: string
          participant_id: string
          session_id: string
          withdrawn_at: string | null
        }
        Insert: {
          consent_accepted_at?: string | null
          id?: string
          joined_at?: string
          participant_id: string
          session_id: string
          withdrawn_at?: string | null
        }
        Update: {
          consent_accepted_at?: string | null
          id?: string
          joined_at?: string
          participant_id?: string
          session_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      system_prompt_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          display_name: string
          id: string
          prompt_text: string
          template_key: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          prompt_text: string
          template_key: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          prompt_text?: string
          template_key?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      team_outreach: {
        Row: {
          created_at: string
          email: string
          id: string
          kind: string
          message: string | null
          name: string
          page_url: string | null
          reason: string
          referrer: string | null
          user_agent: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          kind?: string
          message?: string | null
          name: string
          page_url?: string | null
          reason: string
          referrer?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          kind?: string
          message?: string | null
          name?: string
          page_url?: string | null
          reason?: string
          referrer?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      template_analyses: {
        Row: {
          analysis_json: Json
          analyzer_version: number
          created_at: string
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_version: number | null
          receipt_id: string
          status: string
          system_prompt_id: string | null
          template_key: string
          updated_at: string
        }
        Insert: {
          analysis_json: Json
          analyzer_version?: number
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_version?: number | null
          receipt_id: string
          status?: string
          system_prompt_id?: string | null
          template_key: string
          updated_at?: string
        }
        Update: {
          analysis_json?: Json
          analyzer_version?: number
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_version?: number | null
          receipt_id?: string
          status?: string
          system_prompt_id?: string | null
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_analyses_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_analyses_system_prompt_id_fkey"
            columns: ["system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_demo_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: string
          receipt_id: string
          template_key: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: string
          receipt_id: string
          template_key: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: string
          receipt_id?: string
          template_key?: string
          user_id?: string
        }
        Relationships: []
      }
      template_events: {
        Row: {
          created_at: string
          event: string
          id: string
          metadata: Json | null
          receipt_id: string | null
          template_key: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          metadata?: Json | null
          receipt_id?: string | null
          template_key: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          metadata?: Json | null
          receipt_id?: string | null
          template_key?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_jobs: {
        Row: {
          attempts: number
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          participant_id: string
          retry_after: string | null
          session_id: string | null
          status: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          participant_id: string
          retry_after?: string | null
          session_id?: string | null
          status?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          participant_id?: string
          retry_after?: string | null
          session_id?: string | null
          status?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_feature_inventory: {
        Row: {
          available_features:
            | Database["public"]["Enums"]["feature_taxonomy_enum"][]
            | null
          configurable_settings_count: number | null
          id: string
          period: string
          supports_custom_instructions: boolean | null
          supports_model_switch: boolean | null
          supports_projects: boolean | null
          tool_id: Database["public"]["Enums"]["tool_id_enum"]
          updated_at: string
        }
        Insert: {
          available_features?:
            | Database["public"]["Enums"]["feature_taxonomy_enum"][]
            | null
          configurable_settings_count?: number | null
          id?: string
          period: string
          supports_custom_instructions?: boolean | null
          supports_model_switch?: boolean | null
          supports_projects?: boolean | null
          tool_id: Database["public"]["Enums"]["tool_id_enum"]
          updated_at?: string
        }
        Update: {
          available_features?:
            | Database["public"]["Enums"]["feature_taxonomy_enum"][]
            | null
          configurable_settings_count?: number | null
          id?: string
          period?: string
          supports_custom_instructions?: boolean | null
          supports_model_switch?: boolean | null
          supports_projects?: boolean | null
          tool_id?: Database["public"]["Enums"]["tool_id_enum"]
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
      workflow_templates: {
        Row: {
          created_at: string
          id: string
          is_shared: boolean
          name: string
          notes: string | null
          owner_id: string
          provenance: string | null
          purpose: string | null
          source_receipt_id: string | null
          tags: string[]
          tool_sequence: string[]
          updated_at: string
          workflow_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_shared?: boolean
          name: string
          notes?: string | null
          owner_id: string
          provenance?: string | null
          purpose?: string | null
          source_receipt_id?: string | null
          tags?: string[]
          tool_sequence?: string[]
          updated_at?: string
          workflow_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_shared?: boolean
          name?: string
          notes?: string | null
          owner_id?: string
          provenance?: string | null
          purpose?: string | null
          source_receipt_id?: string | null
          tags?: string[]
          tool_sequence?: string[]
          updated_at?: string
          workflow_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_conversation: { Args: { _conv_id: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_personal_workspace: { Args: { _uid: string }; Returns: string }
      generate_join_code: { Args: never; Returns: string }
      grant_admin_role: { Args: { _email: string }; Returns: undefined }
      grant_researcher_role: { Args: { _email: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_tool_history: {
        Args: {
          p_first_use: string
          p_participant_id: string
          p_tool: Database["public"]["Enums"]["tool_id_enum"]
        }
        Returns: undefined
      }
      is_session_participant: {
        Args: { _session_id: string }
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
      owns_session: { Args: { _session_id: string }; Returns: boolean }
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
      app_role: "researcher" | "participant" | "admin"
      checklist_item_status: "open" | "verified" | "dismissed"
      dimension_category_enum:
        | "anthropic_4d"
        | "unesco_students"
        | "unesco_teachers"
        | "oecd"
        | "charlotte_overlay"
        | "ailiteracy"
      feature_taxonomy_enum:
        | "text_chat"
        | "code_interpreter"
        | "web_search"
        | "image_generation"
        | "image_analysis"
        | "voice_input"
        | "voice_output"
        | "file_upload"
        | "canvas_artifact"
        | "custom_gpt_project"
        | "api_integration"
        | "reasoning_mode"
      framework_origin_enum:
        | "anthropic"
        | "charlotte"
        | "unesco"
        | "oecd"
        | "ailiteracy"
      input_type_enum: "transcript" | "receipt_only" | "aggregate_only"
      redaction_level_enum: "none" | "minimal" | "strong"
      session_status: "draft" | "active" | "closed"
      source_type_enum: "canonical" | "supplemental"
      task_type_enum:
        | "essay"
        | "coding"
        | "data_analysis"
        | "research"
        | "creative"
        | "exam"
        | "reflection"
        | "other"
      tool_id_enum:
        | "chatgpt"
        | "copilot"
        | "claude"
        | "gemini"
        | "grammarly"
        | "midjourney"
        | "perplexity"
        | "custom"
        | "lovable"
        | "bolt"
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
      app_role: ["researcher", "participant", "admin"],
      checklist_item_status: ["open", "verified", "dismissed"],
      dimension_category_enum: [
        "anthropic_4d",
        "unesco_students",
        "unesco_teachers",
        "oecd",
        "charlotte_overlay",
        "ailiteracy",
      ],
      feature_taxonomy_enum: [
        "text_chat",
        "code_interpreter",
        "web_search",
        "image_generation",
        "image_analysis",
        "voice_input",
        "voice_output",
        "file_upload",
        "canvas_artifact",
        "custom_gpt_project",
        "api_integration",
        "reasoning_mode",
      ],
      framework_origin_enum: [
        "anthropic",
        "charlotte",
        "unesco",
        "oecd",
        "ailiteracy",
      ],
      input_type_enum: ["transcript", "receipt_only", "aggregate_only"],
      redaction_level_enum: ["none", "minimal", "strong"],
      session_status: ["draft", "active", "closed"],
      source_type_enum: ["canonical", "supplemental"],
      task_type_enum: [
        "essay",
        "coding",
        "data_analysis",
        "research",
        "creative",
        "exam",
        "reflection",
        "other",
      ],
      tool_id_enum: [
        "chatgpt",
        "copilot",
        "claude",
        "gemini",
        "grammarly",
        "midjourney",
        "perplexity",
        "custom",
        "lovable",
        "bolt",
      ],
    },
  },
} as const
