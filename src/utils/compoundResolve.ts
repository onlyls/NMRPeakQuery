/* ============================================================================
 * compoundResolve.ts — 把 AI 返回的化合物 / 溶剂标签解析为库内化合物
 *
 * AI 常给出「中文名（缩写）」这类复合写法，如
 *   "二氯甲烷（DCM）" / "1,4-二氧六环（dioxane）" / "EtOAc"
 * 直接整串检索会失配，故按 CAS → 整串 → 逐 token 依次尝试。
 * ========================================================================== */
import type { CompoundData } from '../types/nmr';
import { getDataset, searchByName } from './searchEngine';
import { casKey, normalizeToken } from './textNormalize';

/** 从标签中切出候选 token：括号内容独立成词，「1,4-二氧六环」这类保留逗号 */
function splitTokens(label: string): string[] {
  const unified = label.replace(/[（(【[{]/g, '|').replace(/[）)】\]}]/g, '|');
  const out: string[] = [];
  for (const part of unified.split(/[|/;；、·\s]+/)) {
    const t = part.trim();
    if (t.length >= 2) out.push(t);
  }
  return [...new Set(out)];
}

function byId(id: string): CompoundData | null {
  return getDataset()?.compounds.find((c) => c.id === id) ?? null;
}

function byCas(key: string): CompoundData | null {
  if (!key) return null;
  return getDataset()?.compounds.find((c) => c.cas && casKey(c.cas) === key) ?? null;
}

function resolveToken(token: string): CompoundData | null {
  const ds = getDataset();
  if (!ds) return null;
  // 1) 中文名精确匹配
  const cn = ds.compounds.find((c) => c.chineseName && c.chineseName === token);
  if (cn) return cn;
  // 2) 数据集自带的别名表（归一化写法 → 化合物 id）
  const id = ds.meta.compoundAliases?.[normalizeToken(token)];
  if (id) {
    const hit = byId(id);
    if (hit) return hit;
  }
  // 3) 通用名称 / CAS / 文献写法检索
  return searchByName(token)[0]?.compound ?? null;
}

/** 把 AI 给出的化合物标签解析为库内化合物；无法解析返回 null（如「水」不是化合物） */
export function resolveCompoundByLabel(label: string, cas?: string): CompoundData | null {
  const ds = getDataset();
  if (!ds) return null;

  // 1) AI 显式给出的 CAS
  if (cas?.trim()) {
    const hit = byCas(casKey(cas));
    if (hit) return hit;
  }

  const text = label?.trim() ?? '';
  if (!text) return null;

  // 2) 标签里内嵌的 CAS 形态，如 "dichloromethane (75-09-2)"
  const embedded = text.match(/\d{2,7}-\d{2}-\d/);
  if (embedded) {
    const hit = byCas(casKey(embedded[0]));
    if (hit) return hit;
  }

  // 3) 整串检索（已支持「中文名（缩写）」写法）
  const whole = searchByName(text)[0]?.compound;
  if (whole) return whole;

  // 4) 逐 token 检索
  for (const token of splitTokens(text)) {
    const hit = resolveToken(token);
    if (hit) return hit;
  }
  return null;
}