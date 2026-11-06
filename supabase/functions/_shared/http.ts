// Shared HTTP helpers for DDTC LMS Edge Functions.

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

/** CORS: the browser app calls these functions with the user's own token. */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req.headers.get('Origin')) },
  });
}

/** A user-safe error: `code` is stable for the app; `message` never contains private data. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Maps database errors raised by the trusted functions to HTTP answers. */
export function fromDbError(error: { code?: string; message?: string }): HttpError {
  switch (error.code) {
    case '42501':
      return new HttpError(403, 'forbidden', error.message ?? 'Not allowed');
    case '22023':
      return new HttpError(400, 'invalid', error.message ?? 'Invalid request');
    case 'P0002':
      return new HttpError(404, 'not_found', 'User not found');
    case 'P0429':
      return new HttpError(429, 'rate_limited', 'Too many requests. Try again later.');
    default:
      return new HttpError(500, 'server_error', 'Something went wrong');
  }
}

/** Wraps a handler: CORS preflight, POST only, JSON errors. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req.headers.get('Origin')) });
    if (req.method !== 'POST') return json(req, 405, { code: 'method_not_allowed', message: 'Use POST' });
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpError) return json(req, error.status, { code: error.code, message: error.message });
      console.error(error instanceof Error ? error.message : 'unexpected error');
      return json(req, 500, { code: 'server_error', message: 'Something went wrong' });
    }
  });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid', 'The request body must be JSON');
  }
}
