/**
 * TypeScript types for the Supabase database schema.
 *
 * These types mirror the SQL schema in supabase/migrations/001_initial_schema.sql.
 * In production, auto-generate with: npx supabase gen types typescript --local > src/lib/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "player" | "coach" | "admin";
export type QuestionResult = "power" | "ten" | "neg" | "none";
export type CompetitionStatus = "upcoming" | "active" | "completed" | "cancelled";

export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          coach_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code?: string;
          coach_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          coach_id?: string | null;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_url: string | null;
          role: UserRole;
          team_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          avatar_url?: string | null;
          role?: UserRole;
          team_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: UserRole;
          team_id?: string | null;
          created_at?: string;
        };
      };
      practice_sessions: {
        Row: {
          id: string;
          user_id: string;
          pack_id: string;
          total_score: number;
          questions_answered: number;
          powers: number;
          tens: number;
          negs: number;
          missed: number;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          pack_id: string;
          total_score?: number;
          questions_answered?: number;
          powers?: number;
          tens?: number;
          negs?: number;
          missed?: number;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          pack_id?: string;
          total_score?: number;
          questions_answered?: number;
          powers?: number;
          tens?: number;
          negs?: number;
          missed?: number;
          started_at?: string;
          ended_at?: string | null;
        };
      };
      question_results: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          question_id: string | null;
          category: string;
          subcategory: string | null;
          result: QuestionResult;
          points: number;
          buzz_word_index: number | null;
          time_to_answer_sec: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          question_id?: string | null;
          category: string;
          subcategory?: string | null;
          result: QuestionResult;
          points?: number;
          buzz_word_index?: number | null;
          time_to_answer_sec?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          question_id?: string | null;
          category?: string;
          subcategory?: string | null;
          result?: QuestionResult;
          points?: number;
          buzz_word_index?: number | null;
          time_to_answer_sec?: number | null;
          created_at?: string;
        };
      };
      competitions: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string;
          team_id: string;
          pack_id: string;
          question_count: number;
          status: CompetitionStatus;
          start_time: string;
          end_time: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by: string;
          team_id: string;
          pack_id: string;
          question_count?: number;
          status?: CompetitionStatus;
          start_time: string;
          end_time: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_by?: string;
          team_id?: string;
          pack_id?: string;
          question_count?: number;
          status?: CompetitionStatus;
          start_time?: string;
          end_time?: string;
          created_at?: string;
        };
      };
      competition_entries: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          total_score: number;
          powers: number;
          tens: number;
          negs: number;
          rank: number | null;
          category_breakdown: Json;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          total_score?: number;
          powers?: number;
          tens?: number;
          negs?: number;
          rank?: number | null;
          category_breakdown?: Json;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          competition_id?: string;
          user_id?: string;
          total_score?: number;
          powers?: number;
          tens?: number;
          negs?: number;
          rank?: number | null;
          category_breakdown?: Json;
          started_at?: string;
          completed_at?: string | null;
        };
      };
    };
    Functions: {
      join_team: {
        Args: { p_invite_code: string };
        Returns: string;
      };
      get_team_leaderboard: {
        Args: {
          p_team_id: string;
          p_period?: string;
          p_limit?: number;
        };
        Returns: {
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          total_points: number;
          total_questions: number;
          powers: number;
          tens: number;
          negs: number;
          accuracy: number;
          power_rate: number;
        }[];
      };
    };
  };
}

// Helper types for easier use
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// Convenience aliases
export type Profile = Tables<"profiles">;
export type Team = Tables<"teams">;
export type PracticeSession = Tables<"practice_sessions">;
export type QuestionResultRow = Tables<"question_results">;
export type Competition = Tables<"competitions">;
export type CompetitionEntry = Tables<"competition_entries">;
