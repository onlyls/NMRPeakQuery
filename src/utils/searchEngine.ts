/* ============================================================================
 * searchEngine.ts — 纯客户端检索引擎
 *
 * 三类查询：
 *   1. searchByPeak   单峰：给定溶剂/核素/位移/容差，返回所有容差内的化合物信号；
 *   2. matchMultiPeak 多峰：多个观测峰与一个化合物的理论峰做协同指派（贪心），
 *      解决「单个峰命中很多化合物」的歧义；
 *   3. searchByName   名称 / 中文名 / CAS / 别名子串检索。
 *
 * 另提供 findSolventSignals：用户录入峰位时提示「这可能只是溶剂自身峰」
 * （残余质子 / 水峰 / 13C 溶剂峰）。
 *
 * 数据量很小（87 化合物 / ~3900 信号），所有计算同步完成，无需 worker。
 * ========================================================================== */
import type {
  CompoundData,
  MultiPeakMatch,
  NMRDataset,
  NMRSignal,
  NucleusType,
  SearchResult,
  SolventId,
  SolventSignal,
} from '../types/nmr';
import { casKey, normalizeToken, stripParentheticals } from './textNormalize';

/** 观测点 x 与一条理论信号的偏差（ppm）。落在 shiftRange 区间内记 0，区间外取到边界距离 */
export function deviationFromSignal(x: number, s: NMRSignal): number {
  const [lo, hi] = s.shiftRange ?? [s.shift, s.shift];
  if (x < lo) return lo - x;
  if (x > hi) return x - hi;
  return 0;
}

/* --------------------------------- 数据集 -------------------------------- */

let dataset: NMRDataset | null = null;
const solventMap = new Map<string, NMRDataset['solvents'][number]>();
const compoundMap = new Map<string, CompoundData>();

/** public/data 下的静态 JSON；BASE_URL 保证部署在子路径时也能取到 */
export const DATASET_URL = `${import.meta.env.BASE_URL}data/nmr_data_v1.json`;

export async function loadDataset(signal: AbortSignal): Promise<NMRDataset> {
  if (dataset) return dataset;
  const res = await fetch(DATASET_URL, { signal });
  if (!res.ok) throw new Error(`数据集加载失败：HTTP ${res.status}`);
  const json = (await res.json()) as NMRDataset;
  hydrate(json);
  return json;
}

/** 测试 / 预取场景可直接注入数据集 */
export function hydrate(ds: NMRDataset): void {
  dataset = ds;
  solventMap.clear();
  compoundMap.clear();
  for (const s of ds.solvents) solventMap.set(s.id, s);
  for (const c of ds.compounds) compoundMap.set(c.id, c);
}

export function getDataset(): NMRDataset | null {
  return dataset;
}

export function getSolvent(id: SolventId) {
  return solventMap.get(id);
}

/* -------------------------------- 单峰检索 ------------------------------- */

export interface PeakQuery {
  /** 限定溶剂；'all' = 跨全部 12 种溶剂搜索 */
  solventId: SolventId | 'all';
  nucleus: NucleusType;
  shift: number;
  tolerance: number;
  /** 返回上限 */
  limit?: number;
}

/** 单峰查询：返回容差内的全部命中，按偏差升序 */
export function searchByPeak(q: PeakQuery): SearchResult[] {
  if (!dataset) return [];
  const solventIds =
    q.solventId === 'all' ? dataset.solvents.map((s) => s.id) : [q.solventId];

  const hits: SearchResult[] = [];
  for (const compound of dataset.compounds) {
    for (const sid of solventIds) {
      const arr = compound.signals[sid]?.[q.nucleus];
      if (!arr) continue;
      for (const signal of arr) {
        const dev = deviationFromSignal(q.shift, signal);
        if (dev <= q.tolerance) {
          hits.push({ compound, solventId: sid, matchedSignal: signal, deltaDeviation: dev });
        }
      }
    }
  }

  hits.sort(
    (a, b) =>
      a.deltaDeviation - b.deltaDeviation ||
      a.compound.name.localeCompare(b.compound.name) ||
      a.solventId.localeCompare(b.solventId),
  );
  return q.limit ? hits.slice(0, q.limit) : hits;
}

/* -------------------------------- 多峰协同 ------------------------------- */

/**
 * 多个观测峰 ↔ 一个化合物理论峰的协同匹配。
 *
 * 指派策略：枚举容差内所有 (观测峰, 理论峰) 对，按偏差升序贪心选取，
 * 每个观测峰、每条理论峰至多被用一次（避免两个峰都配到同一条强峰）。
 *
 * 痕量杂质场景下，用户通常只报几个看得见的峰，理论峰没观测到（missing）
 * 是常态，故评分以「观测峰命中率」为主，missing 只作很轻的次级惩罚。
 */
