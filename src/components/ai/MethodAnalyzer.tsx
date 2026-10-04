/* ============================================================================
 * MethodAnalyzer.tsx — 能力二：实验方法解析
 *
 * 粘贴化合物合成的实验方法文本，由 AI 识别测试核磁所用氘代溶剂，
 * 并预测过程中可能残留的溶剂；再用本地文献数据交叉列出真实峰位。
 * ========================================================================== */
import { useState } from 'react';
import { FlaskConical, Loader2, Sparkles } from 'lucide-react';
import type { NucleusType, SolventId } from '../../types/nmr';
import { callAi } from '../../utils/aiClient';
import { resolveSolventId } from '../../utils/solventResolve';
import { resolveCompoundByLabel } from '../../utils/compoundResolve';
import { getSolvent } from '../../utils/searchEngine';
import type { AiMethodPayload } from '../../types/ai';
import { SignalRow, SOLVENT_SIGNAL_KIND_LABEL } from '../bits';
import { AiError, Caveats, RawOutput } from './shared';

const NUCLEI: NucleusType[] = ['1H', '13C'];

export default function MethodAnalyzer() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<AiMethodPayload | null>(null);
  const [raw, setRaw] = useState('');

  async function run() {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    setPayload(null);
    setRaw('');
    try {
      const { data, raw: rawText } = await callAi<AiMethodPayload>({
        task: 'method',
        input: { procedure: text },
      });
      setPayload(data);
      setRaw(rawText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const detectedSolventIds: SolventId[] = (payload?.deuteratedSolvents ?? [])
    .map((n) => resolveSolventId(n))
    .filter((x): x is SolventId => Boolean(x));

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">
        粘贴实验方法（Experimental Section）文本片段，AI 将识别其中测试核磁所用的氘代溶剂，
        并预测可能残留的溶剂；随后用本地文献数据（Gottlieb 1997 / Fulmer 2010 / Babij 2016 / Cseri 2023）
        交叉列出这些溶剂的真实峰位。AI 识别结果仅供参考。
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">实验方法文本</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={'例如：… the residue was purified by column chromatography (EtOAc/hexanes) to give … ¹H NMR (400 MHz, CDCl₃) δ …'}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>

      <button
        type="button"
        onClick={run}
        disabled={loading || !text.trim()}
        className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'AI 分析中…' : 'AI 分析'}
      </button>

      <AiError message={error} />

      {payload && (
        <div className="space-y-4">
          {/* 氘代溶剂 */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <FlaskConical className="h-4 w-4 text-sky-600" />
              测试核磁的氘代溶剂
            </h3>
            {!payload.deuteratedSolvents?.length ? (
              <p className="text-xs text-slate-400">AI 未识别出氘代溶剂。</p>
            ) : (
              <div className="space-y-2">
                {payload.deuteratedSolvents.map((name, i) => {
                  const id = resolveSolventId(name);
                  const solvent = id ? getSolvent(id) : null;
                  return (
                    <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-slate-800">{name}</span>
                        {solvent ? (
                          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                            匹配：{solvent.label}
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                            未在本地数据集中匹配
                          </span>
                        )}
                      </div>
                      {solvent && (
                        <div className="mt-2 space-y-1 border-l-2 border-sky-200 pl-2.5">
                          {solvent.signals.map((s, k) => (
                            <div key={k} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                              <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">
                                {s.nucleus}
                              </span>
                              <span className="text-slate-500">{SOLVENT_SIGNAL_KIND_LABEL[s.kind]}</span>
                              <span className="font-mono font-semibold text-sky-700">δ {s.shift}</span>
                              {s.multiplicity && <span className="text-slate-500">{s.multiplicity}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 可能残留的溶剂 */}
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">可能残留的溶剂 / 杂质</h3>
            {!payload.expectedResidualSolvents?.length ? (
              <p className="text-xs text-slate-400">AI 未预测出残留溶剂。</p>
            ) : (
              <div className="space-y-2">
                {payload.expectedResidualSolvents.map((item, i) => {
                  const hit = resolveCompoundByLabel(item.name, item.cas);
                  return (
                    <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {hit ? hit.chineseName || hit.name : item.name}
                        </span>
                        {hit && <span className="text-xs text-slate-500">{hit.name}</span>}
                        {!hit && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                            未在本地数据集中匹配
                          </span>
                        )}
                      </div>
                      {item.reason && <div className="mt-1 text-[11px] text-slate-500">{item.reason}</div>}
                      {hit && detectedSolventIds.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {detectedSolventIds.map((sid) => {
                            const label = getSolvent(sid)?.label ?? sid;
                            const block = NUCLEI.map((nuc) => {
                              const arr = hit.signals[sid]?.[nuc];
                              if (!arr?.length) return null;
                              return (
                                <div key={nuc}>
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    {label} · {nuc}
                                  </div>
                                  {arr.map((s, k) => (
                                    <SignalRow key={k} signal={s} />
                                  ))}
                                </div>
                              );
                            }).filter(Boolean);
                            if (!block.length) {
                              return (
                                <div key={sid} className="text-[11px] text-slate-400">
                                  {label} 中无该化合物的文献信号。
                                </div>
                              );
                            }
                            return (
                              <div key={sid} className="space-y-1 border-l-2 border-slate-200 pl-2.5">
                                {block}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {payload.summary && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              {payload.summary}
            </div>
          )}
          {!!payload.caveats?.length && <Caveats items={payload.caveats} />}
          {raw && <RawOutput raw={raw} />}
        </div>
      )}
    </div>
  );
}