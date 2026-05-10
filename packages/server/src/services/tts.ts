/**
 * TTS Service for FurBall Arena
 *
 * Provider chain (tried in order):
 *   1. Minimax (speech-02-turbo) — best Chinese voice quality, if MINIMAX_API_KEY set
 *   2. Qingyun proxy gpt-4o-mini-tts — OpenAI SaaS-style fallback
 *   3. Qingyun tts-1-hd — legacy fallback
 *
 * Env vars are read at call-time (not module-init) to avoid ESM hoisting
 * race with dotenv.config() in index.ts.
 *
 * OpenAI-compatible voices: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse
 * Minimax voices: male-qn-qingse, female-shaonv, male-yujie-miaomiao, ... (see docs)
 */

interface VoiceConfig {
  voice: string;       // OpenAI TTS voice name
  speed: number;       // 0.25 - 4.0
  instructions?: string; // Voice personality instructions for gpt-4o-mini-tts
}

// 23 role-specific voice configurations with workplace personality instructions
const ROLE_VOICES: Record<string, VoiceConfig> = {
  // 打工人阵营 - warm, relatable office worker voices
  villager_cat:   { voice: 'nova', speed: 1.0, instructions: '用普通打工人的语气说话，偶尔叹气抱怨，像一个疲惫但正义的员工' },
  detective_cat:  { voice: 'onyx', speed: 0.9, instructions: '用沉稳专业的语气说话，像一个严肃的HR总监在审查员工' },
  medic_cat:      { voice: 'shimmer', speed: 0.95, instructions: '用温暖但坚定的语气说话，像一个保护员工权益的工会代表' },
  engineer_cat:   { voice: 'echo', speed: 1.1, instructions: '用激动急切的语气说话，像一个熬夜改bug后发现真相的程序员' },
  bodyguard_cat:  { voice: 'ash', speed: 0.85, instructions: '用低沉有力专业的语气说话，像一个拿法律条文说事的法务顾问' },
  medium_cat:     { voice: 'fable', speed: 0.8, instructions: '用缓慢谨慎的语气说话，像一个翻查公司账目的内审专员' },
  vigilante_cat:  { voice: 'coral', speed: 1.0, instructions: '用精确犀利的语气说话，像一个用数据打脸的数据分析师' },
  adventurer_cat: { voice: 'sage', speed: 1.1, instructions: '用自信张扬的语气说话，像一个口才极好的销售冠军' },
  mimic_cat:      { voice: 'verse', speed: 1.0, instructions: '用怯怯的年轻语气说话，像一个初入职场的实习生' },
  politician_cat: { voice: 'ballad', speed: 0.9, instructions: '用圆滑世故的语气说话，像一个混迹职场多年的老油条' },
  // 资本家阵营 - slick, corporate, authoritative voices
  killer_dog:     { voice: 'ash', speed: 0.9, instructions: '用威严霸气的语气说话，像一个大企业CEO在开除员工' },
  spy_dog:        { voice: 'coral', speed: 0.95, instructions: '用油滑自信的语气说话，像一个PPT做得比活干得好的人' },
  morphing_dog:   { voice: 'verse', speed: 1.0, instructions: '用变化无常的语气说话，一会儿共情一会儿甩锅的甩锅王' },
  ninja_dog:      { voice: 'onyx', speed: 0.85, instructions: '用冷酷平静的语气说话，像一个执行裁员的HR' },
  hypnotist_dog:  { voice: 'fable', speed: 0.75, instructions: '用慢条斯理洗脑的语气说话，像一个PUA大师在画大饼' },
  bomber_dog:     { voice: 'echo', speed: 1.2, instructions: '用亢奋急促的语气说话，像一个卷王在催别人加班' },
  assassin_dog:   { voice: 'sage', speed: 0.8, instructions: '用冰冷精确的语气说话，像一个杀伐果断的职场刺客' },
  silencer_dog:   { voice: 'shimmer', speed: 0.7, instructions: '用极其轻柔阴森的语气说话，像一个悄悄禁言你的管理员' },
  // 摸鱼阵营 - quirky, cynical, detached voices
  jester:         { voice: 'echo', speed: 1.3, instructions: '用嬉皮笑脸不正经的语气说话，像一个彻底摆烂的员工' },
  phantom:        { voice: 'fable', speed: 0.75, instructions: '用幽怨飘忽的语气说话，像一个被冤枉背锅后阴魂不散的人' },
  pigeon:         { voice: 'nova', speed: 1.1, instructions: '用轻快但不靠谱的语气说话，像一个总放鸽子的人' },
  lone_wolf:      { voice: 'ash', speed: 0.85, instructions: '用冷淡疏离的语气说话，像一个谁都不信的独行侠' },
  lover:          { voice: 'shimmer', speed: 1.0, instructions: '用甜蜜暧昧的语气说话，像在搞办公室恋情' },
};

