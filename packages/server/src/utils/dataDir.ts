/**
 * dataDir — v6.162 — 服务端所有 JSON 存储的根目录,全仓统一从这里取。
 *
 *   FURBALL_DATA_DIR 设置了就用它(Docker 挂数据卷、测试用临时目录);
 *   否则沿用历史位置 packages/server/data/。
 *
 * 此前 29 个模块各自 `path.resolve(__dirname, '..', '..', 'data')`:测试会直接改写、删除
 * 开发者本机的真实数据(grudgeVote 测试每跑一次就删一次 relations.json),容器里也没法把
 * 数据放到卷上。模块加载时取值一次——与原来的常量语义一致。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.FURBALL_DATA_DIR?.trim()
  ? path.resolve(process.env.FURBALL_DATA_DIR.trim())
  : path.resolve(here, '..', '..', 'data');
