/**
 * API Error handling — converts HTTP errors and Supabase errors
 * into readable Portuguese messages for the user.
 */

export interface ApiErrorInfo {
  /** HTTP status code (0 for network errors) */
  status: number;
  /** Machine-readable error code */
  code: string;
  /** User-facing message in Portuguese */
  userMessage: string;
  /** Technical details (logged only in DEV) */
  technical: string;
}

const STATUS_MESSAGES: Record<number, { code: string; message: string }> = {
  400: {
    code: 'BAD_REQUEST',
    message: 'Dados inválidos. Revise as informações enviadas.',
  },
  401: {
    code: 'UNAUTHORIZED',
    message: 'Sessão expirada ou login não concluído. Entre novamente.',
  },
  403: {
    code: 'FORBIDDEN',
    message: 'Você não tem permissão para executar esta ação.',
  },
  404: {
    code: 'NOT_FOUND',
    message: 'Recurso não encontrado.',
  },
  409: {
    code: 'CONFLICT',
    message: 'Este recurso já existe ou há um conflito com os dados atuais.',
  },
  422: {
    code: 'VALIDATION_ERROR',
    message: 'Verifique seus dados e tente novamente.',
  },
  429: {
    code: 'RATE_LIMITED',
    message: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
  },
  500: {
    code: 'INTERNAL_SERVER_ERROR',
    message:
      'Erro interno da API. Possíveis causas: variável .env ausente, banco de dados, JWT, Supabase, RLS, tabela profiles ou rota quebrada. Verifique os logs do backend.',
  },
};

/**
 * Parse an API error from a fetch Response into a user-friendly ApiErrorInfo.
 */
export async function parseApiError(res: Response, context?: string): Promise<ApiErrorInfo> {
  const status = res.status;
  const defaults = STATUS_MESSAGES[status] || {
    code: `HTTP_${status}`,
    message: `Erro HTTP ${status}. Tente novamente.`,
  };

  let technical = `${res.status} ${res.statusText} — ${res.url}`;
  let serverMessage = '';

  try {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const body = await res.json();
      serverMessage =
        body?.error?.user_message ||
        body?.error?.message ||
        body?.message ||
        body?.detail ||
        (typeof body?.error === 'string' ? body.error : '');
      technical += ` | body: ${JSON.stringify(body).slice(0, 500)}`;
    } else {
      const text = await res.text();
      technical += ` | body: ${text.slice(0, 300)}`;
    }
  } catch {
    technical += ' | could not read body';
  }

  if (import.meta.env.DEV) {
    console.error(`[API Error] ${context || ''} ${technical}`);
  }

  return {
    status,
    code: defaults.code,
    userMessage: serverMessage || defaults.message,
    technical,
  };
}

/**
 * Parse a network error (no response at all).
 */
export function parseNetworkError(err: unknown, context?: string): ApiErrorInfo {
  const message = err instanceof Error ? err.message : String(err);

  if (import.meta.env.DEV) {
    console.error(`[Network Error] ${context || ''} ${message}`);
  }

  return {
    status: 0,
    code: 'NETWORK_ERROR',
    userMessage:
      'Não foi possível conectar à API. Verifique se o backend está rodando e se a URL está correta.',
    technical: message,
  };
}

/**
 * Parse a Supabase error (from @supabase/supabase-js).
 */
export function parseSupabaseError(error: { message: string; status?: number; code?: string }, context?: string): ApiErrorInfo {
  if (import.meta.env.DEV) {
    console.error(`[Supabase Error] ${context || ''} ${error.message} (status=${error.status}, code=${error.code})`);
  }

  return {
    status: error.status || 500,
    code: error.code || 'SUPABASE_ERROR',
    userMessage:
      'Erro na integração com Supabase. Verifique URL, anon key, sessão, profiles e RLS.',
    technical: error.message,
  };
}