function getVoiceConfig(role?: string): VoiceConfig {
  if (role && ROLE_VOICES[role]) return ROLE_VOICES[role];
  return { voice: 'nova', speed: 1.0 };
}

// ---------------------------------------------------------------------------
// Minimax voice mapping — maps our OpenAI-style voice names + role semantics
// to Minimax voice IDs. Minimax provides best-in-class Chinese TTS.
// Voice catalog: https://api.minimax.chat/document/guides/T2A-v2
//
// We pick a colourful mix of mandarin + dialect + specialty voices so the 23
// office-character roles each sound distinct, instead of 23 variations of
// "neutral male". Sichuan/Cantonese/Northeast accents add personality the
// same way the role art does.
// ---------------------------------------------------------------------------
const MINIMAX_VOICE_MAP: Record<string, string> = {
  // Generic OpenAI-style voice → Minimax voice
  alloy: 'male-qn-qingse',           // 青涩男声
  ash: 'male-qn-jingying',            // 精英男声 — for HR/CEO
  ballad: 'presenter_male',           // 主持人男声
  coral: 'female-shaonv',             // 少女音
  echo: 'male-qn-qingse-jingpin',     // 青涩青年精品 — for engineer/卷王
  fable: 'audiobook_male_2',          // 男性有声书 — for 内审/宿命感
  nova: 'female-tianmei',             // 甜美女声
  onyx: 'male-qn-badao',              // 霸道男声 — for boss
  sage: 'presenter_female',           // 主持人女声
  shimmer: 'female-yujie',            // 御姐音 — for senior female
  verse: 'audiobook_female_1',        // 女性有声书
};

function toMinimaxVoice(openaiVoice: string): string {
  return MINIMAX_VOICE_MAP[openaiVoice] ?? 'male-qn-qingse';
}

// ---------------------------------------------------------------------------
// Env var accessors — read lazily at call-time to dodge ESM hoisting race.
// ---------------------------------------------------------------------------
function getEnv() {
  return {
    minimaxKey: process.env.MINIMAX_API_KEY ?? '',
    minimaxGroupId: process.env.MINIMAX_GROUP_ID ?? '',
    minimaxBase: process.env.MINIMAX_BASE_URL ?? 'https://api.minimaxi.com/v1',
    qingyunKey: process.env.QINGYUN_API_KEY ?? '',
    qingyunBase: process.env.QINGYUN_BASE_URL ?? 'https://api.qingyuntop.top/v1',
  };
}

/**
 * Generate TTS audio via best-available provider.
 *
 * Provider priority — based on actual probing of the user's MINIMAX_API_KEY
 * plan against api.minimaxi.com (April 2026):
 *
 *  1. Minimax `t2a_v2` with `speech-2.8-hd` — THE model their plan supports.
 *     speech-02-turbo / speech-02-hd / speech-2.5-hd-preview etc. all return
 *     `2061 your current token plan not support model`. 2.8-hd works. The
 *     v2 endpoint accepts requests without GroupId (proxy plans like sk-cp-…
 *     don't expose a GroupId at all).
 *  2. Minimax `t2a_pro` with `speech-02-turbo` — back-up endpoint; this user
 *     hits `1008 insufficient balance` here, but the chain is correct so a
 *     top-up immediately re-enables it.
 *  3. QingYun `gpt-4o-mini-tts` — OpenAI-compatible proxy fallback
 *  4. QingYun `tts-1-hd` — final OpenAI-compatible fallback
 *
 * Returns null when every provider fails — callers treat null as
 * "use client-side Web Speech API" rather than "no voice at all".
 */
