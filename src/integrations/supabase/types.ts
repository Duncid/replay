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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      compositions: {
        Row: {
          bpm: number | null
          created_at: string | null
          data: Json
          id: string
          instrument: string | null
          time_signature: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          bpm?: number | null
          created_at?: string | null
          data: Json
          id?: string
          instrument?: string | null
          time_signature?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          bpm?: number | null
          created_at?: string | null
          data?: Json
          id?: string
          instrument?: string | null
          time_signature?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      curriculum_edges: {
        Row: {
          created_at: string | null
          edge_type: string
          id: string
          source_key: string
          target_key: string
          version_id: string
        }
        Insert: {
          created_at?: string | null
          edge_type: string
          id?: string
          source_key: string
          target_key: string
          version_id: string
        }
        Update: {
          created_at?: string | null
          edge_type?: string
          id?: string
          source_key?: string
          target_key?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_edges_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_exports: {
        Row: {
          created_at: string | null
          id: string
          snapshot: Json
          version_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          snapshot: Json
          version_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          snapshot?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_exports_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_nodes: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          node_key: string
          node_type: string
          version_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id?: string
          node_key: string
          node_type: string
          version_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          node_key?: string
          node_type?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_nodes_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_versions: {
        Row: {
          created_at: string | null
          id: string
          published_at: string | null
          quest_graph_id: string
          status: string
          title: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          published_at?: string | null
          quest_graph_id: string
          status?: string
          title: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          id?: string
          published_at?: string | null
          quest_graph_id?: string
          status?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_versions_quest_graph_id_fkey"
            columns: ["quest_graph_id"]
            isOneToOne: false
            referencedRelation: "quest_graphs"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_runs: {
        Row: {
          ai_feedback: string | null
          attempt_count: number
          created_at: string
          demo_sequence: Json | null
          diagnosis: Json | null
          difficulty: number
          ended_at: string | null
          evaluation: string | null
          id: string
          lesson_brief: Json | null
          lesson_node_key: string
          local_user_id: string | null
          metronome_context: Json | null
          setup: Json | null
          started_at: string
          state: Json | null
          user_recording: Json | null
          version_id: string | null
        }
        Insert: {
          ai_feedback?: string | null
          attempt_count?: number
          created_at?: string
          demo_sequence?: Json | null
          diagnosis?: Json | null
          difficulty?: number
          ended_at?: string | null
          evaluation?: string | null
          id?: string
          lesson_brief?: Json | null
          lesson_node_key: string
          local_user_id?: string | null
          metronome_context?: Json | null
          setup?: Json | null
          started_at?: string
          state?: Json | null
          user_recording?: Json | null
          version_id?: string | null
        }
        Update: {
          ai_feedback?: string | null
          attempt_count?: number
          created_at?: string
          demo_sequence?: Json | null
          diagnosis?: Json | null
          difficulty?: number
          ended_at?: string | null
          evaluation?: string | null
          id?: string
          lesson_brief?: Json | null
          lesson_node_key?: string
          local_user_id?: string | null
          metronome_context?: Json | null
          setup?: Json | null
          started_at?: string
          state?: Json | null
          user_recording?: Json | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_runs_local_user_id_fkey"
            columns: ["local_user_id"]
            isOneToOne: false
            referencedRelation: "local_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      local_users: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      practice_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          lesson_run_ids: string[] | null
          local_user_id: string | null
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          lesson_run_ids?: string[] | null
          local_user_id?: string | null
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          lesson_run_ids?: string[] | null
          local_user_id?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_sessions_local_user_id_fkey"
            columns: ["local_user_id"]
            isOneToOne: false
            referencedRelation: "local_users"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_graphs: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data: Json
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tune_assets: {
        Row: {
          briefing: Json | null
          created_at: string | null
          id: string
          left_hand_sequence: Json | null
          note_sequence: Json
          nuggets: Json | null
          right_hand_sequence: Json | null
          tune_key: string
          version_id: string
        }
        Insert: {
          briefing?: Json | null
          created_at?: string | null
          id?: string
          left_hand_sequence?: Json | null
          note_sequence: Json
          nuggets?: Json | null
          right_hand_sequence?: Json | null
          tune_key: string
          version_id: string
        }
        Update: {
          briefing?: Json | null
          created_at?: string | null
          id?: string
          left_hand_sequence?: Json | null
          note_sequence?: Json
          nuggets?: Json | null
          right_hand_sequence?: Json | null
          tune_key?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tune_assets_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_acquisition: {
        Row: {
          acquired_at: string
          created_at: string
          id: string
          lesson_key: string
          local_user_id: string | null
        }
        Insert: {
          acquired_at?: string
          created_at?: string
          id?: string
          lesson_key: string
          local_user_id?: string | null
        }
        Update: {
          acquired_at?: string
          created_at?: string
          id?: string
          lesson_key?: string
          local_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_acquisition_local_user_id_fkey"
            columns: ["local_user_id"]
            isOneToOne: false
            referencedRelation: "local_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_skill_state: {
        Row: {
          created_at: string
          id: string
          last_practiced_at: string | null
          local_user_id: string | null
          mastery: number
          skill_key: string
          unlocked: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          local_user_id?: string | null
          mastery?: number
          skill_key: string
          unlocked?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          local_user_id?: string | null
          mastery?: number
          skill_key?: string
          unlocked?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_skill_state_local_user_id_fkey"
            columns: ["local_user_id"]
            isOneToOne: false
            referencedRelation: "local_users"
            referencedColumns: ["id"]
          },
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
  public: {
    Enums: {},
  },
} as const
