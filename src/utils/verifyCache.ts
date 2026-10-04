/* ============================================================================
 * verifyCache.ts — 「数据集核验」AI 结果的本地缓存
 *
 * 依据设置 verifyCache 选择存储介质：
 *   'session' → sessionStorage（关闭标签页清除）
 *   'local'   → localStorage（持久保存）
 *   'off'     → 不缓存
 * 仅缓存 verify 任务；缓存值为 { data, model, raw }，命中时由调用方补 fromCache。
 * ========================================================================== */
import type { AiCallResult } from '../types/ai';
import { getAiSettings, type VerifyCacheMode } from './aiSettings';

const NS = 'nmrpeakquery.ai.verifycache.v1:';

function store(mode: VerifyCacheMode): Storage | null {
  if (mode === 'off' || typeof window === 'undefined') return null;
  try {
    return mode === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** djb2 字符串哈希 → 短 key，避免超长键 */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 缓存键：同一任务输入 + 附加指令 → 相同键；指令变化即视为不同缓存 */
export function verifyCacheKey(payload: { input: Record<string, unknown>; extra: string }): string {
  return `${NS}${hash(JSON.stringify(payload))}`;
}

export function readVerifyCache<T>(key: string): AiCallResult<T> | null {
  if (!key) return null;
  const s = store(getAiSettings().verifyCache);
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as AiCallResult<T>) : null;
  } catch {
    return null;
  }
}

export function writeVerifyCache<T>(key: string, value: AiCallResult<T>): void {
  if (!key) return;
  const s = store(getAiSettings().verifyCache);
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify({ data: value.data, model: value.model, raw: value.raw }));
  } catch {
    /* 隐私模式 / 配额不足时静默失败 */
  }
}

function collectKeys(s: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(NS)) keys.push(k);
  }
  return keys;
}

function eachStore(fn: (s: Storage) => void): void {
  if (typeof window === 'undefined') return;
  for (const s of [window.localStorage, window.sessionStorage]) {
    try {
      fn(s);
    } catch {
      /* localStorage 可能被禁用 */
    }
  }
}

/** 清空全部核验缓存，返回清除条数 */
export function clearVerifyCache(): number {
  let n = 0;
  eachStore((s) => {
    const keys = collectKeys(s);
    keys.forEach((k) => s.removeItem(k));
    n += keys.length;
  });
  return n;
}

export function countVerifyCache(): number {
  let n = 0;
  eachStore((s) => {
    n += collectKeys(s).length;
  });
  return n;
}
