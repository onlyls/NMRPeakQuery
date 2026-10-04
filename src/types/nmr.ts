/* ============================================================================
 * NMRPeakQuery — 领域数据模型 (src/types/nmr.ts)
 *
 * 数据来源（四篇原始文献）：
 *   - gottlieb1997  Gottlieb, Kotlyar, Nudelman, J. Org. Chem. 1997, 62, 7512.
 *   - fulmer2010    Fulmer et al., Organometallics 2010, 29, 2176.  (以其 Supporting
 *                   Information 的 Table S1/S2 为准，SI 已修订原文若干错误)
 *   - babij2016     Babij et al., Org. Process Res. Dev. 2016, 20, 1047.
 *                   (以其 Supporting Information 的 Table S1–S12 为准)
 *   - cseri2023     Cseri, Kumar, Palchuber, Székely, ACS Sustainable Chem. Eng. 2023,
 *                   11, 8274.  (以其 Supporting Information 的 Part 4 为准，
 *                   覆盖新兴绿色溶剂、酸、碱等在 8 种氘代溶剂中的痕量位移)
 *
 * 与方案文档中原始契约的差异（已修正）：
 *   1. 溶剂由 11 种补全为 12 种（新增 c6d6 / 苯-d6），并使用规范 ID 而非展示名；
 *   2. coupling 由 `number | null` 改为 `number[]`（同一信号常有多个 J）；
 *   3. 新增 shiftRange / shiftOD / isIsotopomerOD / footnoteRefs；
 *   4. 水峰、残余质子峰、13C 溶剂峰属于「溶剂属性」而非化合物，上提到 SolventMeta；
 *   5. 文献未观测到的位移一律为「缺失」而非 0。
 * ========================================================================== */

/**
 * 数据来源标识。
 * 前四个为一级文献（参与合并与优先级判定）；
 * solventReference 为溶剂物理性质/溶剂峰参考表（三级来源，仅补充展示，不参与合并）。
 */
export type SourceId =
  | 'gottlieb1997'
  | 'fulmer2010'
  | 'babij2016'
  | 'cseri2023'
  | 'solventReference';

/**
 * 氘代溶剂规范 ID。
 * 前 12 种来自一级文献（含化合物位移数据）；
 * 后 9 种（referenceOnly）仅由厂商参考表覆盖，无化合物位移数据。
 */
export type SolventId =
  // ---- 文献覆盖的 12 种 ----
  | 'cdcl3' // 氯仿-d (CDCl3)
  | 'dcm_d2' // 二氯甲烷-d2 (CD2Cl2)
  | 'acetone_d6' // 丙酮-d6 ((CD3)2CO / acetone-d6)
  | 'dmso_d6' // 二甲基亚砜-d6 ((CD3)2SO / DMSO-d6)
  | 'c6d6' // 苯-d6 (C6D6 / benzene-d6)
  | 'cd3cn' // 乙腈-d3 (CD3CN / acetonitrile-d3)
  | 'cd3od' // 甲醇-d4 (CD3OD / methanol-d4)
  | 'd2o' // 重水 (D2O)
  | 'thf_d8' // 四氢呋喃-d8 (THF-d8)
  | 'toluene_d8' // 甲苯-d8 (toluene-d8)
  | 'chlorobenzene_d5' // 氯苯-d5 (C6D5Cl)
  | 'tfe_d3' // 三氟乙醇-d3 (TFE-d3)
  // ---- 仅参考表覆盖的 9 种（referenceOnly） ----
  | 'acoh_d4' // 乙酸-d4 (CD3COOD)
  | 'cyclohexane_d12' // 环己烷-d12 (C6D12)
  | 'dmf_d7' // N,N-二甲基甲酰胺-d7 ((CD3)2NCDO)
  | 'dioxane_d8' // 1,4-二氧六环-d8 (C4D8O2)
  | 'ethanol_d6' // 乙醇-d6 (C2D5OD)
  | 'isopropanol_d8' // 2-丙醇-d8 ((CD3)2CDOD)
  | 'pyridine_d5' // 吡啶-d5 (C5D5N)
  | 'tfa_d' // 三氟乙酸-d (CF3COOD)
  | 'tetrachloroethane_d2'; // 1,1,2,2-四氯乙烷-d2 (C2D2Cl4)

