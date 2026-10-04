/* ============================================================================
 * NMRPeakQuery — 领域数据模型 (src/types/nmr.ts)
 *
 * 数据来源（三篇原始文献）：
 *   - gottlieb1997  Gottlieb, Kotlyar, Nudelman, J. Org. Chem. 1997, 62, 7512.
 *   - fulmer2010    Fulmer et al., Organometallics 2010, 29, 2176.  (以其 Supporting
 *                   Information 的 Table S1/S2 为准，SI 已修订原文若干错误)
 *   - babij2016     Babij et al., Org. Process Res. Dev. 2016, 20, 1047.
 *                   (以其 Supporting Information 的 Table S1–S12 为准)
 *
 * 与方案文档中原始契约的差异（已修正）：
 *   1. 溶剂由 11 种补全为 12 种（新增 c6d6 / 苯-d6），并使用规范 ID 而非展示名；
 *   2. coupling 由 `number | null` 改为 `number[]`（同一信号常有多个 J）；
 *   3. 新增 shiftRange / shiftOD / isIsotopomerOD / footnoteRefs；
 *   4. 水峰、残余质子峰、13C 溶剂峰属于「溶剂属性」而非化合物，上提到 SolventMeta；
 *   5. 文献未观测到的位移一律为「缺失」而非 0。
 * ========================================================================== */

/** 数据来源标识 */
export type SourceId = 'gottlieb1997' | 'fulmer2010' | 'babij2016';

/** 氘代溶剂规范 ID（12 种） */
export type SolventId =
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
  | 'tfe_d3'; // 三氟乙醇-d3 (TFE-d3)

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

/** 溶剂元数据 */
export interface SolventMeta {
  id: SolventId;
  /** 规范展示名 */
  label: string;
  /** 化学式 */
  formula: string;
  /** 文献中出现的各种写法（原始拼写，用于解析与容错检索） */
  aliases: string[];
  signals: SolventSignal[];
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
    /** 各来源贡献的信号条数 */
    bySource: Record<SourceId, number>;
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
