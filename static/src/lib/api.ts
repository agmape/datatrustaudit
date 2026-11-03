/** API client: attaches the session token and never swallows auth failures.
 *  Plan testing by administrators is a SERVER-SIDE test context (/api/admin/test-context); the client sends no plan header. */
import { supabase } from './supabase';

export class ApiError extends Error {
  status: number;
  code: string;
  body: any;
  constructor(status: number, code: string, message: string, body?: any) {
    super(message);
    this.status = status; this.code = code; this.body = body;
  }
}

type AuthFailureHandler = (code: string) => void;
let onAuthFailure: AuthFailureHandler | null = null;
export const setAuthFailureHandler = (fn: AuthFailureHandler | null) => { onAuthFailure = fn; };

export const accessToken = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export async function apiFetch<T = any>(path: string, init: RequestInit & { json?: unknown; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (init.auth !== false) {
    const tok = await accessToken();
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'), headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ApiError(0, 'ABORTED', 'aborted');
    if (import.meta.env.DEV) console.error('[api] fetch failed', path, e);
    throw new ApiError(0, 'NETWORK', 'network');
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const d = data?.detail && typeof data.detail === 'object' ? data.detail : data;
    const code = d?.error_code || data?.error_code || 'UNKNOWN';
    if (res.status === 401 && ['INVALID_TOKEN', 'TOKEN_EXPIRED'].includes(code)) onAuthFailure?.(code);
    throw new ApiError(res.status, code, d?.message || data?.message || res.statusText, data);
  }
  return data as T;
}
