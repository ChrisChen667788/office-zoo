/**
 * Client wrapper around POST /api/share/captions. Returns the same number
 * of captions as input highlights (server pads with original headlines on
 * any LLM failure, so the response is always exhaustive).
 *
 * Wraps in try/catch so network failures fall back gracefully — the video
 * just uses each highlight's existing `headline` instead of a punchy LLM
 * caption. Never throws.
 */
import type { Highlight } from './highlightPicker';

interface CaptionsResponse {
  captions: string[];
}

/** ~7s budget — covers 3 parallel LLM calls + worst-case fallback retry. */
const FETCH_TIMEOUT_MS = 8_000;

export async function fetchHighlightCaptions(
  highlights: Highlight[],
): Promise<string[]> {
  const fallbacks = highlights.map((h) => h.headline);
  if (highlights.length === 0) return [];

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    // Strip client-only fields (score / playerId) — server schema would
    // reject extras under strict zod, and we don't need them anyway.
    const payload = {
      highlights: highlights.map((h) => ({
        kind: h.kind,
        playerName: h.playerName,
        role: h.role,
        team: h.team,
        headline: h.headline,
        body: h.body,
        round: h.round,
      })),
    };
    const resp = await fetch('/api/share/captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return fallbacks;
    const data = (await resp.json()) as CaptionsResponse;
    if (!Array.isArray(data.captions) || data.captions.length !== highlights.length) {
      return fallbacks;
    }
    // Replace any empty/garbage entry with the original headline.
    return data.captions.map((c, i) => (c?.trim() ? c : fallbacks[i]));
  } catch {
    clearTimeout(t);
    return fallbacks;
  }
}