function matchOneCompound(
  compound: CompoundData,
  solventId: SolventId,
  nucleus: NucleusType,
  observed: number[],
  tolerance: number,
): MultiPeakMatch | null {
  const signals = compound.signals[solventId]?.[nucleus];
  if (!signals?.length) return null;

  const usedSignal = new Set<NMRSignal>();
  const usedObserved = new Set<number>();
  const pairs: MultiPeakMatch['pairs'] = [];

  const candidates: { dev: number; oi: number; signal: NMRSignal }[] = [];
  observed.forEach((x, oi) => {
    for (const signal of signals) {
      const dev = deviationFromSignal(x, signal);
      if (dev <= tolerance) candidates.push({ dev, oi, signal });
    }
  });
  candidates.sort((a, b) => a.dev - b.dev);

  for (const cand of candidates) {
    if (usedObserved.has(cand.oi) || usedSignal.has(cand.signal)) continue;
    usedObserved.add(cand.oi);
    usedSignal.add(cand.signal);
    pairs.push({ observed: observed[cand.oi], signal: cand.signal, deviation: cand.dev });
  }
  if (!pairs.length) return null;

  pairs.sort((a, b) => a.observed - b.observed);
  const extra = observed.length - pairs.length;
  const missing = signals.length - pairs.length;
  const avgDev = pairs.reduce((n, p) => n + p.deviation, 0) / pairs.length;
  const hitRatio = pairs.length / observed.length;

  // 命中峰数权重最大；命中率其次；平均偏差、missing/extra 作次级惩罚
  const score = pairs.length * 100 + hitRatio * 50 - avgDev * 5 - extra * 20 - missing * 0.5;

  return { compound, solventId, score, pairs, missing, extra };
}

export interface MultiPeakQuery {
  solventId: SolventId | 'all';
  nucleus: NucleusType;
  shifts: number[];
  tolerance: number;
  limit?: number;
}

/** 多峰协同查询，按综合评分降序 */
export function matchMultiPeak(q: MultiPeakQuery): MultiPeakMatch[] {
  if (!dataset || q.shifts.length < 2) return [];
  const solventIds =
    q.solventId === 'all' ? dataset.solvents.map((s) => s.id) : [q.solventId];

  const matches: MultiPeakMatch[] = [];
  for (const compound of dataset.compounds) {
    for (const sid of solventIds) {
      const m = matchOneCompound(compound, sid, q.nucleus, q.shifts, q.tolerance);
      if (m) matches.push(m);
    }
  }
  matches.sort((a, b) => b.score - a.score || a.compound.name.localeCompare(b.compound.name));
  return q.limit ? matches.slice(0, q.limit) : matches;
}

/* -------------------------------- 名称检索 ------------------------------- */

/** 松散匹配：去空白/标点/大小写，便于 "ethyl acetate" 命中 "Ethyl Acetate" */
export function loose(s: string): string {
  return s.toLowerCase().replace(/[\s\-_/(),.]+/g, '');
}

export interface NameHit {
  compound: CompoundData;
  /** 命中字段，供 UI 高亮 */
  field: 'name' | 'chineseName' | 'cas' | 'nameRaw';
}

/** 按英文名 / 中文名 / CAS / 文献原始名 / 别名表检索 */
export function searchByName(keyword: string, limit = 50): NameHit[] {
  if (!dataset) return [];
  const kw = keyword.trim();
  if (!kw) return [];
  const lk = loose(kw);
  const cas = casKey(kw);
  // 去掉括号内容后的整串，用于「二氯甲烷（DCM）」这类中文名 + 缩写写法
  const kwBase = stripParentheticals(kw);
  const aliasId = dataset.meta.compoundAliases?.[normalizeToken(kw)];
  const hits: NameHit[] = [];

  for (const compound of dataset.compounds) {
    let field: NameHit['field'] | null = null;
    if (compound.chineseName.includes(kw)) field = 'chineseName';
    else if (compound.cas && casKey(compound.cas) === cas) field = 'cas';
    else if (loose(compound.name).includes(lk)) field = 'name';
    else if (compound.nameRaw.some((n) => loose(n).includes(lk))) field = 'nameRaw';
    // 补充判定：整串（去括号后）与中文名完全相同，如「二氯甲烷（DCM）」
    else if (kwBase && compound.chineseName && compound.chineseName === kwBase) field = 'chineseName';
    // 补充判定：数据集自带的别名表（归一化写法 → 化合物 id）
    else if (aliasId && compound.id === aliasId) field = 'name';
    if (field) hits.push({ compound, field });
  }

  hits.sort((a, b) => a.compound.name.localeCompare(b.compound.name));
  return hits.slice(0, limit);
}

/* ------------------------------ 溶剂自身峰提示 ----------------------------- */

/**
 * 溶剂自身信号（残余质子 / 水 / 13C 溶剂峰）在容差内的命中。
 * 优先使用文献值；文献未命中时，退回参考表值（referenceSignals，标注为 solventReference）。
 * 这样对仅有参考数据的 9 种溶剂（referenceOnly）也能给出溶剂峰提示。
 */
export function findSolventSignals(
  solventId: SolventId,
  nucleus: NucleusType,
  shift: number,
  tolerance: number,
): (SolventSignal & { deviation: number })[] {
  const solvent = solventMap.get(solventId);
  if (!solvent) return [];

  const within = (list: SolventSignal[]) =>
    list
      .filter((s) => s.nucleus === nucleus)
      .map((s) => {
        const [lo, hi] = s.shiftRange ?? [s.shift, s.shift];
        const dev = shift < lo ? lo - shift : shift > hi ? shift - hi : 0;
        return { ...s, deviation: dev };
      })
      .filter((s) => s.deviation <= tolerance)
      .sort((a, b) => a.deviation - b.deviation);

  const litHits = within(solvent.signals);
  if (litHits.length) return litHits;

  const refAsSignals: SolventSignal[] = (solvent.referenceSignals ?? []).map((r) => ({
    kind: r.kind,
    nucleus: r.nucleus,
    shift: r.shift,
    ...(r.multiplicity ? { multiplicity: r.multiplicity } : {}),
    ...(r.coupling?.length ? { coupling: r.coupling } : {}),
    source: 'solventReference',
  }));
  return within(refAsSignals);
}
