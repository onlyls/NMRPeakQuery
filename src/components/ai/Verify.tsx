/* ============================================================================
 * Verify.tsx — 数据集核验（下沉到查询页）
 *
 *   SolventSignalsBlock：按峰位查侧栏，始终渲染所选溶剂自身信号（本地优先），
 *                       启用「数据集核验」后右上角提供 AI 核验按钮与比对表；
 *   AiVerifyButton     ：结果卡片右上角，按需核验命中化合物的信号；
 *   SolventVerifyButton：按名称查时每种溶剂区块右上角，按溶剂独立核验。
 *
 * 三处共用 useVerify：首次展开请求一次，之后开合只切换显隐（不重复请求）；
 * 命中本地缓存时提示「已加载缓存」并提供「强制更新」。
 * 本地文献数据集始终先渲染且为权威来源，AI 为独立参考、绝不阻塞。
 * ========================================================================== */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { History, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type {
  CompoundData,
  NucleusType,
  SolventId,
  SolventSignalKind,
} from '../../types/nmr';
import { getSolvent } from '../../utils/searchEngine';
import { callAi } from '../../utils/aiClient';
import { useAiSettings } from '../../utils/aiSettings';
import {
  compareSignals,
  solventSignalToNmrSignal,
  type VerifyRow,
  type VerifyStatus,
} from '../../utils/verifyCompare';
import type { AiCallResult, AiVerifyPayload } from '../../types/ai';
import { SourceBadge, SOLVENT_SIGNAL_KIND_LABEL, formatMultiplicity, formatShift } from '../bits';
import { AiError, Caveats, RawOutput } from './shared';

type VerifyResult = AiCallResult<AiVerifyPayload>;

const KIND_ORDER: Record<SolventSignalKind, number> = {
  residual: 0,
  water: 1,
  solventCarbon: 2,
};

const STATUS_CLS: Record<VerifyStatus, string> = {
  一致: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  位移偏差: 'bg-amber-50 text-amber-700 ring-amber-200',
  位移明显偏差: 'bg-red-50 text-red-700 ring-red-200',
  裂分不符: 'bg-orange-50 text-orange-700 ring-orange-200',
  耦合常数不符: 'bg-orange-50 text-orange-700 ring-orange-200',
  数据集缺失: 'bg-slate-100 text-slate-500 ring-slate-200',
  'AI 未给出': 'bg-slate-100 text-slate-500 ring-slate-200',
};

function jText(j: number[] | undefined): string {
  return j?.length ? `J = ${j.map((x) => x.toFixed(1)).join(', ')} Hz` : '';
}

/* --------------------------- 核验状态（可开合） --------------------------- */

interface VerifyEntry {
  loading: boolean;
  error: string;
  result: VerifyResult | null;
}

interface VerifyController {
  open: boolean;
  entries: Record<string, VerifyEntry>;
  anyLoading: boolean;
  /** 展开（首次会请求缺失项）/ 收起（仅隐藏，不重复请求） */
  toggle: () => void;
  /** 强制更新单个核素：绕过缓存重新请求 */
  refreshOne: (key: string) => void;
}

/** 按 key（核素）管理多份核验结果：已有结果直接复用，缺失项才请求 */
function useVerify(
  loaders: Record<string, (bypass: boolean) => Promise<VerifyResult>>,
): VerifyController {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Record<string, VerifyEntry>>({});
  const loadersRef = useRef(loaders);
  loadersRef.current = loaders;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const runKeys = useCallback(async (keys: string[], bypass: boolean) => {
    await Promise.all(
      keys.map(async (k) => {
        const loader = loadersRef.current[k];
        if (!loader) return;
        setEntries((p) => ({
          ...p,
          [k]: { loading: true, error: '', result: p[k]?.result ?? null },
        }));
        try {
          const result = await loader(bypass);
          setEntries((p) => ({ ...p, [k]: { loading: false, error: '', result } }));
        } catch (e) {
          setEntries((p) => ({
            ...p,
            [k]: {
              loading: false,
              error: e instanceof Error ? e.message : String(e),
              result: p[k]?.result ?? null,
            },
          }));
        }
      }),
    );
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      setOpen(false); // 收起：仅隐藏，保留结果
      return;
    }
    setOpen(true);
    // 仅请求「尚无结果且未在加载」的核素；已有缓存 / 结果直接复用
    const missing = Object.keys(loadersRef.current).filter(
      (k) => !entriesRef.current[k]?.result && !entriesRef.current[k]?.loading,
    );
    if (missing.length) void runKeys(missing, false);
  }, [open, runKeys]);

  const refreshOne = useCallback((k: string) => void runKeys([k], true), [runKeys]);
  const anyLoading = Object.values(entries).some((e) => e.loading);

  return { open, entries, anyLoading, toggle, refreshOne };
}