export async function generateTTSAudio(text: string, role?: string): Promise<Buffer | null> {
  const voice = getVoiceConfig(role);
  const env = getEnv();

  // Diagnostic — surfaces why a provider was skipped (regression hunt
  // after several "Minimax should have been first but Qingyun ran first"
  // reports). Strips key body, only logs presence + dead flag.
  console.log(`[TTS gate] minimaxKey=${env.minimaxKey ? 'set' : 'missing'} v2Dead=${minimaxV2Dead} proDead=${minimaxProDead} qingyunDead=${qingyunDead}`);

  // ---- 1. Minimax t2a_v2 with speech-2.8-hd (the supported model) ----
  if (env.minimaxKey && !minimaxV2Dead) {
    const buf = await tryMinimaxV2(text, voice, env);
    if (buf) return buf;
  }

  // ---- 2. Minimax t2a_pro fallback (works once balance is topped up) ----
  if (env.minimaxKey && !minimaxProDead) {
    const buf = await tryMinimaxPro(text, voice, env);
    if (buf) return buf;
  }

  // ---- 3. QingYun gpt-4o-mini-tts (supports `instructions` for prosody) ----
  if (env.qingyunKey && !qingyunDead) {
    const buf = await tryQingyunTTS(text, voice, env, 'gpt-4o-mini-tts');
    if (buf) return buf;

    // ---- 4. Final QingYun fallback: tts-1-hd ----
    const buf2 = await tryQingyunTTS(text, voice, env, 'tts-1-hd');
    if (buf2) return buf2;
  }

  // Everything failed — client falls back to Web Speech (browser-native TTS).
  console.error('[TTS] All providers failed; client should use Web Speech');
  return null;
}

// Sticky "dead provider" flags — once a provider returns 401/quota-exhausted
// or "insufficient balance" once, stop hitting it for the rest of this process
// to keep the speech queue snappy. Cleared on server restart.
let minimaxV2Dead = false;
let minimaxProDead = false;
let qingyunDead = false;

/**
 * Minimax T2A v2 with `speech-2.8-hd` — the model the user's plan supports.
 * GroupId is OPTIONAL on this proxy key (sk-cp- format) — including it when
 * absent yields a 401, so we conditionally append it only when set.
 * Returns MP3 buffer or null on failure.
 */