/** 观测核素 */
export type NucleusType = '1H' | '13C';

/** 化合物分类 */
export type CompoundCategory =
  | 'Organic Solvent'
  | 'Organometallic Reagent'
  | 'Gas'
  | 'Additive/Grease'
  | 'Internal Standard';

/** 被更高优先级来源覆盖的历史数值 */
export interface SupersededValue {
  shift: number;
  source: SourceId;
  note: string;
}

/** 一条化学位移信号（化合物维度） */
export interface NMRSignal {
  /** 化学位移中心值 (ppm) */
  shift: number;
  /** 多重峰 / 宽峰观测区间 [low, high]；若文献仅给区间，shift 取区间中点 */
  shiftRange?: [number, number];
  /** -OD 同位素异构体位移（2016 SI 中括号值），如 D2O / CD3OD 中的 -OH ↔ -OD */
  shiftOD?: number;
  isIsotopomerOD?: boolean;
  /** 归一化裂分重数：s / d / t / q / quint / sext / sept / oct / nonet / m / br s ... */
  multiplicity?: string;
  /** 文献原始裂分描述，如 "tt, 7.6, 1.8" / "nonet, 6.8" / "sep t, 6.1" */
  multiplicityRaw?: string;
  /** 偶合常数 J (Hz)，可多个 */
  coupling: number[];
  couplingRaw?: string;
  /** 质子积分（仅 1H） */
  protons?: number | null;
  /** 归属，如 "CH3" / "CH(2,6)" / "OCH3" */
  assignment?: string;
  isWaterPeak?: boolean;
  isResidualPeak?: boolean;
  /** 温漂 / 特殊说明 */
  temperatureNote?: string;
  /** 文献脚注 / 尾注编号 */
  footnoteRefs: string[];
  /** 数据来源 */
  source: SourceId;
  /** 被覆盖的历史值（保留可追溯性） */
  superseded?: SupersededValue[];
  /** 原始行文本，便于人工回溯校对 */
  rawText?: string;
}

/** 溶剂自身信号类别 */
export type SolventSignalKind = 'residual' | 'water' | 'solventCarbon';

/** 溶剂自身信号（残余质子峰 / 水峰 / 13C 溶剂峰） */
export interface SolventSignal {
  kind: SolventSignalKind;
  nucleus: NucleusType;
  shift: number;
  shiftRange?: [number, number];
  multiplicity?: string;
  coupling?: number[];
  temperatureNote?: string;
  /** 水峰温度换算公式，如 D2O: δ = 5.060 − 0.0122·T + 2.11e−5·T² */
  waterTempFormula?: string;
  source: SourceId;
}

/** 溶剂物理性质（来自溶剂参考表，三级来源，非文献原文） */
export interface SolventProperties {
  cas?: string;
  /** 分子量 (g/mol) */
  mw?: number;
  /** 密度 (g/mL) */
  density?: number;
  /** 熔点 (°C) */
  meltingPoint?: number;
  /** 沸点 (°C) */
  boilingPoint?: number;
  /** 介电常数 */
  dielectricConstant?: number;
  /** 物理量口径说明（如沸点为区间值） */
  physicalNote?: string;
  /** 该条数据的来源（均为参考表来源） */
  source: SourceId;
}

/** 溶剂自身峰的参考值（来自溶剂参考表，与文献 signals 分开存放） */
export interface SolventReferenceSignal {
  kind: SolventSignalKind;
  nucleus: NucleusType;
  shift: number;
  multiplicity?: string;
  /** J_HD（¹H 残余峰）或 J_CD（¹³C 溶剂峰），单位 Hz */
  coupling?: number[];
  note?: string;
}

