// Supabase client: auth (profiles) + the proposed-cards pipeline + match
// results. Both values below are the PUBLIC half of the project and are meant
// to ship in the site; row-level security in supabase/schema.sql is the gate.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ptzjajcxdjomtebsbxel.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_z-GODn-3iZdiUVcd0NlhKQ_Q7PWvePQ';

export const supa = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

export interface Profile {
  id: string;
  username: string;
  avatar_icon: string;
  is_admin: boolean;
  games_played: number;
  games_won: number;
}

export interface ProposedCardRow {
  id: string;
  author: string | null;
  author_name: string;
  card: unknown;
  status: 'proposed' | 'approved' | 'rejected';
  reviewer_notes: string | null;
  created_at: string;
}

export interface MatchPlayer {
  profile: string | null;
  name: string;
  color: string;
  seat: number;
  points: number;
  won: boolean;
}
