/**
 * audioUnlock — a tiny Safari/Chrome autoplay primer.
 *
 * Why this exists:
 *   Browsers block `HTMLAudioElement.play()` unless the call is inside a user
 *   gesture. Our TTS audio arrives asynchronously via socket.io, long after the
 *   initial "进入" click, so the play attempt isn't inside the gesture anymore
 *   and Safari in particular refuses silently.
 *
 * How this works:
 *   1. On the first real user gesture (click/tap/keydown) we play a single
 *      silent MP3 frame on a shared <audio> element. Once that succeeds while
 *      a gesture is active, the same element is "unlocked" for subsequent
 *      programmatic plays for the rest of the tab's lifetime.
 *   2. `primeAudio()` can be called imperatively from click handlers (e.g. the
 *      "进入" button) so the unlock happens synchronously with the gesture.
 *   3. `playTtsFromUrl(url)` reuses the unlocked element — setting `.src` on
 *      an already-unlocked element does NOT require a fresh gesture, which
 *      makes async TTS "just work" afterwards.
 *
 *   If the very first programmatic play still fails (e.g. user never clicked,
 *   gesture was on a different page, private mode), we surface the error via
 *   the optional callback so the UI can prompt the user to tap-to-unmute.
 */

// A proper silent MP3 (44.1 kHz mono, ~1 s). Small enough to inline,
// VALID enough for Safari to decode + unlock the element.
//
// v3.6.0 bug fix: the previous inline MP3 was a truncated stub (~64
// bytes, only an ID3 header + one incomplete MPEG frame header).
// Safari refused to decode it → `await el.play()` rejected in the
// silent-unlock path → `unlocked` stayed false → ALL subsequent
// TTS playback was blocked by Safari's autoplay policy. Symptom:
// talkshow audio "始终无法正常输出". Chrome happened to tolerate
// the malformed stub so the bug went unnoticed in dev.
//
// This is a known-valid silent MP3 with proper ID3 tag + LAME header
// + actual silent audio frames. Source: the audio-community
// "minimum valid silent MP3" — under 1 KB, decodes everywhere.
const SILENT_MP3 =
  'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;
let unlockAttempted = false;

function getShared(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudio) return sharedAudio;
  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  el.volume = 1.0;
  sharedAudio = el;
  return el;
}

/**
 * Attempt an in-gesture unlock. Safe to call repeatedly; no-ops after the first
 * successful unlock. Should be invoked inside a click/tap/keydown handler.
 *
 * Also nudges the AudioContext-based SFX module to wake up — Safari requires
 * BOTH the HTMLAudioElement AND the AudioContext to be unlocked inside a
 * user gesture, and they're separate code paths. Doing both here means a
 * single click on "进入" unlocks both for the rest of the session, so the
 * later kill / vote / meeting animations get their SFX without extra wiring.
 */