/** 溶剂元数据 */
export interface SolventMeta {
  id: SolventId;
  /** 规范展示名 */
  label: string;
  /** 化学式 */
  formula: string;
  /** 文献中出现的各种写法（原始拼写，用于解析与容错检索） */
  aliases: string[];
  /** 文献来源的溶剂自身信号（残余质子峰 / 水峰 / ¹³C 溶剂峰） */
  signals: SolventSignal[];
  /** 溶剂物理性质（参考表） */
  properties?: SolventProperties;
  /** 溶剂自身峰的参考值（参考表，仅展示，不参与检索/合并） */
  referenceSignals?: SolventReferenceSignal[];
  /** true = 无文献化合物位移数据，仅由参考表覆盖 */
  referenceOnly?: boolean;
}

/** 外部数据库补充字段的溯源（非文献原文） */
export interface ExternalIdentifiers {
  source: 'PubChem';
  cid?: number;
  fetchedAt: string;
}

/** 化合物（溶剂敏感：同一化合物在不同溶剂下位移不同） */
export interface CompoundData {
  id: string;
  name: string;
  /** 文献中出现的各种名称写法 */
  nameRaw: string[];
  chineseName: string;
  /** 中文名来源。PubChem 不收录中文名，实际一律由 scripts/lib/compounds.mjs 的人工整理表提供 */
  chineseNameSource?: 'manual';
  cas: string;
  formula: string;
  mw: number;
  smiles?: string;
  category: CompoundCategory;
  /** 若 cas/formula/mw/smiles/chineseName 来自 PubChem 而非文献，则标记 */
  external?: ExternalIdentifiers;
  /** solvent -> nucleus -> 信号列表 */
  signals: Partial<Record<SolventId, Partial<Record<NucleusType, NMRSignal[]>>>>;
}

/** 跨来源修订记录 */
export interface CorrectionRecord {
  compoundId: string;
  solventId: SolventId;
  nucleus: NucleusType;
  assignment?: string;
  /** 原（错误）值 */
  from: number;
  /** 修订后值 */
  to: number;
  /** 修订由哪篇文献给出 */
  reportedBy: SourceId;
  note: string;
}

/** 文献出处 */
export interface SourceInfo {
  id: SourceId;
  citation: string;
  doi: string;
  /** 实际采用的载体：正文表格 或 Supporting Information */
  usedPart: string;
  /** 无 DOI 的来源（厂商参考表）改用网页链接，页脚渲染为超链接 */
  urls?: { label: string; href: string }[];
}

/** 数据集元信息 */
export interface DatasetMeta {
  version: string;
  generatedAt: string;
  sources: SourceInfo[];
  /** 冲突值的优先级（高 → 低） */
  precedence: SourceId[];
  corrections: CorrectionRecord[];
  /** 原始溶剂写法 → 规范 ID */
  solventAliases: Record<string, SolventId>;
  /** 原始化合物写法 → 规范 ID */
  compoundAliases: Record<string, string>;
  counts: {
    compounds: number;
    signals: number;
    /** 各来源贡献的信号条数（含参考表的溶剂自身信号） */
    bySource: Partial<Record<SourceId, number>>;
  };
}

/** 全量数据集（public/data/nmr_data_v1.json） */
export interface NMRDataset {
  meta: DatasetMeta;
  solvents: SolventMeta[];
  compounds: CompoundData[];
}

/* --------------------------------- 检索 --------------------------------- */

/** 单峰容差默认值 */
export const DEFAULT_TOLERANCE: Record<NucleusType, number> = {
  '1H': 0.02,
  '13C': 0.2,
};

/** 单峰命中结果 */
export interface SearchResult {
  compound: CompoundData;
  /** 命中发生的溶剂；限定单溶剂搜索时与查询条件一致 */
  solventId: SolventId;
  matchedSignal: NMRSignal;
  /** |shift − targetShift|；观测点落在 shiftRange 内时为 0 */
  deltaDeviation: number;
  score?: number;
}

/** 多峰协同匹配结果 */
export interface MultiPeakMatch {
  compound: CompoundData;
  solventId: SolventId;
  score: number;
  /** 每个观测峰的最近理论峰及偏差 */
  pairs: { observed: number; signal: NMRSignal; deviation: number }[];
  /** 未被任何观测峰覆盖的理论峰数 */
  missing: number;
  /** 未匹配到任何理论峰的观测峰数 */
  extra: number;
}
