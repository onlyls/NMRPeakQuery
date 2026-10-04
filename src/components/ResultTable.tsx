/* ============================================================================
 * ResultTable.tsx — 三种查询模式的结果展示
 *
 *   single 单峰：同一 (化合物, 溶剂) 的命中信号合并为一张卡；
 *   multi  多峰：观测峰 ↔ 理论峰配对、命中数 / extra / missing 评分；
 *   name   名称：化合物资料卡 + 各溶剂信号折叠表。
 * ========================================================================== */
import { useMemo } from 'react';
import { ChevronDown, Droplet, FlaskConical, Wind } from 'lucide-react';
import type {
  CompoundCategory,
  CompoundData,
  MultiPeakMatch,
  NMRSignal,
  NucleusType,
  SearchResult,
  SolventId,
} from '../types/nmr';
import { useDataset } from '../hooks/useNMRSearch';
import type { NameHit } from '../utils/searchEngine';
import { SignalRow, formatShift, SourceBadge } from './bits';
import { formatAssignment, formatFormula, formatNucleus } from '../utils/chemText';
import { AiVerifyButton, SolventVerifyButton } from './ai/Verify';

const CATEGORY_LABEL: Record<CompoundCategory, string> = {
  'Organic Solvent': '有机溶剂',
  'Organometallic Reagent': '有机金属试剂',
  Gas: '气体',
  'Additive/Grease': '添加剂 / 脂',
  'Internal Standard': '内标',
};

function CategoryIcon({ category }: { category: CompoundCategory }) {
  const cls = 'h-3.5 w-3.5';
  if (category === 'Gas') return <Wind className={cls} />;
  if (category === 'Additive/Grease') return <Droplet className={cls} />;
  return <FlaskConical className={cls} />;
}

/* ------------------------------- 化合物标题 ------------------------------- */

