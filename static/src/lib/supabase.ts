import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// ── Validate environment variables ──────────────────────────────────────────
const PLACEHOLDER_PATTERNS = ['COLE_', 'YOUR_', 'CHANGE_', 'REPLACE_', 'AQUI', 'TODO'];

function isPlaceholder(value: string): boolean {
    const upper = value.toUpperCase();
    return PLACEHOLDER_PATTERNS.some(p => upper.includes(p));
}

/**
 * Whether the Supabase anon key looks like a valid JWT (eyJ...) or
 * a valid new-format publishable key (sb_publishable_ of sufficient length).
 * Short sb_publishable_ keys (<100 chars) are treated as invalid/truncated.
 */
function isValidAnonKey(key: string): boolean {
    if (!key || isPlaceholder(key)) return false;
    // Classic JWT format: starts with eyJ, typically >100 chars
    if (key.startsWith('eyJ') && key.length > 100) return true;
    // New publishable key format: starts with sb_publishable_ and must be >100 chars
    if (key.startsWith('sb_') && key.length > 100) return true;
    // Anything else (including truncated sb_ keys) is invalid
    return false;
}

/**
 * Whether the Supabase configuration is valid and likely to work.
 * When false, auth operations fail with clear messages instead of a white screen.
 */
export const supabaseConfigValid =
    !!supabaseUrl &&
    isValidAnonKey(supabaseAnonKey) &&
    !supabaseUrl.endsWith('/rest/v1') &&
    !supabaseUrl.endsWith('/rest/v1/');

// ── Developer diagnostics (logged only in development mode) ─────────────────
if (import.meta.env.DEV) {
    if (!supabaseUrl) {
        console.error(
            '[DataTrust] CONFIG_ERROR: VITE_SUPABASE_URL is missing.\n' +
            'Add to your .env file (in the project root, not /static):\n' +
            'VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co'
        );
    } else if (supabaseUrl.endsWith('/rest/v1') || supabaseUrl.endsWith('/rest/v1/')) {
        console.error(
            '[DataTrust] CONFIG_ERROR: VITE_SUPABASE_URL contains "/rest/v1/" — this is WRONG.\n' +
            'Use the project base URL without /rest/v1/:\n' +
            'VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co'
        );
    }

    if (!supabaseAnonKey || isPlaceholder(supabaseAnonKey)) {
        console.error(
            '[DataTrust] CONFIG_ERROR: VITE_SUPABASE_ANON_KEY is missing or is a placeholder.\n' +
            'Current value: "' + supabaseAnonKey + '"\n\n' +
            'To get the anon key:\n' +
            '1. Open Supabase Dashboard: Supabase Dashboard → Settings → API\n' +
            '2. Copy the "anon public" key\n' +
            '3. Set in .env: VITE_SUPABASE_ANON_KEY=eyJhbGci...\n\n' +
            'The anon key is safe for the frontend — it is NOT the service_role secret.'
        );
    } else if (supabaseAnonKey.startsWith('sb_') && supabaseAnonKey.length <= 100) {
        console.error(
            '[DataTrust] CONFIG_ERROR: VITE_SUPABASE_ANON_KEY looks like a truncated publishable key.\n' +
            'Key starts with sb_ but is only ' + supabaseAnonKey.length + ' characters long.\n' +
            'Valid publishable keys are typically >100 characters.\n' +
            'Get the full key from: Supabase Dashboard → Settings → API → anon (public)'
        );
    } else if (!isValidAnonKey(supabaseAnonKey)) {
        console.error(
            '[DataTrust] CONFIG_ERROR: VITE_SUPABASE_ANON_KEY format is unrecognized.\n' +
            'Expected: starts with eyJ (JWT) or sb_publishable_ (new format), length > 100.\n' +
            'Got: "' + supabaseAnonKey.substring(0, 20) + '..." (' + supabaseAnonKey.length + ' chars)'
        );
    }

    if (supabaseConfigValid) {
        console.info('[DataTrust] Supabase config: VALID. URL:', supabaseUrl.substring(0, 50) + '...');
    } else {
        console.warn(
            '[DataTrust] Supabase config: INVALID. Auth calls will fail gracefully.\n' +
            'If VITE_DEV_ADMIN_MODE=true, use the admin email to bypass Supabase for local testing.'
        );
    }
}

// Create client even with bad config — auth calls fail with clear errors
// instead of crashing the whole app with a white screen.
const effectiveUrl = supabaseUrl || 'https://placeholder.supabase.co';
const effectiveKey = isValidAnonKey(supabaseAnonKey)
    ? supabaseAnonKey
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

export const supabase = createClient(effectiveUrl, effectiveKey);
