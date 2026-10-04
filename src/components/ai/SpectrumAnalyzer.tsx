/* ============================================================================
 * SpectrumAnalyzer.tsx — 能力三：谱图核验与归属
 *
 * 输入「谱图（图片 / 数据文件 / 峰位文本）」+「候选化合物 SMILES（必填）」，
 * 由 AI 判断谱图是否与结构相符，并逐峰归属；SMILES 命中库内化合物时，
 * 拉取该溶剂下的文献信号与 AI 归属交叉比对。
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Search, Sparkles, Type, X } from 'lucide-react';
import type { NucleusType, SolventId } from '../../types/nmr';
import { useDataset } from '../../hooks/useNMRSearch';
import { getSolvent, searchByName } from '../../utils/searchEngine';
import { findCompoundBySmiles } from '../../utils/compoundMatch';
import { callAi, imageToDataUrl } from '../../utils/aiClient';
import { parseSpectrumFile, peakShifts } from '../../utils/spectrumParser';
import type { AiConfidence, AiMatchLevel, AiSpectrumPayload } from '../../types/ai';
import { parseShifts } from '../PeakInput';
import { SignalRow } from '../bits';
import { formatAssignment, formatFormula, formatNucleus } from '../../utils/chemText';
import { AiError, Caveats, RawOutput } from './shared';

type Source = 'image' | 'file' | 'text';

const VERDICT_META: Record<AiMatchLevel, { label: string; cls: string }> = {
  consistent: { label: '一致', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  partial: { label: '部分一致', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  inconsistent: { label: '不一致', cls: 'border-red-200 bg-red-50 text-red-800' },
};

const CONFIDENCE_LABEL: Record<AiConfidence, string> = { high: '高', medium: '中', low: '低' };

const SOURCE_TABS: { id: Source; label: string; icon: typeof ImageIcon }[] = [
  { id: 'image', label: '谱图图片', icon: ImageIcon },
  { id: 'file', label: '数据文件', icon: FileText },
  { id: 'text', label: '峰位文本', icon: Type },
];

interface FileMeta {
  name: string;
  format: string;
  warnings: string[];
}

export default function SpectrumAnalyzer({ visionAvailable }: { visionAvailable: boolean }) {
  const { dataset } = useDataset();

  const [source, setSource] = useState<Source>('text');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageErr, setImageErr] = useState('');
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [peaksText, setPeaksText] = useState('');

  const [smiles, setSmiles] = useState('');
  const [compoundName, setCompoundName] = useState('');
  const [formula, setFormula] = useState('');
  const [lookup, setLookup] = useState('');
  const [lookupMsg, setLookupMsg] = useState('');

  const [nucleus, setNucleus] = useState<NucleusType>('1H');
  const [solventId, setSolventId] = useState<SolventId | 'none'>('none');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<AiSpectrumPayload | null>(null);
  const [raw, setRaw] = useState('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedShifts = useMemo(() => parseShifts(peaksText), [peaksText]);
  const canSubmit =
    !!smiles.trim() && (source === 'image' ? !!imageDataUrl : parsedShifts.length > 0);

  /* ------------------------- 文件 / 图片 / 数据集带入 ------------------------- */

  async function loadSpectrumFile(f: File) {
    setError('');
    setFileMeta({ name: f.name, format: '', warnings: [] });
    setPeaksText('');
    try {
      const parsed = await parseSpectrumFile(f);
      setFileMeta({ name: f.name, format: parsed.format, warnings: parsed.warnings });
      setPeaksText(peakShifts(parsed.peaks).join(', '));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void loadSpectrumFile(f);
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageErr('');
    setImageDataUrl('');
    try {
      setImageDataUrl(await imageToDataUrl(f));
    } catch (err) {
      setImageErr(err instanceof Error ? err.message : String(err));
    }
  }

  /** 清除已上传的谱图图片及其分析结果（重置文件选择框，便于再次选同一文件） */
  function clearImage() {
    setImageDataUrl('');
    setImageErr('');
    setError('');
    setPayload(null);
    setRaw('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  /** 清除已上传的数据文件，连同其解析出的峰位文本与分析结果一并清空 */
  function clearFile() {
    setFileMeta(null);
    setPeaksText('');
    setError('');
    setPayload(null);
    setRaw('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /* ------------------------------- 粘贴上传 ------------------------------- */

  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      // 在输入框 / 文本域内粘贴不拦截，保证正常文本编辑
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      const data = e.clipboardData;
      if (!data) return;

      const files = Array.from(data.files ?? []);
      let image = files.find((f) => f.type.startsWith('image/')) ?? null;
      let other = files.find((f) => !f.type.startsWith('image/')) ?? null;
      if (!image && !other) {
        for (const item of Array.from(data.items ?? [])) {
          if (item.kind !== 'file') continue;
          const f = item.getAsFile();
          if (!f) continue;
          if (f.type.startsWith('image/')) image = image ?? f;
          else other = other ?? f;
        }
      }
      const text = data.getData('text/plain');

      if (source === 'image') {
        if (!image) return;
        e.preventDefault();
        setImageErr('');
        setImageDataUrl('');
        try {
          setImageDataUrl(await imageToDataUrl(image));
        } catch (err) {
          setImageErr(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      if (!other && !text.trim()) return;
      e.preventDefault();
      if (other) {
        await loadSpectrumFile(other);
        return;
      }
      try {
        const parsed = await parseSpectrumFile(
          new File([text], 'pasted-spectrum.txt', { type: 'text/plain' }),
        );
        setFileMeta({ name: '粘贴内容', format: parsed.format, warnings: parsed.warnings });
        setPeaksText(peakShifts(parsed.peaks).join(', '));
      } catch {
        setFileMeta({ name: '粘贴内容', format: '文本峰位', warnings: [] });
        setPeaksText(text); // 交给 parseShifts 识别
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  function prefillFromDataset() {
    const hit = searchByName(lookup)[0]?.compound;
    if (!hit) {
      setLookupMsg('未在本地数据集中找到该化合物');
      return;
    }
    setSmiles(hit.smiles ?? '');
    setCompoundName(hit.name);
    setFormula(hit.formula);
    setLookupMsg(hit.smiles ? `已带入 ${hit.chineseName || hit.name}` : `${hit.name} 无 SMILES，请手动填写`);
  }

  /* --------------------------------- 提交 --------------------------------- */

  async function run() {
    if (!canSubmit) return;
    const solvent = solventId !== 'none' ? getSolvent(solventId) : null;
    const images = source === 'image' && imageDataUrl ? [imageDataUrl] : undefined;
    setLoading(true);
    setError('');
    setPayload(null);
    setRaw('');
    try {
      const { data, raw: rawText } = await callAi<AiSpectrumPayload>({
        task: 'spectrum',
        input: {
          nucleus,
          smiles: smiles.trim(),
          compoundName: compoundName.trim() || undefined,
          formula: formula.trim() || undefined,
          solventLabel: solvent?.label,
          peaks: source === 'image' ? undefined : parsedShifts,
          fileFormat:
            source === 'image' ? '图片' : source === 'file' ? fileMeta?.format ?? '数据文件' : '手动峰位',
        },
        images,
      });
      setPayload(data);
      setRaw(rawText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------- 结果派生：库内交叉 ---------------------------- */

  const libCompound = useMemo(() => findCompoundBySmiles(smiles.trim()), [smiles]);
  const libSignals = useMemo(() => {
    if (!libCompound || solventId === 'none') return [];
    return libCompound.signals[solventId]?.[nucleus] ?? [];
  }, [libCompound, solventId, nucleus]);

  const libRows = useMemo(() => {
    if (!libSignals.length || !payload?.assignments?.length) return [];
    return libSignals.map((sig) => {
      let nearest = Infinity;
      let nearestShift: number | null = null;
      for (const a of payload.assignments!) {
        const d = Math.abs(a.shift - sig.shift);
        if (d < nearest) {
          nearest = d;
          nearestShift = a.shift;
        }
      }
      return { sig, observed: nearestShift, delta: Number.isFinite(nearest) ? nearest : null };
    });
  }, [libSignals, payload]);

  const solventDatasetSignals =
    solventId !== 'none' ? getSolvent(solventId)?.signals.filter((s) => s.nucleus === nucleus) ?? [] : [];

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">
        提供谱图（图片 / JCAMP-DX / CSV 等数据文件 / 峰位文本，任选其一）与候选化合物 SMILES，
        AI 将判断谱图是否与结构相符，并逐峰归属到结构片段。结论可靠性取决于模型能力边界，
        务必人工复核。
      </p>

      {/* 谱图来源 */}
      <div>
        <div className="mb-2 inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
          {SOURCE_TABS.map((t) => {
            const Icon = t.icon;
            const disabled = t.id === 'image' && !visionAvailable;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => setSource(t.id)}
                title={disabled ? '未配置视觉模型' : undefined}
                className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium transition ${
                  source === t.id ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mb-2 text-[11px] text-slate-400">
          支持直接 Ctrl+V 粘贴谱图图片或数据文件（峰位文本也会自动填入）
        </p>

        {source === 'image' && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <div className="flex items-center gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={onImage}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-sky-700"
              />
              {imageDataUrl && (
                <button
                  type="button"
                  onClick={clearImage}
                  title="清除已上传的谱图图片"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <X className="h-3 w-3" />
                  清除
                </button>
              )}
            </div>
            {imageErr && <div className="mt-2 text-xs text-red-600">{imageErr}</div>}
            {imageDataUrl && (
              <img
                src={imageDataUrl}
                alt="谱图预览"
                className="mt-3 max-h-64 w-full rounded border border-slate-200 object-contain"
              />
            )}
          </div>
        )}

        {source !== 'image' && (
          <div className="space-y-2">
            {source === 'file' && (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jdx,.dx,.jcamp,.csv,.txt,text/plain"
                  onChange={onFile}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-sky-700"
                />
                {fileMeta && (
                  <button
                    type="button"
                    onClick={clearFile}
                    title="清除已上传的数据文件及其峰位"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" />
                    清除
                  </button>
                )}
              </div>
            )}
            {fileMeta && (
              <div className="text-[11px] text-slate-500">
                已解析 <span className="font-medium">{fileMeta.name}</span>
                {fileMeta.format && ` · ${fileMeta.format}`}
                {fileMeta.warnings.map((w, i) => (
                  <div key={i} className="text-amber-600">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                观测峰位（ppm，可编辑；空格或逗号分隔）
              </span>
              <textarea
                value={peaksText}
                onChange={(e) => setPeaksText(e.target.value)}
                rows={2}
                placeholder={nucleus === '1H' ? '如 7.26, 4.12, 2.05, 1.26' : '如 170.5, 60.4, 14.2'}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {parsedShifts.length > 0 && (
                <span className="mt-1 block text-[11px] text-slate-400">
                  已识别 {parsedShifts.length} 个峰
                </span>
              )}
            </label>
          </div>
        )}
      </div>

      {/* 候选化合物 */}
      <div className="rounded-lg border border-slate-200 bg-white p-3.5">
        <div className="mb-2 text-xs font-semibold text-slate-700">候选化合物（SMILES 必填）</div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">SMILES</span>
          <input
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            placeholder="如 CCOC(=O)C"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={compoundName}
            onChange={(e) => setCompoundName(e.target.value)}
            placeholder="名称（可选）"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="分子式（可选）"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="从数据集带入：名称 / CAS"
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <button
            type="button"
            onClick={prefillFromDataset}
            className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            带入
          </button>
        </div>
        {lookupMsg && <div className="mt-1 text-[11px] text-slate-500">{lookupMsg}</div>}
      </div>

      {/* 上下文 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">核素</span>
          <select
            value={nucleus}
            onChange={(e) => setNucleus(e.target.value as NucleusType)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="1H">¹H</option>
            <option value="13C">¹³C</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">氘代溶剂（可选）</span>
          <select
            value={solventId}
            onChange={(e) => setSolventId(e.target.value as SolventId | 'none')}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="none">未指定</option>
            {dataset?.solvents.map((s) => (
              <option key={s.id} value={s.id}>
                {formatFormula(s.label)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={loading || !canSubmit}
        className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'AI 核验中…' : '核验并归属'}
      </button>
      {!canSubmit && (
        <span className="ml-2 text-[11px] text-slate-400">
          {source === 'image' ? '请上传谱图图片' : '请输入峰位'}并填写 SMILES
        </span>
      )}

      <AiError message={error} />

      {payload && (
        <div className="space-y-4">
          {/* 相符性结论 */}
          {payload.verdict && (
            <div className={`rounded-lg border p-3 ${VERDICT_META[payload.verdict.level].cls}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                谱图与结构判定：{VERDICT_META[payload.verdict.level].label}
                {payload.verdict.confidence && (
                  <span className="rounded bg-white/60 px-1.5 py-0.5 text-[11px] font-medium">
                    置信度 {CONFIDENCE_LABEL[payload.verdict.confidence]}
                  </span>
                )}
              </div>
              {payload.verdict.reason && (
                <div className="mt-1 text-xs leading-relaxed opacity-90">{payload.verdict.reason}</div>
              )}
            </div>
          )}

          {/* 峰归属表 */}
          {!!payload.assignments?.length && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">峰归属</h3>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">δ 观测</th>
                      <th className="px-3 py-2 text-left font-medium">归属</th>
                      <th className="px-3 py-2 text-left font-medium">裂分</th>
                      <th className="px-3 py-2 text-left font-medium">理论 δ</th>
                      <th className="px-3 py-2 text-left font-medium">Δ</th>
                      <th className="px-3 py-2 text-left font-medium">置信</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payload.assignments.map((a, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono font-semibold text-sky-700">{a.shift}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatAssignment(a.assignment)}
                          {a.note && <div className="text-[11px] text-slate-400">{a.note}</div>}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{a.multiplicity || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">
                          {a.expectedShift ?? '—'}
                        </td>
                        <td
                          className={`px-3 py-2 font-mono ${
                            a.deviation != null && Math.abs(a.deviation) > 0.1
                              ? 'text-red-500'
                              : 'text-slate-500'
                          }`}
                        >
                          {a.deviation != null ? a.deviation.toFixed(3) : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {a.confidence ? CONFIDENCE_LABEL[a.confidence] : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 库内交叉比对 */}
          {libCompound && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">
                库内交叉比对
                <span className="ml-2 text-xs font-normal text-slate-500">
                  SMILES 命中：{libCompound.chineseName || libCompound.name}
                </span>
              </h3>
              {solventId === 'none' ? (
                <p className="text-xs text-slate-400">选择氘代溶剂后可对比该化合物的文献信号。</p>
              ) : !libRows.length ? (
                <p className="text-xs text-slate-400">该溶剂 / 核素下无文献信号。</p>
              ) : (
                <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
                  {libRows.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <SignalRow signal={r.sig} />
                      <span className="ml-auto font-mono text-[11px] text-slate-400">
                        {r.observed != null
                          ? `最近观测 δ ${r.observed} · Δ ${r.delta?.toFixed(3)}`
                          : '无对应观测峰'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 溶剂峰 */}
          {!!payload.solventPeaks?.length && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">溶剂 / 水峰</h3>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                {payload.solventPeaks.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-700">δ {s.shift}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-600">
                      {s.kind === 'residual' ? '残余溶剂峰' : s.kind === 'water' ? '水峰' : '¹³C 溶剂峰'}
                    </span>
                    {s.note && <span className="text-slate-400">{s.note}</span>}
                  </div>
                ))}
                {solventDatasetSignals.length > 0 && (
                  <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
                    数据集参考（{formatFormula(getSolvent(solventId as SolventId)?.label)} · {formatNucleus(nucleus)}）：
                    {solventDatasetSignals.map((s) => s.shift).join('、')}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 未归属峰 */}
          {!!payload.unassignedPeaks?.length && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">未归属峰</h3>
              <div className="space-y-1 rounded-lg border border-dashed border-slate-300 bg-white/70 p-3">
                {payload.unassignedPeaks.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-700">δ {p.shift}</span>
                    {p.note && <span className="text-slate-400">{p.note}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

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