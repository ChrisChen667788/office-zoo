/**
 * atomicJson — v6.162 — JSON 存储的原子写,全仓统一从这里走。
 *
 * 此前 23 个存储各自 `writeFile(DATA_FILE + '.tmp') → rename`:同一个文件的两次写入并发时
 * 共用一个 .tmp 路径,先 rename 的把文件挪走,后 rename 的就 ENOENT(一局 8 个人同时投票,
 * characterStatsStore 每票写一次,必然撞上)。现在:
 *   - 内容在调用时序列化(快照),写入按文件串行(与 relationStore 的 writeChain 同理);
 *   - 每次写用独立的临时文件名,失败时清掉临时文件,不留孤儿 .tmp;
 *   - 错误照常抛给调用方(各存储原本就有自己的 try/catch 兜底)。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const chains = new Map<string, Promise<void>>();
let seq = 0;

export function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  const prev = chains.get(file) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${++seq}.tmp`;
    try {
      await fs.writeFile(tmp, text, 'utf8');
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  });
  chains.set(file, next);
  // 队列清空后释放 Map 条目;派生出来的 promise 要吞掉拒绝,否则会变成未处理的 rejection。
  next.finally(() => { if (chains.get(file) === next) chains.delete(file); }).catch(() => {});
  return next;
}
