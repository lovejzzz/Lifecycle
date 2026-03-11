/**
 * Supabase Client — provides browser and server clients for Lifecycle.
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  — Supabase project URL (public, embedded in client bundle)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon/public key (safe for browser)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (server-only, never exposed to browser)
 *
 * Usage:
 *   Browser components: import { supabase } from '@/lib/supabase'
 *   Server routes:      import { createServerClient } from '@/lib/supabase'
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Database types (will be expanded as tables are created) ─────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          node_count: number;
          edge_count: number;
          created_at: string;
          last_modified: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          node_count?: number;
          edge_count?: number;
          created_at?: string;
          last_modified?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          node_count?: number;
          edge_count?: number;
          last_modified?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      project_data: {
        Row: {
          project_id: string;
          data: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          data: Record<string, unknown>;
          updated_at?: string;
        };
        Update: {
          project_id?: string;
          data?: Record<string, unknown>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_data_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: true;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ── Environment helpers ─────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Returns true when Supabase env vars are configured.
 * When false, the app should fall back to localStorage-only mode.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

// ── Browser client (singleton) ──────────────────────────────────────────────

let _browserClient: SupabaseClient<Database> | null = null;

/**
 * Get or create the browser Supabase client (anon key, respects RLS).
 * Returns null if Supabase is not configured.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (!_browserClient) {
    _browserClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _browserClient;
}

/** Convenience alias — same as getSupabaseClient() */
export const supabase = typeof window !== 'undefined' ? getSupabaseClient() : null;

// ── Server client (service role — never import in client components) ────────

/**
 * Create a privileged Supabase client for server-side use (API routes).
 * Uses the service role key to bypass RLS when needed.
 * Returns null if the service role key is not set.
 */
export function createServerClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!SUPABASE_URL || !serviceRoleKey) return null;

  return createClient<Database>(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Get the current authenticated user (or null if anonymous/not signed in).
 */
export async function getCurrentUser() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  return user;
}

/**
 * Get the current session (includes JWT for server-side verification).
 */
export async function getSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  return session;
}
