/**
 * @file digest 缓存层(决策 5:避免重复精读)。
 *
 * P0:JSON 文件,按 sessionId 索引(不检 mtime;--force 重建)。
 * P1:mtime 失效检测 / SQLite(见 design.md Open Questions)。
 *
 * 缓存只存 digest(确定性产物),不缓存 LLM 提取结果(那些进知识库产物)。
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MiningDigest } from "./types.js";

export type DigestCache = Record<string, MiningDigest>;

/** 读缓存;不存在或损坏返回空对象(容错,不抛)。 */
export function readDigestCache(cachePath: string): DigestCache {
  if (!existsSync(cachePath)) return {};
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as DigestCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 写缓存(创建必要目录)。 */
export function writeDigestCache(
  cachePath: string,
  digests: MiningDigest[],
): void {
  const cache: DigestCache = {};
  for (const d of digests) cache[d.sessionId] = d;
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
}

/** 命中返回 cached digest,否则 undefined。 */
export function lookupDigest(
  cache: DigestCache,
  sessionId: string,
): MiningDigest | undefined {
  return cache[sessionId];
}

/** 合并:已有缓存 + 新 digest,返回更新后的完整列表(用于回写)。 */
export function mergeDigests(
  cache: DigestCache,
  fresh: MiningDigest[],
): MiningDigest[] {
  const merged: DigestCache = { ...cache };
  for (const d of fresh) merged[d.sessionId] = d;
  return Object.values(merged);
}
