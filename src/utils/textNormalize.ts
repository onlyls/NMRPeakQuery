/* ============================================================================
 * textNormalize.ts — 名称归一化
 *
 * 与 scripts/lib/solvents.mjs 的 normalizeToken 保持一致：
 * 统一连字符（en/em dash、minus → '-'）并去除所有空白、转小写。
 * 数据集 meta.compoundAliases / meta.solventAliases 的键均由同一规则生成。
 * ========================================================================== */

export function normalizeToken(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 去掉括号及其内容："二氯甲烷（DCM）" → "二氯甲烷" */
export function stripParentheticals(raw: string): string {
  return raw.replace(/\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]/g, '').trim();
}

/** CAS 号统一形态（仅保留字母数字并大写）："75-09-2" → "75092" */
export function casKey(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}