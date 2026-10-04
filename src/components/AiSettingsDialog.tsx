/* ============================================================================
 * AiSettingsDialog.tsx — AI 助手设置弹窗
 *
 * 五部分：
 *   1. 云端配置状态（只读，来自 Cloudflare 环境变量）
 *   2. 浏览器自带 Key（BYOK，存 localStorage，可测试连通性）
 *   3. 能力开关（总开关 + 三项子开关，本地生效）
 *   4. 核验结果缓存（保留策略 + 一键清除）
 *   5. AI Prompt 自定义（追加式指令 + 内置默认 Prompt 预览）
 * ========================================================================== */
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  AI_CAPABILITY_META,
  VERIFY_CACHE_META,
  clearByok,
  updateAiCapability,
  updateAiSettings,
  useAiSettings,
} from '../utils/aiSettings';
import { fetchAiStatus, testDirectConnection } from '../utils/aiClient';
import { MAX_PROMPT_EXTRA_CHARS, defaultSystemPrompt } from '../utils/aiPrompts';
import { clearVerifyCache, countVerifyCache } from '../utils/verifyCache';
import type { AiStatus, AiTask } from '../types/ai';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELD_CLS =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className={`text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>{label}</div>
        {hint && <div className="text-[11px] leading-relaxed text-slate-400">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
          checked ? 'bg-sky-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default function AiSettingsDialog({ open, onClose }: Props) {
  const settings = useAiSettings();
  const [cloud, setCloud] = useState<AiStatus | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testOk, setTestOk] = useState(false);
  const [cacheCount, setCacheCount] = useState(0);
  const [clearedMsg, setClearedMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchAiStatus().then((s) => {
      if (alive) setCloud(s);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCacheCount(countVerifyCache());
    setClearedMsg('');
  }, [open, settings.verifyCache]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setPromptExtra = (id: AiTask, value: string) => {
    updateAiSettings({ promptExtras: { ...settings.promptExtras, [id]: value } });
  };

  async function runTest() {
    setTesting(true);
    setTestMsg('');
    try {
      const model = await testDirectConnection({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      });
      setTestOk(true);
      setTestMsg(`连接成功，端点返回模型：${model}`);
    } catch (e) {
      setTestOk(false);
      setTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  const byokFields = Boolean(settings.baseUrl.trim() || settings.apiKey.trim() || settings.model.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI 助手设置"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">AI 助手设置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-4 py-4">
          {/* ------------------------------ 云端配置 ------------------------------ */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Cloud className="h-3.5 w-3.5 text-sky-600" />
              云端配置（Cloudflare 环境变量）
            </h3>
            {cloud === null ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在检查…
              </div>
            ) : cloud.configured ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  已配置 · 文本模型 {cloud.model}
                </div>
                <div className="mt-0.5 text-emerald-700">
                  视觉模型：{cloud.visionModel ?? '未配置（谱图图片解析不可用）'}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                未配置。自定义部署可在 Cloudflare Pages → Settings → Environment variables
                中设置 <code className="font-mono">AI_BASE_URL</code> /{' '}
                <code className="font-mono">AI_API_KEY</code> / <code className="font-mono">AI_MODEL</code>
                （可选 <code className="font-mono">AI_VISION_MODEL</code>）。
              </div>
            )}
          </section>

          {/* ------------------------------ 浏览器自带 Key ------------------------------ */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <KeyRound className="h-3.5 w-3.5 text-sky-600" />
              浏览器自带 Key（可选，优先于云端配置）
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              仅保存在本机浏览器 localStorage，不上传任何服务器；配置后由浏览器直接请求服务商
              （需服务商允许跨域）。留空则使用云端配置。
            </p>

            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Base URL（OpenAI 兼容）</span>
                <input
                  value={settings.baseUrl}
                  onChange={(e) => updateAiSettings({ baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                  className={FIELD_CLS}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">API Key</span>
                <div className="relative">
                  <input
                    value={settings.apiKey}
                    onChange={(e) => updateAiSettings({ apiKey: e.target.value })}
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    autoComplete="off"
                    className={`${FIELD_CLS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? '隐藏 Key' : '显示 Key'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">文本模型</span>
                  <input
                    value={settings.model}
                    onChange={(e) => updateAiSettings({ model: e.target.value })}
                    placeholder="deepseek-chat"
                    className={FIELD_CLS}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">视觉模型（可选）</span>
                  <input
                    value={settings.visionModel}
                    onChange={(e) => updateAiSettings({ visionModel: e.target.value })}
                    placeholder="用于谱图图片解析"
                    className={FIELD_CLS}
                  />
                </label>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runTest}
                disabled={testing}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                测试连接
              </button>
              {byokFields && (
                <button
                  type="button"
                  onClick={() => {
                    clearByok();
                    setTestMsg('');
                  }}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700"
                >
                  清除浏览器 Key
                </button>
              )}
            </div>
            {testMsg && (
              <div
                className={`mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed ${
                  testOk ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {testOk ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span>{testMsg}</span>
              </div>
            )}
          </section>

          {/* ------------------------------ 能力开关 ------------------------------ */}
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-700">能力开关（本机生效）</h3>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
              <Switch
                checked={settings.enabled}
                onChange={(v) => updateAiSettings({ enabled: v })}
                label="启用 AI 助手"
                hint="关闭后浏览器端整体隐藏 AI 助手入口"
              />
              <div className={settings.enabled ? '' : 'opacity-60'}>
                {AI_CAPABILITY_META.map((m) => (
                  <Switch
                    key={m.id}
                    checked={settings.capabilities[m.id]}
                    onChange={(v) => updateAiCapability(m.id, v)}
                    disabled={!settings.enabled}
                    label={m.label}
                    hint={m.hint}
                  />
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              子开关即使云端已配置 Key 也会生效；关闭的能力不会出现在 AI 助手与查询结果中。
            </p>
          </section>

          {/* ------------------------------ 核验结果缓存 ------------------------------ */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Database className="h-3.5 w-3.5 text-sky-600" />
              核验结果缓存
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              缓存「数据集核验」的 AI 结果：同一化合物 / 溶剂再次核验时直接复用，避免重复请求；
              命中缓存时结果区会提示，并可用「强制更新」重新请求。
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VERIFY_CACHE_META.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  onClick={() => updateAiSettings({ verifyCache: m.id })}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    settings.verifyCache === m.id
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const n = clearVerifyCache();
                  setCacheCount(countVerifyCache());
                  setClearedMsg(`已清除 ${n} 条缓存`);
                }}
                disabled={cacheCount === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清除缓存（{cacheCount} 条）
              </button>
              {clearedMsg && <span className="text-[11px] text-emerald-700">{clearedMsg}</span>}
            </div>
          </section>

          {/* ------------------------------ AI Prompt 自定义 ------------------------------ */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Wand2 className="h-3.5 w-3.5 text-sky-600" />
              AI Prompt 自定义
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              为各功能追加自定义指令（拼接在内置默认 Prompt 之后，上限 {MAX_PROMPT_EXTRA_CHARS}{' '}
              字符）；留空则仅使用内置默认 Prompt，默认规则与 JSON 输出契约不会被改动。
            </p>
            <div className="space-y-3">
              {AI_CAPABILITY_META.map((m) => {
                const value = settings.promptExtras[m.id] ?? '';
                return (
                  <div key={m.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-700">{m.label}</span>
                      {value.trim() && (
                        <button
                          type="button"
                          onClick={() => setPromptExtra(m.id, '')}
                          className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition hover:text-slate-600"
                        >
                          清空该指令
                        </button>
                      )}
                    </div>
                    <textarea
                      value={value}
                      onChange={(e) => setPromptExtra(m.id, e.target.value.slice(0, MAX_PROMPT_EXTRA_CHARS))}
                      rows={3}
                      placeholder="留空则仅使用内置默认 Prompt。例如：优先参考 2010 Fulmer 的数据，并注明不确定度。"
                      className={`${FIELD_CLS} resize-y text-xs`}
                    />
                    <details className="mt-1.5">
                      <summary className="cursor-pointer list-none text-[11px] text-slate-400 transition hover:text-slate-600">
                        查看内置默认 Prompt
                      </summary>
                      <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-500">
                        {defaultSystemPrompt(m.id)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="flex justify-end border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}