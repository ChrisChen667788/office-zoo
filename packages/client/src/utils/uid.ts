/**
 * Collision-free unique ID generator for React list keys + message IDs.
 *
 * Avoids two patterns that existed previously:
 *   - `Date.now() + Math.random()` — floating-point addition, collisions
 *     possible when two calls land in the same millisecond
 *   - `let moduleCounter = 0; return moduleCounter++;` — resets on HMR,
 *     and collides across store re-creation in tests
 *
 * `crypto.randomUUID()` is available in all modern browsers (Chrome 92+,
 * Safari 15.4+, Firefox 95+). Fallback uses Math.random() + timestamp +
 * monotonic counter for ancient browsers.
 */
let fallbackCounter = 0;

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Legacy browsers: 10 random chars + timestamp + monotonic counter.
  // Good enough for React keys and short-lived client state.
  const rand = Math.random().toString(36).slice(2, 12);
  const ts = Date.now().toString(36);
  const seq = (fallbackCounter++).toString(36);
  return `${ts}-${rand}-${seq}`;
}
