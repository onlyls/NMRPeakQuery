import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Beaker, Download, FlaskConical, Github, Info, Search, Settings, Sparkles } from 'lucide-react';
import { DEFAULT_TOLERANCE, type NucleusType, type SolventId } from './types/nmr';
import { useDataset, useNameSearch, usePeakSearch } from './hooks/useNMRSearch';
import { DATASET_URL, findSolventSignals } from './utils/searchEngine';
import { parseShifts } from './components/PeakInput';
import SolventSelector from './components/SolventSelector';
import PeakInput from './components/PeakInput';
import ResultTable from './components/ResultTable';
import AiPanel from './components/AiPanel';
import AiSettingsDialog from './components/AiSettingsDialog';
import { SolventSignalsBlock } from './components/ai/Verify';
import { useAiSettings } from './utils/aiSettings';
import { SOURCE_META, SOLVENT_SIGNAL_KIND_LABEL } from './components/bits';

type Mode = 'peak' | 'name' | 'ai';

/** 开源仓库地址 */
const GITHUB_REPO_URL = 'https://github.com/onlyls/NMRPeakQuery';

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: 'peak', label: '按峰位查' },
  { id: 'name', label: '按名称 / CAS 查' },
  { id: 'ai', label: 'AI 助手' },
];

export default function App() {
  const { status, dataset, error } = useDataset();
  const aiSettings = useAiSettings();

  const [mode, setMode] = useState<Mode>('peak');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [solventId, setSolventId] = useState<SolventId | 'all'>('cdcl3');
  const [nucleus, setNucleus] = useState<NucleusType>('1H');
  const [rawText, setRawText] = useState('');
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE['1H']);
  const [nameKeyword, setNameKeyword] = useState('');

  const shifts = useMemo(() => parseShifts(rawText), [rawText]);
  const peakResult = usePeakSearch({ solventId, nucleus, shifts, tolerance });
  const nameHits = useNameSearch(nameKeyword);

  /** 单峰 + 限定溶剂时，提示该峰可能只是溶剂自身信号（残余质子 / 水 / 13C 峰） */
  const solventHints = useMemo(() => {
    if (status !== 'ready' || solventId === 'all' || shifts.length !== 1) return [];
    return findSolventSignals(solventId, nucleus, shifts[0], tolerance);
  }, [status, solventId, nucleus, shifts, tolerance]);

  const switchNucleus = (n: NucleusType) => {
    setNucleus(n);
    setTolerance(DEFAULT_TOLERANCE[n]);
  };

  /** 浏览器端关闭总开关后，AI 入口整体隐藏并退出该模式 */
  useEffect(() => {
    if (!aiSettings.enabled && mode === 'ai') setMode('peak');
  }, [aiSettings.enabled, mode]);

  const modeTabs = aiSettings.enabled ? MODE_TABS : MODE_TABS.filter((t) => t.id !== 'ai');

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">NMRPeakQuery</h1>
            <p className="text-xs text-slate-500">
              核磁残余溶剂与痕量杂质峰查询 · Gottlieb 1997 / Fulmer 2010 / Babij 2016
            </p>
          </div>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            title="查看 GitHub 开源仓库"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Github className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="AI 助手设置"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI 设置</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {status === 'loading' && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-400">
            正在加载文献数据集（约 1.3 MB）……
          </div>
        )}
        {status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
            数据集加载失败：{error}
          </div>
        )}

        {status === 'ready' && (
          <>
            {/* ------------------------------ 模式切换 ------------------------------ */}
            <div className="mb-4 inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
              {modeTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium transition ${
                    mode === t.id
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.id === 'ai' && <Sparkles className="h-3.5 w-3.5" />}
                  {t.label}
                </button>
              ))}
            </div>

            {mode === 'ai' ? (
              <AiPanel onOpenSettings={() => setSettingsOpen(true)} />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                {/* ------------------------------ 查询面板 ------------------------------ */}
                <aside className="lg:sticky lg:top-6 lg:self-start">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    {mode === 'peak' ? (
                      <div className="space-y-4">
                        <SolventSelector value={solventId} onChange={setSolventId} />
                        <SolventSignalsBlock solventId={solventId} nucleus={nucleus} />
                        <PeakInput
                          nucleus={nucleus}
                          onNucleusChange={switchNucleus}
                          rawText={rawText}
                          onRawTextChange={setRawText}
                          tolerance={tolerance}
                          onToleranceChange={setTolerance}
                        />
                        <div className="rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                          输入 1 个峰做单峰匹配；输入多个峰（空格或逗号分隔）自动做多峰协同匹配，
                          峰越多鉴别越准。
                        </div>
                      </div>
                    ) : (
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-500">
                          化合物名称 / 中文名 / CAS
                        </span>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            value={nameKeyword}
                            onChange={(e) => setNameKeyword(e.target.value)}
                            placeholder="如 pyridine / 吡啶 / 110-86-1"
                            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </label>
                    )}
                  </div>
                </aside>

                {/* ------------------------------ 结果区 ------------------------------- */}
                <section className="min-w-0">
                  {mode === 'peak' && solventHints.length > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div className="text-sm">
                          <div className="font-medium text-amber-800">
                            该位移可能是{solventHints.length > 1 ? '溶剂自身信号' : '溶剂自身信号之一'}，
                            而非样品杂质：
                          </div>
                          <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                            {solventHints.map((s, i) => (
                              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-medium">
                                  {SOLVENT_SIGNAL_KIND_LABEL[s.kind]}
                                </span>
                                <span className="font-mono">δ {s.shift}</span>
                                {s.multiplicity && <span>{s.multiplicity}</span>}
                                <span className="text-amber-600/80">Δ {s.deviation.toFixed(3)}</span>
                                {s.temperatureNote && (
                                  <span className="text-amber-600/80">（{s.temperatureNote}）</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === 'peak' ? (
                    shifts.length === 0 ? (
                      <IntroPanel mode="peak" />
                    ) : peakResult.mode === 'single' ? (
                      <>
                        <ResultCount
                          text={`单峰匹配 · ${peakResult.hits.length} 条命中（容差 ±${tolerance} ppm）`}
                        />
                        <ResultTable
                          variant="single"
                          single={peakResult.hits}
                          solventId={solventId}
                          nucleus={nucleus}
                        />
                      </>
                    ) : peakResult.mode === 'multi' ? (
                      <>
                        <ResultCount
                          text={`多峰协同 · ${peakResult.matches.length} 个候选化合物（${shifts.length} 个观测峰，容差 ±${tolerance} ppm）`}
                        />
                        <ResultTable
                          variant="multi"
                          multi={peakResult.matches}
                          solventId={solventId}
                          nucleus={nucleus}
                        />
                      </>
                    ) : null
                  ) : nameKeyword.trim() ? (
                    <>
                      <ResultCount text={`名称检索 · ${nameHits.length} 个化合物`} />
                      <ResultTable
                        variant="name"
                        names={nameHits}
                        solventId={solventId}
                        nucleus={nucleus}
                      />
                    </>
                  ) : (
                    <IntroPanel mode="name" />
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-[11px] leading-relaxed text-slate-400 sm:px-6">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(SOURCE_META) as (keyof typeof SOURCE_META)[]).map((id) => {
              const doi = dataset?.meta.sources.find((s) => s.id === id)?.doi;
              return doi ? (
                <a
                  key={id}
                  href={`https://doi.org/${doi}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={`打开原文：https://doi.org/${doi}`}
                  className="inline-flex items-center gap-1 transition hover:text-sky-600 hover:underline"
                >
                  <Beaker className="h-3 w-3" />
                  {SOURCE_META[id].title}
                </a>
              ) : (
                <span key={id} className="inline-flex items-center gap-1">
                  <Beaker className="h-3 w-3" />
                  {SOURCE_META[id].title}
                </span>
              );
            })}
          </div>
          <div>
            <a
              href={DATASET_URL}
              download="nmr_data_v1.json"
              title="下载完整数据集 JSON"
              className="inline-flex items-center gap-1 font-medium text-sky-600 underline-offset-2 transition hover:underline"
            >
              <Download className="h-3 w-3" />
              数据集 v{dataset?.meta.version ?? '1.0.0'}
            </a>{' '}
            · {dataset?.meta.counts.compounds ?? 87} 个化合物 /{' '}
            {dataset?.meta.counts.signals ?? 0} 条信号 · 冲突值按 2016 {'>'} 2010 {'>'} 1997 取优先级，
            被覆盖的历史值保留在信号的 superseded 记录中。
          </div>
          <div className="flex items-center gap-1">
            <Info className="h-3 w-3" />
            数据仅供实验参考；溶剂峰受温度、浓度、氘代率影响，实际位移可能小幅漂移。
          </div>
        </div>
      </footer>

      <AiSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function ResultCount({ text }: { text: string }) {
  return <div className="mb-2.5 text-xs font-medium text-slate-500">{text}</div>;
}

const INTRO_COPY: Record<'peak' | 'name', { title: string; body: string }> = {
  peak: {
    title: '输入谱图上的峰位，反查可能的杂质',
    body: '选择所用氘代溶剂与核素，把可疑峰的化学位移填入左侧。数据覆盖 12 种氘代溶剂、87 种常见溶剂残留 / 痕量杂质，同时会提示残余质子峰、水峰与 ¹³C 溶剂峰，避免把溶剂自身信号误判为杂质。',
  },
  name: {
    title: '输入化合物名称、中文名或 CAS 号，查看其核磁信号',
    body: '在左侧输入中英文名或 CAS 号，按名称检索 87 种常见溶剂残留 / 痕量杂质，展开即可对照该化合物在 12 种氘代溶剂下的 ¹H / ¹³C 化学位移与峰形归属。',
  },
};

function IntroPanel({ mode }: { mode: 'peak' | 'name' }) {
  const { title, body } = INTRO_COPY[mode];
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-6 py-12">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
          <FlaskConical className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <p className="text-sm leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  );
}