/**
 * scripts/lib/solvents.mjs
 *
 * 12 种氘代溶剂的规范定义与别名归一。
 *
 * 三篇文献对同一溶剂的写法互不相同，且 PDF 文本层会把下标拆开
 * （"CD3CN" → "CD 3 CN"，"(CD3)2CO" → "(CD 3 ) 2 CO"，"THF-d8" → "THF- d 8"）。
 * 因此所有别名匹配统一先做 normalizeToken()（去空白 + 统一连字符 + 小写），
 * 再与别名索引比对。
 *
 * 三种来源写法对照：
 *   1997 正文      (CD3)2CO / (CD3)2SO / C6D6 / CD3CN / CD3OD / CDCl3 / D2O
 *   2010 正文+SI   (CD3)2CO / (CD3)2SO / C6D6 / CD3CN / CD3OD / CDCl3 / D2O
 *                  + THF-d8 / CD2Cl2 / toluene-d8 / C6D5Cl / TFE-d3
 *   2016 SI        acetone-d6 / DMSO-d6 / CDCl3 / CD3CN / CD3OD / D2O
 *   方案文档       Acetone-d6 / DMSO-d6 / ...（展示名风格）
 */

/** 统一连字符（en dash / em dash / minus → '-'）并去除所有空白 */
export function normalizeToken(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/[\u2010-\u2015\u2212]/g, '-') // ‐ ‑ ‒ – — ― −
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 规范溶剂表；aliases 为「紧凑写法」，匹配前会经 normalizeToken */
export const SOLVENTS = [
  {
    id: 'cdcl3',
    label: 'CDCl3',
    formula: 'CDCl3',
    aliases: ['CDCl3', 'CDCl3-d', 'chloroform-d', 'chloroform-d1'],
  },
  {
    id: 'dcm_d2',
    label: 'CD2Cl2',
    formula: 'CD2Cl2',
    aliases: ['CD2Cl2', 'dichloromethane-d2', 'methylenechloride-d2', 'CH2Cl2-d2'],
  },
  {
    id: 'acetone_d6',
    label: 'Acetone-d6',
    formula: '(CD3)2CO',
    aliases: ['(CD3)2CO', 'acetone-d6', 'acetoned6'],
  },
  {
    id: 'dmso_d6',
    label: 'DMSO-d6',
    formula: '(CD3)2SO',
    aliases: ['(CD3)2SO', 'DMSO-d6', 'dimethylsulfoxide-d6', 'dimethylsulfoxided6'],
  },
  {
    id: 'c6d6',
    label: 'C6D6',
    formula: 'C6D6',
    aliases: ['C6D6', 'benzene-d6', 'benzened6'],
  },
  {
    id: 'cd3cn',
    label: 'CD3CN',
    formula: 'CD3CN',
    aliases: ['CD3CN', 'acetonitrile-d3', 'acetonitriled3', 'CH3CN-d3'],
  },
  {
    id: 'cd3od',
    label: 'CD3OD',
    formula: 'CD3OD',
    aliases: ['CD3OD', 'methanol-d4', 'methanold4', 'CH3OD'],
  },
  {
    id: 'd2o',
    label: 'D2O',
    formula: 'D2O',
    aliases: ['D2O', 'deuteriumoxide', 'heavywater'],
  },
  {
    id: 'thf_d8',
    label: 'THF-d8',
    formula: 'C4D8O',
    aliases: ['THF-d8', 'tetrahydrofuran-d8', 'tetrahydrofurand8'],
  },
  {
    id: 'toluene_d8',
    label: 'Toluene-d8',
    formula: 'C7D8',
    aliases: ['toluene-d8', 'toluened8', 'C6D5CD3'],
  },
  {
    id: 'chlorobenzene_d5',
    label: 'C6D5Cl',
    formula: 'C6D5Cl',
    aliases: ['C6D5Cl', 'chlorobenzene-d5', 'chlorobenzened5'],
  },
  {
    id: 'tfe_d3',
    label: 'TFE-d3',
    formula: 'CF3CD2OD',
    aliases: ['TFE-d3', 'trifluoroethanol-d3', '2,2,2-trifluoroethanol-d3'],
  },
];

/** normalizeToken(alias) → SolventId */
export const SOLVENT_ALIAS_INDEX = (() => {
  /** @type {Record<string,string>} */
  const idx = {};
  for (const s of SOLVENTS) {
    idx[normalizeToken(s.id)] = s.id;
    idx[normalizeToken(s.label)] = s.id;
    idx[normalizeToken(s.formula)] = s.id;
    for (const a of s.aliases) idx[normalizeToken(a)] = s.id;
  }
  return idx;
})();

/** 原始写法 → SolventId；无法识别返回 null（调用方须记录到复核清单） */
export function resolveSolvent(raw) {
  return SOLVENT_ALIAS_INDEX[normalizeToken(raw)] ?? null;
}

/** 供 meta.solventAliases 落库：原始写法 → 规范 ID */
export function buildSolventAliasMap(extraRawSpellings = []) {
  /** @type {Record<string,string>} */
  const map = {};
  for (const s of SOLVENTS) {
    for (const a of s.aliases) map[a] = s.id;
  }
  for (const raw of extraRawSpellings) {
    const id = resolveSolvent(raw);
    if (id) map[String(raw).trim()] = id;
  }
  return map;
}