function CompoundHeader({ compound }: { compound: CompoundData }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold text-slate-900">
          {compound.chineseName || compound.name}
        </span>
        <span className="text-xs text-slate-500">{compound.name}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5">
          <CategoryIcon category={compound.category} />
          {CATEGORY_LABEL[compound.category]}
        </span>
        {compound.formula && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{formatFormula(compound.formula)}</span>
        )}
        {compound.mw > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
          {compound.mw} g/mol
        </span>}
        {compound.cas && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">CAS {compound.cas}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ 溶剂信号折叠表 ----------------------------- */

function SolventSignals({
  compound,
  solventId,
  nucleus,
  verify,
}: {
  compound: CompoundData;
  solventId: SolventId;
  /** 当前所选核素：决定 1H / 13C 的展示先后 */
  nucleus: NucleusType;
  /** 为 true 时在该溶剂区块右上角提供 AI 核验（按名称查场景，覆盖 1H + 13C） */
  verify?: boolean;
}) {
  const { dataset } = useDataset();
  const label = dataset?.solvents.find((s) => s.id === solventId)?.label ?? solventId;
  const nuclei: NucleusType[] = nucleus === '13C' ? ['13C', '1H'] : ['1H', '13C'];

  return (
    <details className="group mt-2 rounded-md border border-slate-200 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100/60">
        <span>{formatFormula(label)} 中全部信号</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-3 pb-2.5 pt-1">
        {verify && (
          <SolventVerifyButton compound={compound} solventId={solventId} nucleus={nucleus} />
        )}
        {nuclei.map((nuc) => {
          const arr = compound.signals[solventId]?.[nuc];
          if (!arr?.length) return null;
          return (
            <div key={nuc}>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {formatNucleus(nuc)} · {arr.length} 条
              </div>
              <div className="space-y-1">
                {arr.map((s, i) => (
                  <SignalRow key={i} signal={s} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/* --------------------------------- 卡片壳 -------------------------------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300">
      {children}
    </div>
  );
}

/* -------------------------------- 单峰结果 -------------------------------- */

interface SingleGroup {
  compound: CompoundData;
  solventId: SolventId;
  signals: { signal: NMRSignal; deviation: number }[];
}

function SingleResults({
  hits,
  solventId,
  nucleus,
}: {
  hits: SearchResult[];
  solventId: SolventId | 'all';
  nucleus: NucleusType;
}) {
  const { dataset } = useDataset();
  const groups = useMemo(() => {
    const map = new Map<string, SingleGroup>();
    for (const h of hits) {
      const key = `${h.compound.id}|${h.solventId}`;
      const g = map.get(key) ?? { compound: h.compound, solventId: h.solventId, signals: [] };
      g.signals.push({ signal: h.matchedSignal, deviation: h.deltaDeviation });
      map.set(key, g);
    }
    return [...map.values()];
  }, [hits]);

  if (!groups.length) return <EmptyHint text="容差内没有匹配的化合物信号。可增大容差，或换一种溶剂 / 核素。" />;

  return (
    <div className="space-y-2.5">
      {groups.map((g) => {
        const label = dataset?.solvents.find((s) => s.id === g.solventId)?.label;
        return (
          <Card key={`${g.compound.id}|${g.solventId}`}>
            <div className="flex flex-wrap items-start gap-3">
              <CompoundHeader compound={g.compound} />
              {solventId === 'all' && (
                <span className="ml-auto shrink-0 rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {formatFormula(label)}
                </span>
              )}
              <AiVerifyButton compound={g.compound} solventId={g.solventId} nucleus={nucleus} />
            </div>
            <div className="mt-2 space-y-1 border-l-2 border-sky-200 pl-2.5">
              {g.signals.map(({ signal, deviation }, i) => (
                <div key={i}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm font-semibold text-sky-700">
                      δ {formatShift(signal)}
                    </span>
                    {signal.assignment && (
                      <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-[11px] text-slate-600">
                        {formatAssignment(signal.assignment)}
                      </span>
                    )}
                    {(signal.multiplicity || signal.multiplicityRaw) && (
                      <span className="text-xs text-slate-500">
                        {signal.multiplicity || signal.multiplicityRaw}
                      </span>
                    )}
                    <span
                      className={`font-mono text-[11px] ${
                        deviation === 0 ? 'text-emerald-600' : 'text-orange-500'
                      }`}
                    >
                      Δ {deviation.toFixed(3)}
                    </span>
                    <SourceBadge source={signal.source} />
                  </div>
                </div>
              ))}
            </div>
            <SolventSignals compound={g.compound} solventId={g.solventId} nucleus={nucleus} />
          </Card>
        );
      })}
    </div>
  );
}

/* -------------------------------- 多峰结果 -------------------------------- */

function MultiResults({
  matches,
  nucleus,
}: {
  matches: MultiPeakMatch[];
  nucleus: NucleusType;
}) {
  const { dataset } = useDataset();
  if (!matches.length) {
    return <EmptyHint text="没有化合物能同时匹配两个以上的观测峰。请检查峰位、核素与容差。" />;
  }

  return (
    <div className="space-y-2.5">
      {matches.map((m, idx) => {
        const label = dataset?.solvents.find((s) => s.id === m.solventId)?.label;
        return (
          <Card key={`${m.compound.id}|${m.solventId}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                  {idx + 1}
                </span>
                <CompoundHeader compound={m.compound} />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  命中 {m.pairs.length} 峰
                </span>
                {m.extra > 0 && (
                  <span className="rounded bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-inset ring-orange-200">
                    多余 {m.extra}
                  </span>
                )}
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {formatFormula(label)}
                </span>
              </div>
              <AiVerifyButton compound={m.compound} solventId={m.solventId} nucleus={nucleus} />
            </div>

            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {m.pairs.map((p, i) => (
                <div
                  key={i}
                  className="flex items-baseline gap-2 rounded bg-slate-50 px-2 py-1 text-xs"
                >
                  <span className="font-mono text-slate-500">观测 {p.observed}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono font-semibold text-sky-700">
                    δ {formatShift(p.signal)}
                  </span>
                  {p.signal.assignment && (
                    <span className="font-mono text-[10px] text-slate-500">
                      {formatAssignment(p.signal.assignment)}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-orange-500">
                    Δ {p.deviation.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
            {m.missing > 0 && (
              <div className="mt-1.5 text-[11px] text-slate-400">
                该化合物另有 {m.missing} 条理论峰未在本次输入中给出（痕量场景常见）。
              </div>
            )}
            <SolventSignals compound={m.compound} solventId={m.solventId} nucleus={nucleus} />
          </Card>
        );
      })}
    </div>
  );
}

/* -------------------------------- 名称结果 -------------------------------- */

function NameResults({ hits, nucleus }: { hits: NameHit[]; nucleus: NucleusType }) {
  if (!hits.length) return <EmptyHint text="没有匹配的化合物，可尝试英文名、中文名或 CAS 号。" />;

  return (
    <div className="space-y-2.5">
      {hits.map(({ compound }) => {
        const solventIds = (Object.keys(compound.signals) as SolventId[]).filter(
          (sid) =>
            (compound.signals[sid]?.['1H']?.length ?? 0) +
              (compound.signals[sid]?.['13C']?.length ?? 0) >
            0,
        );
        return (
          <Card key={compound.id}>
            <div className="flex flex-wrap items-start gap-3">
              <CompoundHeader compound={compound} />
            </div>
            {compound.nameRaw.length > 0 && (
              <div className="mt-1.5 text-[11px] text-slate-400">
                文献写法：{compound.nameRaw.join(' · ')}
              </div>
            )}
            <div className="mt-2 space-y-1.5">
              {solventIds.map((sid) => (
                <SolventSignals key={sid} compound={compound} solventId={sid} nucleus={nucleus} verify />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

/* --------------------------------- 导出 --------------------------------- */

interface Props {
  variant: 'single' | 'multi' | 'name';
  single?: SearchResult[];
  multi?: MultiPeakMatch[];
  names?: NameHit[];
  solventId: SolventId | 'all';
  nucleus: NucleusType;
}

export default function ResultTable(props: Props) {
  if (props.variant === 'single') {
    return (
      <SingleResults
        hits={props.single ?? []}
        solventId={props.solventId}
        nucleus={props.nucleus}
      />
    );
  }
  if (props.variant === 'multi') {
    return <MultiResults matches={props.multi ?? []} nucleus={props.nucleus} />;
  }
  return <NameResults hits={props.names ?? []} nucleus={props.nucleus} />;
}
