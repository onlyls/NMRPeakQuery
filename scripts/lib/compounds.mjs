/**
 * scripts/lib/compounds.mjs
 *
 * 四篇文献的化合物命名归一。
 *
 * 与溶剂一样，PDF 文本层会把连字符两侧拆开（2016 SI 写作 "n -butanol"、
 * "iso -butyl acetate"），且各来源文献对同一物质常用不同名称：
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
    aliases: ['silicone grease', 'siliconegrease', 'silicon grease'],
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

  // ───────────── 2023（Cseri et al.）新增 / 跨来源合并 ─────────────
  // 2023 SI 里同一物质常用「系统命名」或俗称，与 1997/2010/2016 的写法不同；
  // 下列各组把确为同一物质的写法归并到同一 id（不做任何自动等价推断）。

  // 与既有来源的同物质合并（沿用原 id，避免已富集数据失联）
  { id: 'n-butanol', name: 'n-Butanol', aliases: ['n-butanol', '1-butanol'] },
  { id: 'n-hexane', name: 'n-Hexane', aliases: ['n-hexane', 'hexane'] },
  { id: 'n-heptane', name: 'n-Heptane', aliases: ['n-heptane', 'heptane'] },
  { id: 'n-pentane', name: 'n-Pentane', aliases: ['n-pentane', 'pentane'] },
  {
    id: 'n-butylacetate',
    name: 'n-Butyl acetate',
    aliases: ['n-butyl acetate', 'butyl acetate'],
  },
  {
    id: '1,2-dichloroethane',
    name: '1,2-Dichloroethane',
    aliases: ['1,2-dichloroethane', '1,2-dichlorethane'],
  },
  {
    id: 'cpme',
    name: 'Cyclopentyl methyl ether (CPME)',
    aliases: ['cpme', 'cyclopentyl methyl ether'],
  },
  {
    id: 'etbe',
    name: 'Ethyl tert-butyl ether (ETBE)',
    aliases: ['etbe', 'ethyl tert-butyl ether', 'ethyl t-butyl ether'],
  },
  {
    id: 'tame',
    name: 'tert-Amyl methyl ether (TAME)',
    aliases: ['tame', 'tert-amyl methyl ether', 't-amyl methyl ether'],
  },
  {
    id: 'mibk',
    name: 'Methyl isobutyl ketone (MIBK)',
    aliases: ['mibk', 'methyl isobutyl ketone', '4-methyl-2-pentanone'],
  },
  {
    id: 'hmpa',
    name: 'Hexamethylphosphoramide (HMPA)',
    aliases: ['hmpa', 'hexamethylphosphoramide', 'hexamethylphosphoric triamide'],
  },
  {
    id: 'dmpu',
    name: '1,3-Dimethylpropyleneurea (DMPU)',
    aliases: [
      'dmpu',
      'dimethylpropylene urea',
      '1,3-dimethylpropyleneurea',
      '1,3-dimethyl-3,4,5,6-tetrahydro-2(1h)-pyrimidinone',
    ],
  },
  {
    id: '2-methf',
    name: '2-Methyltetrahydrofuran (2-MeTHF)',
    aliases: ['2-methf', 'methyltetrahydrofuran', '2-methyltetrahydrofuran'],
  },

  // 2023 新增化合物
  { id: 'pinene', name: '(+)-α-Pinene', aliases: ['(+)-α-pinene', 'α-pinene', 'alpha-pinene'] },
  {
    id: 'limonene',
    name: '(R)-Limonene',
    aliases: ['(r)-limonene', 'r-limonene', '(r)-(+)-limonene', 'limonene'],
  },
  { id: 'gvl', name: 'γ-Valerolactone (GVL)', aliases: ['γ-valerolactone', 'gvl', 'gamma-valerolactone'] },
  {
    id: 'nbp',
    name: 'N-Butyl-2-pyrrolidone (NBP)',
    aliases: ['1-butyl-2-pyrrolidone', 'n-butyl-2-pyrrolidone', 'nbp'],
  },
  {
    id: 'bmim-acetate',
    name: '1-Butyl-3-methylimidazolium acetate',
    aliases: ['1-butyl-3-methylimidazolium acetate', '[bmim][oac]', 'bmim acetate'],
  },
  {
    id: 'emim-acetate',
    name: '1-Ethyl-3-methylimidazolium acetate',
    aliases: ['1-ethyl-3-methylimidazolium acetate', '[emim][oac]', 'emim acetate'],
  },
  { id: '1-hexanol', name: '1-Hexanol', aliases: ['1-hexanol'] },
  { id: '1-octanol', name: '1-Octanol', aliases: ['1-octanol'] },
  { id: '1-pentanol', name: '1-Pentanol', aliases: ['1-pentanol'] },
  { id: '1-propanol', name: '1-Propanol', aliases: ['1-propanol', 'n-propanol'] },
  {
    id: '1,2-butylene-carbonate',
    name: '1,2-Butylene carbonate',
    aliases: ['1,2-butylene carbonate'],
  },
  {
    id: '1,2-propanediol',
    name: '1,2-Propanediol (Propylene glycol)',
    aliases: ['1,2-propanediol', 'propylene glycol'],
  },
  {
    id: 'propylene-carbonate',
    name: 'Propylene carbonate',
    aliases: ['1,2-propylene carbonate', 'propylene carbonate'],
  },
  {
    id: 'propylene-sulfite',
    name: 'Propylene sulfite',
    aliases: ['1,2-propylene sulfite', 'propylene sulfite'],
  },
  {
    id: 'dmi',
    name: '1,3-Dimethyl-2-imidazolidinone (DMI)',
    aliases: ['1,3-dimethyl-2-imidazolidinone', 'dmi'],
  },
  {
    id: 'isooctane',
    name: 'Isooctane',
    aliases: ['isooctane', '2,2,4-trimethylpentane'],
  },
  { id: '1,3-dioxolane', name: '1,3-Dioxolane', aliases: ['1,3-dioxolane'] },
  { id: '1,3-propanediol', name: '1,3-Propanediol', aliases: ['1,3-propanediol'] },
  {
    id: '1,3-propylene-sulfite',
    name: '1,3-Propylene sulfite',
    aliases: ['1,3-propylene sulfite'],
  },
  { id: '2-butanol', name: '2-Butanol', aliases: ['2-butanol', 'sec-butanol'] },
  { id: 'collidine', name: '2,4,6-Collidine', aliases: ['2,4,6-collidine', 'collidine'] },
  {
    id: '2,5-dimethylthf',
    name: '2,5-Dimethyltetrahydrofuran',
    aliases: ['2,5-dimethyltetrahydrofuran'],
  },
  { id: 'benzoicacid', name: 'Benzoic acid', aliases: ['benzoic acid'] },
  {
    id: 'choline-lactate',
    name: 'Choline L-lactate',
    aliases: ['choline l-lactate', 'choline lactate', 'l-choline lactate'],
  },
  { id: 'citricacid', name: 'Citric acid', aliases: ['citric acid'] },
  {
    // 2023 SI 两处写法：完整 "d6"；缩略页把 d 吞成列值后剩 "6 m"。同一物质。
    id: 'cyclohexanone-d6-ketal',
    name: 'Cyclohexanone dimethyl-d6 ketal',
    aliases: ['cyclohexanone dimethyl-d6 ketal', 'cyclohexanone dimethyl-6 m ketal'],
  },
  {
    id: 'cyrene',
    name: 'Cyrene (dihydrolevoglucosenone)',
    aliases: ['cyrene', 'dihydrolevoglucosenone'],
  },
  {
    id: 'cyrene-hemiacetal',
    name: 'Cyrene methyl-d3 hemiacetal',
    aliases: ['cyrene methyl-d3 hemiacetal', 'cyrene methyl hemiacetal'],
  },
  {
    id: 'dbn',
    name: '1,5-Diazabicyclo[4.3.0]non-5-ene (DBN)',
    aliases: ['dbn', '1,5-diazabicyclo[4.3.0]non-5-ene'],
  },
  {
    id: 'dbu',
    name: '1,8-Diazabicyclo[5.4.0]undec-7-ene (DBU)',
    aliases: ['dbu', '1,8-diazabicyclo[5.4.0]undec-7-ene'],
  },
  { id: 'diethylcarbonate', name: 'Diethyl carbonate', aliases: ['diethyl carbonate'] },
  { id: 'diethylsuccinate', name: 'Diethyl succinate', aliases: ['diethyl succinate'] },
  {
    id: 'dipea',
    name: 'N,N-Diisopropylethylamine (DIPEA)',
    aliases: ['diisopropylethylamine', 'n,n-diisopropylethylamine', 'dipea', 'hünig base'],
  },
  {
    id: 'dimethyl-2-ethylsuccinate',
    name: 'Dimethyl 2-ethylsuccinate',
    aliases: ['dimethyl 2-ethylsuccinate'],
  },
  {
    id: 'dimethyl-2-methylglutarate',
    name: 'Dimethyl 2-methylglutarate',
    aliases: ['dimethyl 2-methylglutarate'],
  },
  {
    id: 'dimethyl-isosorbide',
    name: 'Dimethyl isosorbide',
    aliases: ['dimethyl isosorbide'],
  },
  { id: 'ethylpropionate', name: 'Ethyl propionate', aliases: ['ethyl propionate'] },
  { id: 'ethylenecarbonate', name: 'Ethylene carbonate', aliases: ['ethylene carbonate'] },
  {
    id: 'eucalyptol',
    name: 'Eucalyptol (1,8-cineole)',
    aliases: ['eucalyptol', '1,8-cineole', 'cineole'],
  },
  { id: 'furfural', name: 'Furfural', aliases: ['furfural', '2-furaldehyde'] },
  { id: 'glycerol', name: 'Glycerol', aliases: ['glycerol', 'glycerin', 'glycerine'] },
  { id: 'glycerolcarbonate', name: 'Glycerol carbonate', aliases: ['glycerol carbonate'] },
  { id: 'l-lacticacid', name: 'L-Lactic acid', aliases: ['l-lactic acid', '(s)-lactic acid'] },
  {
    id: 'methanesulfonicacid',
    name: 'Methanesulfonic acid',
    aliases: ['methanesulfonic acid', 'msa'],
  },
  {
    id: 'methyl-4-dimethylamino-2-ethyl-4-oxobutanoate',
    name: 'Methyl 4-(dimethylamino)-2-ethyl-4-oxobutanoate',
    aliases: ['methyl 4-(dimethylamino)-2-ethyl-4-oxobutanoate'],
  },
  {
    id: 'methyl-5-dimethylamino-2-methyl-5-oxopentanoate',
    name: 'Methyl 5-(dimethylamino)-2-methyl-5-oxopentanoate (PolarClean)',
    aliases: ['methyl 5-(dimethylamino)-2-methyl-5-oxopentanoate', 'polarclean'],
  },
  { id: 'methylsoyate', name: 'Methyl soyate', aliases: ['methyl soyate'] },
  {
    id: 'n3-aminopropyl-azepanone',
    name: 'N-(3-Aminopropyl)azepanone',
    aliases: ['n-(3-aminopropyl)azepanone'],
  },
  {
    id: 'n3-aminopropyl-pyrrolidone',
    name: 'N-(3-Aminopropyl)pyrrolidone',
    aliases: ['n-(3-aminopropyl)pyrrolidone'],
  },
  {
    id: 'nmm',
    name: 'N-Methylmorpholine (NMM)',
    aliases: ['n-methylmorpholine', 'nmm'],
  },
  {
    id: 'nndimethyllactamide',
    name: 'N,N-Dimethyl lactamide',
    aliases: ['n,n-dimethyl lactamide', 'n,n-dimethyllactamide'],
  },
  {
    id: 'ptoluenesulfonicacid',
    name: 'p-Toluenesulfonic acid',
    aliases: ['p-toluenesulfonic acid', 'tosic acid', 'ptsa'],
  },
  {
    id: 'peg400',
    name: 'PEG 400',
    aliases: ['peg 400', 'peg400', 'polyethylene glycol 400'],
  },
  {
    id: 'pinacolone',
    name: 'Pinacolone',
    aliases: ['pinacolone', '3,3-dimethyl-2-butanone'],
  },
  {
    id: 'ppg400',
    name: 'PPG 400',
    aliases: ['ppg 400', 'ppg400', 'polypropylene glycol 400'],
  },
  { id: 'priamine1071', name: 'Priamine 1071', aliases: ['priamine 1071', 'priamine1071'] },
  { id: 'propionicacid', name: 'Propionic acid', aliases: ['propionic acid', 'propanoic acid'] },
  { id: 'propylacetate', name: 'Propyl acetate', aliases: ['propyl acetate', 'n-propyl acetate'] },
  { id: 'reline', name: 'Reline', aliases: ['reline', 'choline chloride/urea'] },
  {
    id: 'tert-amyl-alcohol',
    name: 'tert-Amyl alcohol',
    aliases: ['tert-amyl alcohol', 't-amyl alcohol', '2-methyl-2-butanol'],
  },
  {
    id: 'tert-butyl-acetate',
    name: 'tert-Butyl acetate',
    aliases: ['tert-butyl acetate', 't-butyl acetate'],
  },
  {
    id: 'tmg',
    name: 'Tetramethylguanidine (TMG)',
    aliases: ['tetramethylguanidine', 'tmg', '1,1,3,3-tetramethylguanidine'],
  },
  { id: 'tpgs-750-m', name: 'TPGS-750-M', aliases: ['tpgs-750-m', 'tpgs 750 m'] },
  { id: 'triacetin', name: 'Triacetin', aliases: ['triacetin', 'glyceryl triacetate'] },
  {
    id: 'tris(2-hydroxyethyl)methylammonium-methylsulfate',
    name: 'Tris(2-hydroxyethyl)methylammonium methylsulfate',
    aliases: ['tris(2-hydroxyethyl)methylammonium methylsulfate'],
  },
  { id: 'water', name: 'Water', aliases: ['water'] },
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

  // ───────────── 2023（Cseri et al.）新增化合物 ─────────────
  pinene: 'α-蒎烯',
  limonene: '(R)-柠檬烯',
  gvl: 'γ-戊内酯（GVL）',
  nbp: 'N-丁基-2-吡咯烷酮（NBP）',
  'bmim-acetate': '1-丁基-3-甲基咪唑醋酸盐',
  'emim-acetate': '1-乙基-3-甲基咪唑醋酸盐',
  '1-hexanol': '正己醇',
  '1-octanol': '正辛醇',
  '1-pentanol': '正戊醇',
  '1-propanol': '正丙醇',
  '1,2-butylene-carbonate': '1,2-碳酸丁烯酯',
  '1,2-propanediol': '1,2-丙二醇（丙二醇）',
  'propylene-carbonate': '碳酸丙烯酯',
  'propylene-sulfite': '亚硫酸丙烯酯',
  dmi: '1,3-二甲基-2-咪唑啉酮（DMI）',
  isooctane: '异辛烷（2,2,4-三甲基戊烷）',
  '1,3-dioxolane': '1,3-二氧戊环',
  '1,3-propanediol': '1,3-丙二醇',
  '1,3-propylene-sulfite': '1,3-亚硫酸丙酯',
  '2-butanol': '2-丁醇',
  collidine: '2,4,6-三甲基吡啶',
  '2,5-dimethylthf': '2,5-二甲基四氢呋喃',
  benzoicacid: '苯甲酸',
  'choline-lactate': 'L-乳酸胆碱',
  citricacid: '柠檬酸',
  'cyclohexanone-d6-ketal': '环己酮二甲基-d6 缩酮',
  cyrene: 'Cyrene（二氢左旋葡萄糖烯酮）',
  'cyrene-hemiacetal': 'Cyrene 甲基-d3 半缩醛',
  dbn: '1,5-二氮杂双环[4.3.0]壬-5-烯（DBN）',
  dbu: '1,8-二氮杂双环[5.4.0]十一碳-7-烯（DBU）',
  diethylcarbonate: '碳酸二乙酯',
  diethylsuccinate: '丁二酸二乙酯',
  dipea: 'N,N-二异丙基乙胺（DIPEA）',
  'dimethyl-2-ethylsuccinate': '2-乙基丁二酸二甲酯',
  'dimethyl-2-methylglutarate': '2-甲基戊二酸二甲酯',
  'dimethyl-isosorbide': '二甲基异山梨醇',
  ethylpropionate: '丙酸乙酯',
  ethylenecarbonate: '碳酸乙烯酯',
  eucalyptol: '桉叶油素（1,8-桉叶素）',
  furfural: '糠醛',
  glycerol: '甘油',
  glycerolcarbonate: '碳酸甘油酯',
  'l-lacticacid': 'L-乳酸',
  methanesulfonicacid: '甲磺酸',
  'methyl-4-dimethylamino-2-ethyl-4-oxobutanoate': '4-(二甲氨基)-2-乙基-4-氧代丁酸甲酯',
  'methyl-5-dimethylamino-2-methyl-5-oxopentanoate':
    '5-(二甲氨基)-2-甲基-5-氧代戊酸甲酯（PolarClean）',
  methylsoyate: '大豆油脂肪酸甲酯',
  'n3-aminopropyl-azepanone': 'N-(3-氨丙基)氮杂环庚烷酮',
  'n3-aminopropyl-pyrrolidone': 'N-(3-氨丙基)吡咯烷酮',
  nmm: 'N-甲基吗啉（NMM）',
  nndimethyllactamide: 'N,N-二甲基乳酰胺',
  ptoluenesulfonicacid: '对甲苯磺酸',
  peg400: '聚乙二醇 400（PEG 400）',
  pinacolone: '频哪酮（3,3-二甲基-2-丁酮）',
  ppg400: '聚丙二醇 400（PPG 400）',
  priamine1071: 'Priamine 1071（二聚体二胺）',
  propionicacid: '丙酸',
  propylacetate: '乙酸丙酯',
  reline: 'Reline（氯化胆碱-尿素低共熔溶剂）',
  'tert-amyl-alcohol': '叔戊醇',
  'tert-butyl-acetate': '乙酸叔丁酯',
  tmg: '四甲基胍（TMG）',
  'tpgs-750-m': 'TPGS-750-M（维生素 E 聚乙二醇琥珀酸酯）',
  triacetin: '三乙酸甘油酯',
  'tris(2-hydroxyethyl)methylammonium-methylsulfate': '三(2-羟乙基)甲基铵甲基硫酸盐',
  water: '水',
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
