/**
 * scripts/lib/compounds.mjs
 *
 * 三篇文献的化合物命名归一。
 *
 * 与溶剂一样，PDF 文本层会把连字符两侧拆开（2016 SI 写作 "n -butanol"、
 * "iso -butyl acetate"），且三篇文献对同一物质常用不同名称：
 *
 *   1997 / 2010                2016 SI
 *   ----------------------     ----------------------
 *   dioxane                    1,4-dioxane（2010 用此写法）
 *   tert-butyl alcohol         tert-butanol
 *   2-propanol                 iso-propanol
 *   ethyl methyl ketone        methyl ethyl ketone
 *   ethyl benzene              ethylbenzene（且 2016 内部两种写法混用）
 *   —                          iso-butanol / iso-amyl alcohol / iso-amyl acetate …
 *
 * 原则：**不做任何自动等价推断**（MEK ≠ MIBK，MTBE ≠ ETBE ≠ TAME）。
 * 只登记「化学上确为同一物质」的同义组；同义组之外的原始写法一律以
 * 归一化字符串作为 id，重复者会在校验阶段暴露出来，进入人工复核清单。
 */
import { normalizeToken } from './solvents.mjs';

/** 归一化：去空白 + 统一连字符 + 小写 + 去掉首尾引号/句点 */
export function normalizeName(raw) {
  return normalizeToken(raw)
    .replace(/^[\u2018\u2019\u201c\u201d"'`(]+/, '')
    .replace(/[\u2018\u2019\u201c\u201d"'`)]+$/, '')
    .replace(/\.$/, '');
}

/**
 * 同义组：同一 id 下所有写法（含 PDF 拆写形态）都归一到该 id。
 * aliases 只需写「紧凑写法」，匹配前会再走 normalizeName。
 */
export const COMPOUND_SYNONYMS = [
  {
    id: 'dioxane',
    name: '1,4-Dioxane',
    aliases: ['dioxane', '1,4-dioxane', 'p-dioxane', '1,4diethyleneoxide'],
  },
  {
    id: 'tert-butanol',
    name: 'tert-Butyl alcohol',
    aliases: ['tert-butyl alcohol', 'tert-butanol', 't-butanol', '2-methyl-2-propanol'],
  },
  {
    id: '2-propanol',
    name: '2-Propanol',
    aliases: ['2-propanol', 'iso-propanol', 'isopropanol', 'propan-2-ol', 'ipa'],
  },
  {
    id: 'methyl-ethyl-ketone',
    name: 'Methyl ethyl ketone',
    aliases: ['ethyl methyl ketone', 'methyl ethyl ketone', '2-butanone', 'butan-2-one', 'mek'],
  },
  {
    id: 'ethylbenzene',
    name: 'Ethylbenzene',
    aliases: ['ethylbenzene', 'ethyl benzene'],
  },
  {
    id: 'isoamyl-alcohol',
    name: 'iso-Amyl alcohol',
    aliases: ['iso-amyl alcohol', 'isoamyl alcohol', '3-methyl-1-butanol', 'isopentyl alcohol'],
  },
  {
    id: 'isobutanol',
    name: 'iso-Butyl alcohol',
    aliases: ['iso-butanol', 'isobutanol', 'isobutyl alcohol', '2-methyl-1-propanol'],
  },
  {
    id: 'isoamyl-acetate',
    name: 'iso-Amyl acetate',
    aliases: ['iso-amyl acetate', 'isoamyl acetate', 'isopentyl acetate'],
  },
  {
    // 文献一侧写简称 "MTBE"（2010），另一侧写全称 "tert-butyl methyl ether"（2016），
    // 二者 PubChem CID 同为 15413，确为同一物质。
    id: 'mtbe',
    name: 'tert-Butyl methyl ether (MTBE)',
    aliases: [
      'mtbe',
      'tert-butyl methyl ether',
      'methyl tert-butyl ether',
      't-butyl methyl ether',
      '2-methoxy-2-methylpropane',
    ],
  },
  {
    id: 'isobutyl-acetate',
    name: 'iso-Butyl acetate',
    aliases: ['iso-butyl acetate', 'isobutyl acetate'],
  },
  {
    id: 'isopropyl-acetate',
    name: 'iso-Propyl acetate',
    aliases: ['iso-propyl acetate', 'isopropyl acetate'],
  },
  {
    id: 'ethyl-lactate',
    name: 'Ethyl lactate',
    aliases: ['l-ethyl lactate', 'ethyl lactate', 'ethyl l-lactate'],
  },
  {
    id: 'silicone-grease',
    name: 'Silicone grease',
    aliases: ['silicone grease', 'siliconegrease'],
  },
  {
    id: 'apiezon-h-grease',
    name: 'Apiezon H grease',
    aliases: ['h grease', 'apiezon h grease', 'apiezonhgrease'],
  },
  {
    // 1997 的 “grease”(engine oil) 被 2010 SI 明确「替换为」VWR vacuum pump oil #19，
    // 二者占同一槽位，2010 覆盖 1997（见 build-dataset 的 corrections）。
    id: 'pump-oil',
    name: 'Vacuum pump oil (VWR #19)',
    aliases: ['grease', 'pump oil', 'motor oil', 'engine oil', 'vwr vacuum pump oil'],
  },
];

/** 归一化写法 → 规范 id（同义组 + 兜底为归一化字符串本身） */
export const COMPOUND_ALIAS_INDEX = (() => {
  /** @type {Record<string,string>} */
  const idx = {};
  for (const g of COMPOUND_SYNONYMS) {
    for (const a of [g.id, g.name, ...g.aliases]) idx[normalizeName(a)] = g.id;
  }
  return idx;
})();

/** 同义组的展示名 */
export const COMPOUND_DISPLAY = (() => {
  /** @type {Record<string,string>} */
  const d = {};
  for (const g of COMPOUND_SYNONYMS) d[g.id] = g.name;
  return d;
})();

/**
 * 人工整理的中文名。
 *
 * PubChem 不收录中文名（85 个化合物的 synonyms 里筛 CJK 全部落空），
 * 而本项目面向中文用户，故由人工整理此表；因其非文献原文、亦非 PubChem 数据，
 * 套用时会在化合物上标记 `chineseNameSource: 'manual'`。
 * 名称以 GB 常用名为准，文献惯用简称（MTBE / DMSO / THF …）附在括号内。
 */
export const COMPOUND_CHINESE = {
  '1,2-dichloroethane': '1,2-二氯乙烷',
  '1,2-dimethoxyethane': '1,2-二甲氧基乙烷',
  '18-crown-6': '18-冠-6',
  '2-methf': '2-甲基四氢呋喃',
  '2-propanol': '异丙醇',
  aceticacid: '乙酸（醋酸）',
  aceticanhydride: '乙酸酐（醋酸酐）',
  acetone: '丙酮',
  acetonitrile: '乙腈',
  allylacetate: '乙酸烯丙酯',
  anisole: '苯甲醚（茴香醚）',
  'apiezon-h-grease': 'Apiezon H 真空脂',
  benzaldehyde: '苯甲醛',
  benzene: '苯',
  benzylalcohol: '苯甲醇（苄醇）',
  bha: '丁基羟基茴香醚（BHA）',
  bht: '2,6-二叔丁基-4-甲基苯酚（BHT）',
  carbondioxide: '二氧化碳',
  carbondisulfide: '二硫化碳',
  carbontetrachloride: '四氯化碳',
  chlorobenzene: '氯苯',
  chloroform: '氯仿（三氯甲烷）',
  cpme: '环戊基甲醚（CPME）',
  cyclohexane: '环己烷',
  cyclohexanone: '环己酮',
  diallylcarbonate: '碳酸二烯丙酯',
  dichloromethane: '二氯甲烷',
  diethylether: '乙醚',
  diglyme: '二乙二醇二甲醚（二甘醇二甲醚）',
  dimethylacetamide: 'N,N-二甲基乙酰胺（DMAc）',
  dimethylcarbonate: '碳酸二甲酯',
  dimethylformamide: 'N,N-二甲基甲酰胺（DMF）',
  dimethylmalonate: '丙二酸二甲酯',
  dimethylsulfoxide: '二甲基亚砜（DMSO）',
  dioxane: '1,4-二氧六环',
  dmpu: '1,3-二甲基-3,4,5,6-四氢-2(1H)-嘧啶酮（DMPU）',
  etbe: '乙基叔丁基醚（ETBE）',
  ethane: '乙烷',
  ethanol: '乙醇',
  'ethyl-lactate': '乳酸乙酯',
  ethylacetate: '乙酸乙酯',
  ethylbenzene: '乙苯',
  ethylene: '乙烯',
  ethyleneglycol: '乙二醇',
  formicacid: '甲酸',
  furan: '呋喃',
  glycoldiacetate: '乙二醇二乙酸酯',
  hexamethylbenzene: '六甲基苯',
  hexamethyldisiloxane: '六甲基二硅氧烷',
  hmpa: '六甲基磷酰三胺（HMPA）',
  hydrogen: '氢气',
  imidazole: '咪唑',
  'isoamyl-acetate': '乙酸异戊酯',
  'isoamyl-alcohol': '异戊醇',
  isobutanol: '异丁醇',
  'isobutyl-acetate': '乙酸异丁酯',
  'isopropyl-acetate': '乙酸异丙酯',
  'm-xylene': '间二甲苯',
  methane: '甲烷',
  methanol: '甲醇',
  'methyl-ethyl-ketone': '丁酮（甲基乙基酮，MEK）',
  methylacetate: '乙酸甲酯',
  methylcyclohexane: '甲基环己烷',
  mibk: '4-甲基-2-戊酮（甲基异丁基酮，MIBK）',
  mtbe: '叔丁基甲醚（MTBE）',
  'n-butanol': '正丁醇',
  'n-butylacetate': '乙酸正丁酯',
  'n-heptane': '正庚烷',
  'n-hexane': '正己烷',
  'n-pentane': '正戊烷',
  nitromethane: '硝基甲烷',
  'o-xylene': '邻二甲苯',
  'p-cymene': '对伞花烃（4-异丙基甲苯）',
  'p-xylene': '对二甲苯',
  propane: '丙烷',
  propylene: '丙烯',
  'pump-oil': '真空泵油（VWR #19）',
  pyridine: '吡啶',
  pyrrole: '吡咯',
  pyrrolidine: '吡咯烷',
  'silicone-grease': '硅脂',
  sulfolane: '环丁砜',
  tame: '叔戊基甲醚（TAME）',
  'tert-butanol': '叔丁醇',
  tetrahydrofuran: '四氢呋喃（THF）',
  toluene: '甲苯',
  triethylamine: '三乙胺',
};

const GASES = new Set([
  'hydrogen',
  'methane',
  'ethane',
  'ethylene',
  'propane',
  'propylene',
  'carbondioxide',
]);

const ADDITIVES = new Set([
  'bht',
  'bha',
  '18-crown-6',
  'hexamethylbenzene',
  'silicone-grease',
  'apiezon-h-grease',
  'pump-oil',
  'squalene',
]);

/** 粗略分类，仅用于 UI 分组；不确定的一律 Organic Solvent */
export function categorize(id) {
  if (GASES.has(id) || /^carbon(dioxide|monoxide)$/.test(id)) return 'Gas';
  if (ADDITIVES.has(id)) return 'Additive/Grease';
  if (/grease|oil/.test(id)) return 'Additive/Grease';
  return 'Organic Solvent';
}

/** 原始写法 → { id, name, category } */
export function resolveCompound(raw) {
  const key = normalizeName(raw);
  const id = COMPOUND_ALIAS_INDEX[key] ?? key;
  return {
    id,
    name: COMPOUND_DISPLAY[id] ?? raw.trim(),
    category: categorize(id),
  };
}
