/**
 * sampleReplays — v6.168 — 随仓库发布的「示例对局」。
 *
 * 托管版不提供模型 API(owner 决策),没配 key 的访客也要能看到一局完整的 AI 对局:示例对局是
 * 开发者本机用自己的 key 真实跑出来的回放,经脱敏后放进 assets-pack/sample-replays/,
 * 回放页直接读取,不调用任何模型。
 *
 * 脱敏规则(sanitizeForSample,纯函数):
 *   - 去掉真人占座玩家的发言(byHuman)和场边真人发言事件(human_speech)—— 都是用户打的字;
 *   - 玩家名必须全部来自内置 AI 名单:用了自定义公司主题包(名字是用户填的)的对局一律拒绝;
 *   - 必须有发言(没有 AI 发言的回放没有示例价值);
 *   - gameId 改成 sample-<原 id 数字部分>,打上 sample: true。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReplayRecord } from '@furball/shared';
import { packAssetDir } from '../utils/assetDirs';

export const SAMPLE_PREFIX = 'sample-';
const USER_TEXT_EVENT_TYPES = new Set(['human_speech']);

export function sampleReplayDir(): string {
  return path.join(path.dirname(packAssetDir('icons')), 'sample-replays');
}

export interface SanitizeResult {
  ok: boolean;
  record?: ReplayRecord;
  problems: string[];
  dropped: { humanSpeeches: number; userTextEvents: number };
}

export function sanitizeForSample(rec: ReplayRecord, allowedNames: readonly string[]): SanitizeResult {
  const problems: string[] = [];
  const allowed = new Set(allowedNames);
  const customNames = rec.players.map((p) => p.name).filter((n) => !allowed.has(n));
  if (customNames.length) problems.push(`玩家名不在内置 AI 名单里(疑似自定义公司主题包,名字是用户填的):${customNames.join('、')}`);
  const speeches = (rec.speeches ?? []).filter((s) => !s.byHuman);
  const humanSpeeches = (rec.speeches?.length ?? 0) - speeches.length;
  if (speeches.length === 0) problems.push('没有 AI 发言(v6.168 之前的回放不记录发言,请用新对局)');
  const timeline = rec.timeline.filter((e) => !USER_TEXT_EVENT_TYPES.has(e.type));
  const dropped = { humanSpeeches, userTextEvents: rec.timeline.length - timeline.length };
  if (problems.length) return { ok: false, problems, dropped };
  const digits = rec.gameId.replace(/\D/g, '').slice(-13) || '0';
  return {
    ok: true,
    problems,
    dropped,
    record: { ...rec, gameId: `${SAMPLE_PREFIX}${digits}`, speeches, timeline, sample: true },
  };
}

let cache: ReplayRecord[] | null = null;

/** 读资产包里的示例对局(按 endedAt 新到旧);目录不存在返回空。结果缓存在进程里。 */
export function listSampleReplays(): ReplayRecord[] {
  if (cache) return cache;
  const dir = sampleReplayDir();
  const out: ReplayRecord[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!/^sample-[0-9]+\.json$/.test(f)) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ReplayRecord;
        if (rec?.sample && rec.gameId?.startsWith(SAMPLE_PREFIX) && Array.isArray(rec.timeline)) out.push(rec);
      } catch (err) {
        console.warn(`[sampleReplays] skip unreadable ${f}:`, (err as Error).message);
      }
    }
  }
  cache = out.sort((a, b) => b.endedAt - a.endedAt);
  return cache;
}

export function getSampleReplay(id: string): ReplayRecord | null {
  if (!id.startsWith(SAMPLE_PREFIX)) return null;
  return listSampleReplays().find((r) => r.gameId === id) ?? null;
}

export function __resetSampleCacheForTest(): void {
  cache = null;
}
