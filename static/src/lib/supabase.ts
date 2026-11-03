import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

/** Only the PUBLIC anon/publishable key ever reaches the browser. No secrets in VITE_* variables. */
export const supabaseConfigured = Boolean(url && anon && !/your-|COLE_|CHANGE_/i.test(url + anon));

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;