export function primeAudio(): void {
  // Wake the SFX AudioContext too — fire-and-forget so we don't block the
  // HTMLAudioElement unlock below. Dynamic import to avoid sfx → audioUnlock
  // cycles (audioUnlock is imported from many low-level utilities).
  if (typeof window !== 'undefined') {
    import('./sfx').then(({ sfx }) => {
      try { sfx.unlock?.(); } catch { /* sfx may not export unlock yet */ }
    }).catch(() => { /* sfx module unavailable — degrade silently */ });
  }

  if (unlocked) return;
  const el = getShared();
  if (!el) return;
  unlockAttempted = true;
  try {
    el.src = SILENT_MP3;
    el.muted = false;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        unlocked = true;
      }).catch(() => {
        // Silent: will retry on next gesture via the global listener below.
      });
    } else {
      unlocked = true;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Play a TTS URL on the shared (unlocked) element. Cancels any currently
 * playing clip — including any in-progress browser SpeechSynthesis — so
 * speech doesn't overlap between speakers OR between the URL audio and
 * its fallback browser-TTS twin.
 *
 * Returns a promise that resolves true on success, false if playback was
 * blocked. Callers can use `false` to surface a "tap to unmute" UI.
 */
/** v0.9.2 — current playback speed for the shared TTS element. Applied
 *  to every subsequent playTtsFromUrl, persists across calls. Default 1.0. */
let currentTtsSpeed = 1.0;

/** v0.9.2 — set the playback speed for FUTURE plays AND any currently
 *  playing track. Range clamped to [0.5, 2.0] which is the safe HTMLMedia
 *  range across modern browsers. Persisted in-memory only — pages can
 *  re-init their default rate per route. */
export function setTtsPlaybackSpeed(rate: number): void {
  currentTtsSpeed = Math.max(0.5, Math.min(2.0, rate));
  if (sharedAudio) {
    try { sharedAudio.playbackRate = currentTtsSpeed; } catch { /* noop */ }
  }
}

/** Read the current speed (for UI selectors that need to highlight
 *  the active option). */
export function getTtsPlaybackSpeed(): number {
  return currentTtsSpeed;
}

export async function playTtsFromUrl(url: string): Promise<boolean> {
  const el = getShared();
  if (!el) return false;
  // Always cancel browser TTS before URL playback — covers the case where
  // the fallback timer fired before server audio arrived. Without this we
  // get two overlapping voices reading the same line.
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }
  try {
    el.pause();
  } catch { /* noop */ }
  try {
    el.src = url;
    el.currentTime = 0;
    // v0.9.2 — apply the most recently chosen playback speed so a user's
    // 1.25× preference sticks across bit changes within the binge flow.
    el.playbackRate = currentTtsSpeed;
    await el.play();
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Web Speech API fallback — used when the server's TTS pipeline returns null
// (api quota exhausted, model not supported, etc). Browser-native, no key
// required, works offline. Quality is flat compared to Minimax/OpenAI but
// "flat voice" >> "no voice".
//
// On macOS the default zh-CN voice is "Tingting" (female). Voices load
// asynchronously the first time `getVoices()` is called, so we cache after
// the `voiceschanged` event.
// ---------------------------------------------------------------------------

let cachedVoices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const v = window.speechSynthesis.getVoices();
  if (v && v.length) cachedVoices = v;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

/** Pick a Chinese voice if available, biased by gender hint when provided. */
function pickVoice(genderHint?: 'male' | 'female'): SpeechSynthesisVoice | null {
  if (!cachedVoices.length) loadVoices();
  // Prefer zh-CN voices first, then any zh-* voice.
  const zhCN = cachedVoices.filter(v => /^zh[-_]CN/i.test(v.lang));
  const zhAny = cachedVoices.filter(v => /^zh/i.test(v.lang));
  const pool = zhCN.length ? zhCN : zhAny.length ? zhAny : cachedVoices;
  if (!pool.length) return null;

  if (genderHint) {
    // macOS naming: "Tingting" / "Sinji" are female-ish; "Yu-shu" / "Hattori" male.
    const re = genderHint === 'female'
      ? /tingting|mei[-_ ]?ji|tian[-_ ]?mei|yan[-_ ]?ping|female/i
      : /yu[-_ ]?shu|hattori|qi[-_ ]?shu|male/i;
    const matched = pool.find(v => re.test(v.name));
    if (matched) return matched;
  }
  return pool[0];
}

/**
 * Speak text via the browser's native speech synthesis. Used as a fallback
 * when the server can't generate audio (quota exhausted) — "always works"
 * because no API call is needed.
 *
 * Returns a promise that resolves when speech finishes. Resolves immediately
 * if the API isn't available so the game loop never deadlocks on silence.
 */
export async function speakViaBrowserTTS(
  text: string,
  opts?: { genderHint?: 'male' | 'female'; rate?: number; pitch?: number },
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
  // Cancel any currently-speaking utterance so we don't get overlapping voices.
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  // Also cancel any URL-based playback so the two channels don't fight.
  if (sharedAudio) {
    try { sharedAudio.pause(); } catch { /* noop */ }
  }

  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(opts?.genderHint);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'zh-CN';
      u.rate = opts?.rate ?? 1.05;
      u.pitch = opts?.pitch ?? 1.0;
      u.volume = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      // Mark unlocked: once speak() succeeded once it's gesture-free thereafter.
      unlocked = true;
    } catch {
      resolve();
    }
  });
}

/**
 * Convenience: try server-generated audio first, fall back to browser TTS
 * if the URL playback fails. Single call site instead of duplicating the
 * try-fallback logic in every speech handler.
 */
export async function playTtsWithFallback(
  audioUrl: string | null | undefined,
  fallbackText: string,
  opts?: { genderHint?: 'male' | 'female'; rate?: number },
): Promise<'audio' | 'browser' | 'failed'> {
  if (audioUrl) {
    const ok = await playTtsFromUrl(audioUrl);
    if (ok) return 'audio';
  }
  if (fallbackText) {
    await speakViaBrowserTTS(fallbackText, opts);
    return 'browser';
  }
  return 'failed';
}

/** True if the browser exposes Web Speech API. */
export function hasBrowserTTS(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Stop any active TTS playback. Used on route-unmount to avoid bleed.
 * Also cancels browser SpeechSynthesis since both channels can be active.
 */
export function stopTts(): void {
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.removeAttribute('src');
      sharedAudio.load();
    } catch { /* ignore */ }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

/**
 * Whether the shared element is currently unlocked. Useful for showing a
 * "tap to enable voice" banner when playback is blocked.
 */
export function isAudioUnlocked(): boolean {
  return unlocked;
}

// Global fallback: the first time the user interacts with the document at all,
// try to unlock. This catches people who wander around before pressing our
// primary CTA. idempotent — the handlers auto-remove after a successful unlock.
if (typeof window !== 'undefined') {
  const handler = () => {
    primeAudio();
    if (unlocked) {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    }
  };
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('keydown', handler);
  window.addEventListener('touchstart', handler, { passive: true });
}

// Re-export a sentinel so callers can test whether a primeAudio() attempt has
// happened at all (used by UI to decide if "click to enable voice" banner
// should even show).
export function audioUnlockAttempted(): boolean {
  return unlockAttempted;
}
