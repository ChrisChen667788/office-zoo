/**
 * Zod-based input validation helpers.
 *
 * Goals:
 *  - Reject bad input at the edge with a 400 + structured error body,
 *    rather than letting it cascade into downstream code (type cast surprises,
 *    LLM prompt pollution, crashes).
 *  - Keep route handlers small: one-line validation + typed data out.
 *  - Safe: .safeParse never throws.
 */
import type { Context } from 'hono';
import type { z } from 'zod';

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Validate the JSON body of a Hono request against a zod schema.
 * On failure returns a Response with status 400 and a JSON body:
 *   { error: "Invalid request body", issues: [{ path, message }...] }
 *
 * Usage:
 *   const v = await validateBody(c, ChatRequestSchema);
 *   if (!v.ok) return v.response;
 *   const body = v.data;  // typed
 */
export async function validateBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<ValidationResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      response: c.json(
        { error: 'Invalid JSON body' },
        400,
      ) as unknown as Response,
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return {
      ok: false,
      response: c.json(
        { error: 'Invalid request body', issues },
        400,
      ) as unknown as Response,
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Validate a socket.io event payload. Returns the typed data or null.
 * Socket events don't have a 400-response equivalent — callers should
 * emit 'game:error' and return.
 */
export function validateEvent<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; message: string } {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      message: `Invalid payload: ${first.path.join('.') || '(root)'} — ${first.message}`,
    };
  }
  return { ok: true, data: result.data };
}
