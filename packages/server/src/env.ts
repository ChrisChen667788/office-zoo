/**
 * env — v6.165 — 服务端入口的第一个 import:在任何业务模块求值之前加载 .env。
 *
 * ESM 的 import 会提升:index.ts 里写在 import 之后的 dotenv.config() 实际晚于所有业务模块的
 * 顶层代码执行,所以过去 imageGen / iconGen 各自 `import 'dotenv/config'` 抢先加载——副作用是
 * 任何 import 了它们的测试都会把开发者本机 .env 里的真实 key 读进测试进程,测试于是可能真的
 * 拿用户的 key 调外部接口。现在只有入口(本文件)和独立脚本加载 .env,业务模块一律不碰。
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// monorepo 根目录的 .env(packages/server/src → ../../../.env),再试 CWD/.env(不覆盖已有值)
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config();