async function tryMinimaxV2(
  text: string,
  voice: VoiceConfig,
  env: ReturnType<typeof getEnv>,
): Promise<Buffer | null> {
  // The model the user's plan exposes. Prefer this over the older 02-* family
  // because the 2.8 line ships natural-sounding multi-emotion + dialect blend.
  const model = process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd';
  try {
    console.log(`[TTS/Minimax-v2 ${model}] voice=${toMinimaxVoice(voice.voice)} speed=${voice.speed} text="${text.slice(0, 40)}..."`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    const url = env.minimaxGroupId
      ? `${env.minimaxBase}/t2a_v2?GroupId=${env.minimaxGroupId}`
      : `${env.minimaxBase}/t2a_v2`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.minimaxKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        text,
        stream: false,
        voice_setting: {
          voice_id: toMinimaxVoice(voice.voice),
          speed: voice.speed,
          vol: 1.0,
          pitch: 0,
          // Emotion field is supported on speech-2.x — adds expressive prosody
          // when set. Default 'happy' biases the voice towards livelier tone
          // (vs. flat narration), matching the snarky office-arena vibe.
          emotion: 'happy',
        },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS/Minimax-v2] HTTP ${response.status}: ${errText.slice(0, 200)}`);
      if (response.status === 401) minimaxV2Dead = true;
      return null;
    }

    const data = await response.json() as {
      data?: { audio?: string };
      base_resp?: { status_code?: number; status_msg?: string };
    };

    if (data.base_resp && data.base_resp.status_code !== 0) {
      console.error(`[TTS/Minimax-v2] API error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
      // 2061 = "current token plan not support model" → permanent for this run
      // 1008 = "insufficient balance"                  → permanent for this run
      // 2013 = "invalid params"                        → model/endpoint mismatch
      // 2056 = "usage limit exceeded"                  → daily/monthly quota hit
      // All four are NON-recoverable for the rest of the process — mark dead
      // so we don't burn 25s per call timing out repeatedly.
      if ([2061, 1008, 2013, 2056].includes(data.base_resp.status_code ?? 0)) minimaxV2Dead = true;
      return null;
    }

    const hex = data.data?.audio;
    if (!hex || hex.length < 100) return null;

    const buffer = Buffer.from(hex, 'hex');
    console.log(`[TTS/Minimax-v2] Generated ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
  } catch (err) {
    console.error('[TTS/Minimax-v2] Error:', err);
    return null;
  }
}

/**
 * Minimax T2A Pro — older endpoint, returns a download URL for the MP3.
 * Doesn't need GroupId. Supported on most plans (incl. the sk-cp-… proxy keys
 * the user is on). Models: speech-01, speech-02-turbo.
 *
 * Response shape: { audio_file: "<download-url>", trace_id, base_resp, ... }
 * We HEAD-fetch the audio_file to grab the actual MP3 bytes.
 */
async function tryMinimaxPro(
  text: string,
  voice: VoiceConfig,
  env: ReturnType<typeof getEnv>,
): Promise<Buffer | null> {
  // speech-02-turbo first (better prosody), speech-01 as fallback. Both are
  // supported on t2a_pro per probing — older models error out 2013.
  const models = ['speech-02-turbo', 'speech-01'];
  for (const model of models) {
    try {
      console.log(`[TTS/Minimax-pro ${model}] voice=${toMinimaxVoice(voice.voice)} speed=${voice.speed} text="${text.slice(0, 40)}..."`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(`${env.minimaxBase}/t2a_pro`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.minimaxKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          text,
          voice_id: toMinimaxVoice(voice.voice),
          speed: voice.speed,
          vol: 1.0,
          pitch: 0,
          audio_sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          timber_weights: [],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[TTS/Minimax-pro ${model}] HTTP ${response.status}: ${errText.slice(0, 200)}`);
        if (response.status === 401) { minimaxProDead = true; return null; }
        continue;
      }

      const data = await response.json() as {
        audio_file?: string;
        base_resp?: { status_code?: number; status_msg?: string };
      };

      if (data.base_resp && data.base_resp.status_code !== 0) {
        const code = data.base_resp.status_code ?? 0;
        const msg = data.base_resp.status_msg ?? '';
        console.error(`[TTS/Minimax-pro ${model}] ${code}: ${msg}`);
        // 2013 "not have model" → try next model in loop, don't kill provider
        if (code === 2013 && /not have model/i.test(msg)) continue;
        // Insufficient balance / token plan unsupported / usage limit hit
        // → permanent for the rest of the process. Marking dead avoids 25s
        //   timeout per request when the wallet is empty.
        if ([1008, 2061, 2056].includes(code)) { minimaxProDead = true; return null; }
        return null;
      }

      const audioUrl = data.audio_file;
      if (!audioUrl) { console.error(`[TTS/Minimax-pro ${model}] empty audio_file`); continue; }

      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) {
        console.error(`[TTS/Minimax-pro ${model}] audio_file fetch ${audioResp.status}`);
        continue;
      }
      const buffer = Buffer.from(await audioResp.arrayBuffer());
      if (buffer.length < 100) {
        console.error(`[TTS/Minimax-pro ${model}] downloaded audio too small (${buffer.length} bytes)`);
        continue;
      }

      console.log(`[TTS/Minimax-pro ${model}] Generated ${(buffer.length / 1024).toFixed(1)} KB`);
      return buffer;
    } catch (err) {
      console.error(`[TTS/Minimax-pro ${model}] Error:`, err);
      continue;
    }
  }
  return null;
}

/**
 * Qingyun proxy — OpenAI-compatible /audio/speech endpoint.
 */
async function tryQingyunTTS(
  text: string,
  voice: VoiceConfig,
  env: ReturnType<typeof getEnv>,
  model: string,
): Promise<Buffer | null> {
  try {
    console.log(`[TTS/Qingyun ${model}] voice=${voice.voice} speed=${voice.speed} text="${text.slice(0, 40)}..."`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${env.qingyunBase}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.qingyunKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
        voice: voice.voice,
        speed: voice.speed,
        response_format: 'mp3',
        // Only gpt-4o-mini-tts accepts `instructions`
        ...(model === 'gpt-4o-mini-tts' && voice.instructions ? { instructions: voice.instructions } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS/Qingyun ${model}] HTTP ${response.status}: ${errText.slice(0, 200)}`);
      // Quota exhausted / token revoked → no point retrying on next speech.
      if (response.status === 401 || response.status === 429
          || /额度已用尽|quota|insufficient/i.test(errText)) {
        qingyunDead = true;
      }
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const errData = await response.json();
      console.error(`[TTS/Qingyun ${model}] JSON error:`, JSON.stringify(errData).slice(0, 200));
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) {
      console.error(`[TTS/Qingyun ${model}] Audio too small (${buffer.length} bytes)`);
      return null;
    }

    console.log(`[TTS/Qingyun ${model}] Generated ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
  } catch (err) {
    console.error(`[TTS/Qingyun ${model}] Error:`, err);
    return null;
  }
}

export { ROLE_VOICES, getVoiceConfig };
