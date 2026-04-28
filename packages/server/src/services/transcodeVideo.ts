/**
 * transcodeVideo — wrap ffmpeg as a child process for server-side video
 * format conversion.
 *
 * v0.4.0 use case: client renders the share video with `MediaRecorder`,
 * which on Chrome / Firefox produces webm. Some platforms (especially
 * 微信 / 抖音 desktop) reject webm uploads. We pipe the webm through ffmpeg
 * to produce an h.264 mp4 the user can drop into any platform.
 *
 * Why ffmpeg as a child process and not `fluent-ffmpeg`:
 *   - One less npm dep to install
 *   - The fluent wrapper hides the underlying process — when ffmpeg is
 *     missing on the host we want to surface that loudly, not silently
 *   - Direct stdin/stdout piping is simpler than fluent's stream API for
 *     "in → out" transcodes
 *
 * Operational notes:
 *   - Requires ffmpeg installed on the host (`brew install ffmpeg` /
 *     `apt-get install ffmpeg`). The boot probe at first call surfaces
 *     this clearly so deploy environments without ffmpeg fail fast.
 *   - We cap input size at 50 MB to avoid memory blow-ups on a public
 *     endpoint. A 30 s 1080p webm at 4 Mbps is ~15 MB, so 50 is generous.
 *   - 60 s wall-clock cap on the ffmpeg run — single source of latency
 *     guarantee for the client UX.
 */
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';

const exec = promisify(execCb);

export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 60_000;

/** Memoised availability probe — runs `ffmpeg -version` once per process. */
let ffmpegAvailable: boolean | null = null;
export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await exec('ffmpeg -version', { timeout: 4000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

export interface TranscodeResult {
  ok: true;
  buffer: Buffer;
  mimeType: 'video/mp4';
}
export interface TranscodeError {
  ok: false;
  reason: 'no-ffmpeg' | 'too-large' | 'ffmpeg-failed' | 'timeout';
  message: string;
}

/**
 * Pipe a webm/mp4/whatever video through ffmpeg, return an h.264 mp4 buffer.
 * Cross-platform mp4 (yuv420p + faststart) so it plays in WeChat / 抖音 /
 * Twitter desktop without re-encoding.
 */
export async function transcodeToMp4(
  inputBytes: Buffer,
): Promise<TranscodeResult | TranscodeError> {
  if (inputBytes.length > MAX_INPUT_BYTES) {
    return { ok: false, reason: 'too-large', message: `input exceeds ${MAX_INPUT_BYTES} bytes` };
  }
  if (!(await isFfmpegAvailable())) {
    return {
      ok: false, reason: 'no-ffmpeg',
      message: 'ffmpeg not installed on server. Install via `brew install ffmpeg` or `apt-get install ffmpeg`.',
    };
  }

  return await new Promise<TranscodeResult | TranscodeError>((resolve) => {
    // -i pipe:0   read input from stdin
    // -c:v libx264 + -profile:v baseline + yuv420p   maximum browser/mobile compat
    // -movflags +faststart   moov atom at the front so streaming starts immediately
    // -preset veryfast   trade some compression for lower CPU (we run on tight budget)
    // -crf 23   visually lossless-ish for our brand canvas content
    // -an   no audio (v0.3.x has no audio overlay yet; v0.3.2 adds optional)
    // -f mp4 pipe:1  output mp4 stream to stdout
    const args = [
      '-hide_banner', '-loglevel', 'warning',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-preset', 'veryfast',
      '-crf', '23',
      '-an',
      '-f', 'mp4',
      'pipe:1',
    ];
    const ff = spawn('ffmpeg', args);

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { ff.kill('SIGKILL'); } catch { /* noop */ }
      resolve({ ok: false, reason: 'timeout', message: `ffmpeg exceeded ${FFMPEG_TIMEOUT_MS}ms` });
    }, FFMPEG_TIMEOUT_MS);

    ff.stdout.on('data', (c) => outChunks.push(c));
    ff.stderr.on('data', (c) => errChunks.push(c));
    ff.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: 'ffmpeg-failed', message: (err as Error).message });
    });
    ff.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').slice(0, 300);
        resolve({ ok: false, reason: 'ffmpeg-failed', message: `exit ${code}: ${stderr}` });
        return;
      }
      resolve({ ok: true, buffer: Buffer.concat(outChunks), mimeType: 'video/mp4' });
    });

    // Pipe input via stdin then close stdin so ffmpeg knows EOF.
    ff.stdin.end(inputBytes);
  });
}
