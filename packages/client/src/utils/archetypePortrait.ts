/**
 * archetypePortrait — v5.2.0 client-side hook for the lazy-gen
 * archetype portrait endpoint.
 *
 * Server returns:
 *   { ready: true, url }                  → use the URL immediately
 *   { ready: false, generating: true }    → server kicked off gen, poll
 *
 * This hook handles the polling: returns null while generating + the
 * URL when ready. Consumers render the emoji fallback when null. After
 * the first cache hit on a given archetypeId, the next mount returns
 * the URL on the FIRST fetch (no polling) since the server's response
 * shape is the same shape regardless of cache state.
 *
 * Per-tab in-memory cache keyed by id so navigating Profile → Squad →
 * Profile doesn't trigger a fresh poll.
 */

import { useEffect, useState } from 'react';

const memCache = new Map<string, string>(); // id → URL

interface PortraitState {
  url: string | null;
  /** true while we're polling — UI may show a tiny loading dot if
   *  it cares. Most call sites just want the URL or null. */
  generating: boolean;
}

const inflightPolls = new Set<string>();

export function useArchetypePortrait(archetypeId: string | undefined | null): PortraitState {
  const [state, setState] = useState<PortraitState>(() => ({
    url: archetypeId ? memCache.get(archetypeId) ?? null : null,
    generating: false,
  }));

  useEffect(() => {
    if (!archetypeId) return;
    const cached = memCache.get(archetypeId);
    if (cached) { setState({ url: cached, generating: false }); return; }

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const r = await fetch(`/api/quiz/archetype-portrait/${encodeURIComponent(archetypeId)}`);
        if (cancelled) return;
        const json = await r.json() as
          | { ready: true; url: string }
          | { ready: false; generating?: boolean; error?: string };
        if ('ready' in json && json.ready) {
          memCache.set(archetypeId, json.url);
          inflightPolls.delete(archetypeId);
          setState({ url: json.url, generating: false });
          return;
        }
        // Still cooking — poll again. 6s intervals: portraits take ~15-30s
        // typically, so polling 6s avoids hammering the server while
        // catching completion within one poll cycle of when it happens.
        setState({ url: null, generating: true });
        timer = window.setTimeout(poll, 6_000);
      } catch {
        if (cancelled) return;
        // Network blip — back off + retry. Don't break the consumer's
        // emoji fallback while we're down.
        timer = window.setTimeout(poll, 15_000);
      }
    };

    // De-dup concurrent mounts of the same archetypeId across the tab —
    // multiple Profile / Squad / share-card renderers can mount at the
    // same time when the user does fast navigation.
    if (!inflightPolls.has(archetypeId)) {
      inflightPolls.add(archetypeId);
      poll();
    } else {
      // Some other instance is already polling; check cache periodically
      // until they fill it.
      const check = () => {
        if (cancelled) return;
        const hit = memCache.get(archetypeId);
        if (hit) { setState({ url: hit, generating: false }); return; }
        timer = window.setTimeout(check, 1_500);
      };
      setState({ url: null, generating: true });
      check();
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [archetypeId]);

  return state;
}
