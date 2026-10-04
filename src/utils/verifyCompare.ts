/* ============================================================================
 * verifyCompare.ts — 数据集信号 ↔ AI 文献信号的核验比对（纯函数，无 React）
 *
 * 用于「按峰位查 / 按名称查」结果卡片与所选溶剂自身信号的 AI 核验：
 * 数据集为权威来源，AI 只作独立参考；比对维度为位移 / 裂分 / 耦合常数。
 * ========================================================================== */
import {
  DEFAULT_TOLERANCE,
  type NMRSignal,
  type NucleusType,
  type SourceId,
  type SolventSignal,
} from '../types/nmr';
import type { AiVerifySignal } from '../types/ai';

export type VerifyIssue = 'shift' | 'shiftMajor' | 'multiplicity' | 'coupling';

export type VerifyStatus =
  | '一致'
  | '位移偏差'
  | '位移明显偏差'
  | '裂分不符'
  | '耦合常数不符'
  | '数据集缺失'
  | 'AI 未给出';

export interface VerifyRow {
  key: string;
  assignment?: string;
  dataset?: {
    shift: number;
    shiftRange?: [number, number];
    multiplicity?: string;
    multiplicityRaw?: string;
    coupling: number[];
    source: SourceId;
  };
  ai?: {
    shift: number;
    multiplicity?: string;
    coupling: number[];
    assignment?: string;
  };
  shiftDelta?: number;
  /** 空数组 = 一致 */
  issues: VerifyIssue[];
  status: VerifyStatus;
}

/** 归属归一化：去空白与 ()-[]/, 等符号，转小写（CH(2,6) → ch26） */
function normAssignment(raw?: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '');
}

/** 裂分归一化：去掉 br、取首个 token、仅保留字母（"br s" → "s"、"sep t, 6.1" → "sep"） */
function normMult(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.toLowerCase().replace(/\bbr\b/g, '').trim();
  const token = cleaned.split(/[\s,;()[\]]+/).filter(Boolean)[0] ?? '';
  return token.replace(/[^a-z]/g, '');
}

/** 两侧 coupling 均非空时逐项比对，差 > 0.5 Hz 视为不符 */
const COUPLING_TOL = 0.5;

function couplingMismatch(a: number[], b: number[]): boolean {
  if (!a.length || !b.length) return false;
  const x = [...a].sort((m, n) => m - n);
  const y = [...b].sort((m, n) => m - n);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (Math.abs(x[i] - y[i]) > COUPLING_TOL) return true;
  }
  return false;
}

function toDataset(s: NMRSignal): VerifyRow['dataset'] {
  return {
    shift: s.shift,
    shiftRange: s.shiftRange,
    multiplicity: s.multiplicity,
    multiplicityRaw: s.multiplicityRaw,
    coupling: s.coupling ?? [],
    source: s.source,
  };
}

function toAi(a: AiVerifySignal): VerifyRow['ai'] {
  return {
    shift: a.shift,
    multiplicity: a.multiplicity,
    coupling: a.coupling ?? [],
    assignment: a.assignment,
  };
}

function buildRow(
  key: string,
  ds: NMRSignal,
  ai: AiVerifySignal,
  tol: number,
): VerifyRow {
  const delta = Math.abs(ds.shift - ai.shift);
  const issues: VerifyIssue[] = [];
  let status: VerifyStatus = '一致';

  // 优先级：位移明显偏差 > 位移偏差 > 耦合常数不符 > 裂分不符 > 一致
  if (delta > tol * 3) {
    issues.push('shiftMajor');
    status = '位移明显偏差';
  } else if (delta > tol) {
    issues.push('shift');
    status = '位移偏差';
  }

  if (couplingMismatch(ds.coupling ?? [], ai.coupling ?? [])) {
    issues.push('coupling');
    if (status === '一致') status = '耦合常数不符';
  }

  const dm = normMult(ds.multiplicity || ds.multiplicityRaw);
  const am = normMult(ai.multiplicity);
  if (dm && am && dm !== am) {
    issues.push('multiplicity');
    if (status === '一致') status = '裂分不符';
  }

  return {
    key,
    assignment: ds.assignment ?? ai.assignment,
    dataset: toDataset(ds),
    ai: toAi(ai),
    shiftDelta: delta,
    issues,
    status,
  };
}

/**
 * 比对本数据集信号与 AI 给出的文献信号。
 * 对齐：先按归属归一化后相等配对，剩余按位移最近贪心（阈值 3×默认容差）；
 * 仍未配对的：数据集侧 → AI 未给出；AI 侧 → 数据集缺失。
 */
export function compareSignals(
  datasetSignals: NMRSignal[],
  aiSignals: AiVerifySignal[],
  nucleus: NucleusType,
): VerifyRow[] {
  const tol = DEFAULT_TOLERANCE[nucleus];
  const ds = datasetSignals.map((s, i) => ({ s, i, used: false }));
  const ai = aiSignals
    .filter((a) => Number.isFinite(a.shift))
    .map((a, i) => ({ a, i, used: false }));
  const rows: VerifyRow[] = [];

  // 1) 归属对齐
  for (const d of ds) {
    const key = normAssignment(d.s.assignment);
    if (!key) continue;
    const hit = ai.find((x) => !x.used && normAssignment(x.a.assignment) === key);
    if (!hit) continue;
    d.used = true;
    hit.used = true;
    rows.push(buildRow(`m-${d.i}-${hit.i}`, d.s, hit.a, tol));
  }

  // 2) 位移最近贪心配对
  const candidates: { d: (typeof ds)[number]; a: (typeof ai)[number]; dist: number }[] = [];
  for (const d of ds) {
    if (d.used) continue;
    for (const a of ai) {
      if (a.used) continue;
      const dist = Math.abs(d.s.shift - a.a.shift);
      if (dist <= tol * 3) candidates.push({ d, a, dist });
    }
  }
  candidates.sort((x, y) => x.dist - y.dist);
  for (const c of candidates) {
    if (c.d.used || c.a.used) continue;
    c.d.used = true;
    c.a.used = true;
    rows.push(buildRow(`m-${c.d.i}-${c.a.i}`, c.d.s, c.a.a, tol));
  }

  // 3) 未配对
  for (const d of ds) {
    if (d.used) continue;
    rows.push({
      key: `ds-${d.i}`,
      assignment: d.s.assignment,
      dataset: toDataset(d.s),
      issues: [],
      status: 'AI 未给出',
    });
  }
  for (const a of ai) {
    if (a.used) continue;
    rows.push({
      key: `ai-${a.i}`,
      assignment: a.a.assignment,
      ai: toAi(a.a),
      issues: [],
      status: '数据集缺失',
    });
  }
  return rows;
}

/** SolventSignal → NMRSignal（仅取比对所需的字段），供溶剂自身信号核验复用 */
export function solventSignalToNmrSignal(s: SolventSignal): NMRSignal {
  return {
    shift: s.shift,
    shiftRange: s.shiftRange,
    multiplicity: s.multiplicity,
    coupling: s.coupling ?? [],
    temperatureNote: s.temperatureNote,
    footnoteRefs: [],
    source: s.source,
  };
}