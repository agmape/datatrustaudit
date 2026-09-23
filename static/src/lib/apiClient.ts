/**
 * API Client — wraps fetch with error handling, JSON parsing, and auth token injection.
 * Never logs passwords or tokens.
 */

import { parseApiError, parseNetworkError, type ApiErrorInfo } from './apiError';

export class ApiClientError extends Error {
  info: ApiErrorInfo;
  constructor(info: ApiErrorInfo) {
    super(info.userMessage);
    this.name = 'ApiClientError';
    this.info = info;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  /** Context label for error logging */
  context?: string;
}

/**
 * Make an API request. Throws ApiClientError with a user-friendly message on failure.
 */
export async function apiRequest<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, headers = {}, context } = opts;

  const reqHeaders: Record<string, string> = {
    ...headers,
  };

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body instanceof FormData || body instanceof URLSearchParams
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
    });
  } catch (err) {
    throw new ApiClientError(parseNetworkError(err, context || url));
  }

  if (!res.ok) {
    const info = await parseApiError(res, context || url);
    throw new ApiClientError(info);
  }

  // Parse JSON response
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }

  // Non-JSON success — return empty object
  return {} as T;
}
