/* ============================================================================
 * bits.tsx — 结果展示用的共享小组件
 * ========================================================================== */
import type { NMRSignal, SolventSignalKind, SourceId } from '../types/nmr';

export const SOURCE_META: Record<SourceId, { label: string; cls: string; title: string }> = {
  gottlieb1997: {
    label: '1997',
    cls: 'bg-slate-100 text-slate-600 ring-slate-200',
    title: 'Gottlieb et al., J. Org. Chem. 1997',
  },
  fulmer2010: {
    label: '2010',
    cls: 'bg-amber-50 text-amber-700 ring-amber-200',
    title: 'Fulmer et al., Organometallics 2010（含 SI 更正）',
  },
  babij2016: {
    label: '2016',
    cls: 'bg-sky-50 text-sky-700 ring-sky-200',
    title: 'Babij et al., Org. Process Res. Dev. 2016 (SI)',
  },
};

export function SourceBadge({ source }: { source: SourceId }) {
  const m = SOURCE_META[source];
  return (
    <span
      title={m.title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export const SOLVENT_SIGNAL_KIND_LABEL: Record<SolventSignalKind, string> = {
  residual: '残余质子峰',
  water: '水峰',
  solventCarbon: '¹³C 溶剂峰',
};

/** 位移格式化：中心值（3 位小数）+ 区间 */
export function formatShift(s: { shift: number; shiftRange?: [number, number] }): string {
  const v = s.shift.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  if (!s.shiftRange) return v;
  const [lo, hi] = s.shiftRange;
  const f = (x: number) => x.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${v}（${f(lo)}–${f(hi)}）`;
}

/** 裂分 + J 偶合描述，如 "q, J = 7.1 Hz"；优先归一化 multiplicity，退回文献原文 */
export function formatMultiplicity(s: NMRSignal): string {
  const mult = s.multiplicity || s.multiplicityRaw || '';
  const j = s.coupling?.length ? `J = ${s.coupling.map((x) => x.toFixed(1)).join(', ')} Hz` : '';
  return [mult, j].filter(Boolean).join(', ');
}

/** 一条化合物信号的紧凑行 */
export function SignalRow({ signal, dim = false }: { signal: NMRSignal; dim?: boolean }) {
  return (
    <div className={dim ? 'text-slate-400' : ''}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-sm font-semibold text-slate-800">
          δ {formatShift(signal)}
        </span>
        {signal.assignment && (
          <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-[11px] text-slate-600">
            {signal.assignment}
          </span>
        )}
        {(signal.multiplicity || signal.multiplicityRaw) && (
          <span className="text-xs text-slate-500">{formatMultiplicity(signal)}</span>
        )}
        <SourceBadge source={signal.source} />
      </div>
      {signal.superseded?.map((sup, i) => (
        <div key={i} className="mt-0.5 pl-1 text-[11px] text-slate-400">
          ↳ {sup.note}（δ {sup.shift.toFixed(2).replace(/\.?0+$/, '')}）
        </div>
      ))}
    </div>
  );
}
