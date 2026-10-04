/* ============================================================================
 * solventResolve.ts — 把 AI 识别出的溶剂名映射回规范 SolventId
 *
 * 归一思路与 scripts/lib/solvents.mjs 的 normalizeToken 保持一致（见 textNormalize）。
 * ========================================================================== */
import type { SolventId } from '../types/nmr';
import { getDataset } from './searchEngine';
import { normalizeToken } from './textNormalize';

export { normalizeToken };

/** 精确匹配优先，再做双向包含匹配（容忍 "CDCl3 (chloroform-d)" 这类写法） */
export function resolveSolventId(name: string): SolventId | null {
  const ds = getDataset();
  if (!ds || !name) return null;
  const target = normalizeToken(name);
  if (!target) return null;

  // 1) 数据集自带的原始写法 → 规范 ID
  for (const [raw, id] of Object.entries(ds.meta.solventAliases)) {
    if (normalizeToken(raw) === target) return id;
  }

  // 2) 逐溶剂比对展示名 / 化学式 / 别名
  for (const s of ds.solvents) {
    const candidates = [s.label, s.formula, ...s.aliases].map(normalizeToken);
    if (candidates.some((c) => c === target)) return s.id;
  }

  // 3) 宽松包含匹配
  for (const s of ds.solvents) {
    const candidates = [s.label, s.formula, ...s.aliases].map(normalizeToken).filter((c) => c.length >= 3);
    if (candidates.some((c) => target.includes(c) || c.includes(target))) return s.id;
  }
  return null;
}