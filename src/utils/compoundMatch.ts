/* ============================================================================
 * compoundMatch.ts — 按 SMILES 在数据集内查找化合物
 *
 * 仅做字符串归一比较（去空白），不做 SMILES 规范化 / 图同构比对：
 * 未命中即视为库外化合物，不影响 AI 分析。
 * 注意 SMILES 大小写敏感（C 与 c 不同），故不做小写化。
 * ========================================================================== */
import type { CompoundData } from '../types/nmr';
import { getDataset } from './searchEngine';

function normalizeSmiles(s: string): string {
  return s.replace(/\s+/g, '');
}

export function findCompoundBySmiles(smiles: string): CompoundData | null {
  const ds = getDataset();
  if (!ds || !smiles) return null;
  const target = normalizeSmiles(smiles);
  if (!target) return null;
  for (const c of ds.compounds) {
    if (c.smiles && normalizeSmiles(c.smiles) === target) return c;
  }
  return null;
}