/** 结果卡片 / 区块右上角的核验开合按钮 */
function VerifyToggleButton({
  open,
  loading,
  onClick,
  idleLabel,
  className = '',
}: {
  open: boolean;
  loading: boolean;
  onClick: () => void;
  idleLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {open ? '收起核验' : idleLabel}
    </button>
  );
}

/* ------------------------------ 比对结果表 ------------------------------ */

function VerifyTable({ rows }: { rows: VerifyRow[] }) {
  if (!rows.length) {
    return <div className="text-[11px] text-slate-400">无可比对条目。</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">归属</th>
            <th className="px-3 py-2 text-left font-medium">数据集 δ</th>
            <th className="px-3 py-2 text-left font-medium">AI δ</th>
            <th className="px-3 py-2 text-left font-medium">Δ</th>
            <th className="px-3 py-2 text-left font-medium">判定</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-2 font-mono text-slate-600">{r.assignment || '—'}</td>
              <td className="px-3 py-2 text-slate-800">
                {r.dataset ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-mono">{formatShift(r.dataset)}</span>
                    {r.dataset.multiplicity && <span className="text-slate-500">{r.dataset.multiplicity}</span>}
                    {jText(r.dataset.coupling) && (
                      <span className="text-slate-400">{jText(r.dataset.coupling)}</span>
                    )}
                    <SourceBadge source={r.dataset.source} />
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2 text-slate-800">
                {r.ai ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-mono">{r.ai.shift}</span>
                    {r.ai.multiplicity && <span className="text-slate-500">{r.ai.multiplicity}</span>}
                    {jText(r.ai.coupling) && <span className="text-slate-400">{jText(r.ai.coupling)}</span>}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2 font-mono text-slate-500">
                {r.shiftDelta != null ? r.shiftDelta.toFixed(3) : '—'}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_CLS[r.status]}`}
                >
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- 核验结果（含缓存提示） ---------------------------- */

function VerifyResultBlock({
  rows,
  result,
  header,
  onRefresh,
  refreshing,
}: {
  rows: VerifyRow[] | null;
  result: VerifyResult;
  header?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="space-y-2">
      {header && <div className="text-[11px] text-slate-500">{header}</div>}
      {result.fromCache && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <History className="h-3 w-3 shrink-0" />
          <span>已加载本地保存的 AI 核验缓存（AI 结果可能随时间变化）</span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="ml-auto inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              强制更新
            </button>
          )}
        </div>
      )}
      {rows && <VerifyTable rows={rows} />}
      {result.data.summary && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
          {result.data.summary}
        </div>
      )}
      {result.data.caveats && result.data.caveats.length > 0 && <Caveats items={result.data.caveats} />}
      {result.raw && <RawOutput raw={result.raw} />}
    </div>
  );
}

/* --------------------- 所选溶剂自身信号（按峰位查侧栏） --------------------- */

export function SolventSignalsBlock({
  solventId,
  nucleus,
}: {
  solventId: SolventId | 'all';
  nucleus: NucleusType;
}) {
  const settings = useAiSettings();
  const solvent = solventId === 'all' ? null : getSolvent(solventId);
  const signals = useMemo(
    () => (solvent ? solvent.signals.filter((s) => s.nucleus === nucleus) : []),
    [solvent, nucleus],
  );
  const sorted = useMemo(
    () => [...signals].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]),
    [signals],
  );

  const key = nucleus as string;
  const v = useVerify({
    [key]: (bypassCache) => {
      if (!solvent) return Promise.reject(new Error('未选择溶剂'));
      return callAi<AiVerifyPayload>({
        task: 'verify',
        input: { compoundName: solvent.label, solventLabel: solvent.label, nucleus },
        bypassCache,
      });
    },
  });
  const entry = v.entries[key];
  const rows = useMemo(
    () =>
      entry?.result
        ? compareSignals(
            signals.map(solventSignalToNmrSignal),
            entry.result.data.signals ?? [],
            nucleus,
          )
        : null,
    [entry, signals, nucleus],
  );

  if (!solvent) return null;
  const canAi = settings.enabled && settings.capabilities.verify;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-slate-700">
          所选溶剂自身信号
          <span className="ml-1.5 font-normal text-slate-500">
            {solvent.label} · {nucleus}
          </span>
        </div>
        {canAi && signals.length > 0 && (
          <VerifyToggleButton
            open={v.open}
            loading={v.anyLoading}
            onClick={v.toggle}
            idleLabel="AI 核验"
            className="shrink-0 px-2 py-0.5"
          />
        )}
      </div>

      {!signals.length ? (
        <div className="text-[11px] text-slate-400">该溶剂在 {nucleus} 下无本地信号。</div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {sorted.map((s, i) => (
            <div key={i} className="inline-flex flex-wrap items-baseline gap-x-1.5 text-xs">
              <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">
                {SOLVENT_SIGNAL_KIND_LABEL[s.kind]}
              </span>
              <span className="font-mono font-semibold text-slate-800">δ {formatShift(s)}</span>
              {(s.multiplicity || s.coupling?.length) && (
                <span className="text-slate-500">
                  {formatMultiplicity(solventSignalToNmrSignal(s))}
                </span>
              )}
              <SourceBadge source={s.source} />
              {s.temperatureNote && <span className="text-[10px] text-slate-400">{s.temperatureNote}</span>}
            </div>
          ))}
        </div>
      )}

      {canAi && v.open && (
        <div className="mt-2 space-y-2">
          <AiError message={entry?.error ?? ''} />
          {entry?.result && (
            <VerifyResultBlock
              rows={rows}
              result={entry.result}
              refreshing={entry.loading}
              onRefresh={() => v.refreshOne(key)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- 结果卡片：AI 核验 --------------------------- */

function firstSolventWithNucleus(compound: CompoundData, nucleus: NucleusType): SolventId | null {
  return (
    (Object.keys(compound.signals) as SolventId[]).find(
      (sid) => compound.signals[sid]?.[nucleus]?.length,
    ) ?? null
  );
}

function verifyInput(
  compound: CompoundData,
  label: string,
  nucleus: NucleusType,
): Record<string, unknown> {
  return {
    compoundName: compound.name,
    chineseName: compound.chineseName,
    cas: compound.cas,
    formula: compound.formula,
    smiles: compound.smiles,
    solventLabel: label,
    nucleus,
  };
}

export function AiVerifyButton({
  compound,
  solventId,
  nucleus,
}: {
  compound: CompoundData;
  solventId: SolventId | 'all';
  nucleus: NucleusType;
}) {
  const settings = useAiSettings();
  if (!(settings.enabled && settings.capabilities.verify)) return null;
  return <AiVerifyButtonInner compound={compound} solventId={solventId} nucleus={nucleus} />;
}

function AiVerifyButtonInner({
  compound,
  solventId,
  nucleus,
}: {
  compound: CompoundData;
  solventId: SolventId | 'all';
  nucleus: NucleusType;
}) {
  // 'all' 时取该化合物第一个含此核素数据的溶剂
  const effective = solventId !== 'all' ? solventId : firstSolventWithNucleus(compound, nucleus);
  const signals = useMemo(
    () => (effective ? compound.signals[effective]?.[nucleus] ?? [] : []),
    [compound, effective, nucleus],
  );
  const label = effective ? getSolvent(effective)?.label ?? effective : '';
  const derived = solventId === 'all';

  const key = nucleus as string;
  const v = useVerify({
    [key]: (bypassCache) =>
      callAi<AiVerifyPayload>({
        task: 'verify',
        input: verifyInput(compound, label, nucleus),
        bypassCache,
      }),
  });
  const entry = v.entries[key];
  const rows = useMemo(
    () =>
      entry?.result
        ? compareSignals(signals, entry.result.data.signals ?? [], nucleus)
        : null,
    [entry, signals, nucleus],
  );

  if (!effective || !signals.length) return null;

  return (
    <>
      <VerifyToggleButton
        open={v.open}
        loading={v.anyLoading}
        onClick={v.toggle}
        idleLabel="AI 核验"
        className="ml-auto shrink-0 px-2 py-0.5"
      />
      {v.open && (
        <div className="basis-full space-y-2 border-t border-slate-100 pt-2">
          <AiError message={entry?.error ?? ''} />
          {entry?.result && (
            <VerifyResultBlock
              rows={rows}
              result={entry.result}
              refreshing={entry.loading}
              onRefresh={() => v.refreshOne(key)}
              header={
                <>
                  AI 文献值核验 · {label} · {nucleus}
                  {derived && (
                    <span className="ml-1 text-slate-400">（该化合物在溶剂限定时取首个可用溶剂）</span>
                  )}
                </>
              }
            />
          )}
        </div>
      )}
    </>
  );
}

/* ------------------- 结果卡片：每种溶剂各自核验（名称检索） ------------------- */

export function SolventVerifyButton({
  compound,
  solventId,
  nucleus,
}: {
  compound: CompoundData;
  solventId: SolventId;
  nucleus: NucleusType;
}) {
  const settings = useAiSettings();
  if (!(settings.enabled && settings.capabilities.verify)) return null;
  return <SolventVerifyButtonInner compound={compound} solventId={solventId} nucleus={nucleus} />;
}

function SolventVerifyButtonInner({
  compound,
  solventId,
  nucleus,
}: {
  compound: CompoundData;
  solventId: SolventId;
  nucleus: NucleusType;
}) {
  const label = getSolvent(solventId)?.label ?? solventId;
  // 该溶剂下「有本地信号」的核素，所选核素优先展示
  const order: NucleusType[] = nucleus === '13C' ? ['13C', '1H'] : ['1H', '13C'];
  const nuclei = useMemo(
    () => order.filter((n) => compound.signals[solventId]?.[n]?.length),
    [compound, solventId, nucleus],
  );
  const loaders = useMemo(
    () =>
      Object.fromEntries(
        nuclei.map((n) => [
          n,
          (bypassCache: boolean) =>
            callAi<AiVerifyPayload>({
              task: 'verify',
              input: verifyInput(compound, label, n),
              bypassCache,
            }),
        ]),
      ) as Record<string, (bypass: boolean) => Promise<VerifyResult>>,
    [compound, label, nuclei],
  );

  const v = useVerify(loaders);

  if (!nuclei.length) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <VerifyToggleButton
        open={v.open}
        loading={v.anyLoading}
        onClick={v.toggle}
        idleLabel="AI 核验"
        className="px-2 py-0.5"
      />
      {v.open && (
        <div className="w-full space-y-3">
          {nuclei.map((n) => {
            const e = v.entries[n];
            const rows = e?.result
              ? compareSignals(compound.signals[solventId]?.[n] ?? [], e.result.data.signals ?? [], n)
              : null;
            return (
              <div key={n} className="space-y-2">
                <AiError message={e?.error ?? ''} />
                {e?.result && (
                  <VerifyResultBlock
                    rows={rows}
                    result={e.result}
                    refreshing={e.loading}
                    onRefresh={() => v.refreshOne(n)}
                    header={
                      <>
                        AI 文献值核验 · {label} · {n}
                      </>
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
